/**
 * Errors raised by an AI provider.
 *
 * These are deliberately safe to show to a teacher: they never include the
 * provider's response body or the API key. `expose` lets the HTTP error
 * handler show the message instead of the generic "Unexpected server error".
 */
export class ProviderError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProviderError";
    this.status = 502;
    this.expose = true;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const extractJson = (content) => {
  if (typeof content !== "string") {
    throw new ProviderError("The AI provider returned an empty response.");
  }

  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new ProviderError("The AI provider did not return a JSON object.");
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new ProviderError("The AI provider returned malformed JSON.");
  }
};

/** Read a safe, short error message from the provider response. */
const readErrorDetail = async (response) => {
  try {
    const text = await response.text();
    try {
      const body = JSON.parse(text);
      // Some gateways (e.g. Gemini's OpenAI-compatible endpoint) wrap errors in
      // an array: [{ error: { message } }].
      const error = Array.isArray(body) ? body[0]?.error : body?.error;
      return String(error?.message || "").slice(0, 500);
    } catch {
      return "";
    }
  } catch {
    return "";
  }
};

/** How long to wait before retrying a rate-limited request. */
const retryDelayMs = (response, detail, attempt) => {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) {
    return Math.min(header * 1000 + 500, 65000);
  }

  const seconds = Number(detail.match(/try again in ([\d.]+)s/i)?.[1]);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000 + 1500, 90000);
  }

  return Math.min(3000 * 2 ** attempt, 30000);
};

/**
 * Build a strict OpenAI-compatible chat-completions provider (Groq, OpenAI,
 * or any compatible endpoint).
 *
 * There is no deterministic fallback: if the model is unavailable or returns
 * invalid output, `generateJSON` throws a ProviderError. The caller decides
 * how to surface that. `example` is the object shown to the model so it knows
 * the required JSON shape; it is never returned in place of model output.
 *
 * Transient rate limits (HTTP 429) and server errors are retried with the
 * provider's own backoff hint. This is a network retry, not a data fallback:
 * if the retries are exhausted the call still fails.
 */
export const createOpenAiCompatibleProvider = ({
  id,
  label,
  baseUrl,
  apiKey,
  model,
  timeoutMs,
  maxRetries = 12,
  maxTokens = 900,
}) => ({
  id,
  label,

  async generateJSON({ schema, example, instructions, payload, label: agentLabel }) {
    if (!apiKey) {
      throw new ProviderError(
        `${id} is selected but no API key is configured. Add the key to .env and restart the server.`,
      );
    }

    const startedAt = Date.now();
    const systemContent = [
      `You are the ${agentLabel} inside MASTERY, a learning recovery system for Grade 8-9 mathematics.`,
      "Return one JSON object only. Do not wrap it in markdown or code fences.",
      "Do not use the function-calling or tool-calling API. Express every action as fields inside the JSON object.",
      "Follow the exact structure of the example object.",
      "Keep language concise, supportive and evidence-based.",
      "Never label a learner permanently or claim certainty beyond the evidence.",
      instructions,
    ]
      .filter(Boolean)
      .join("\n");

    const userContent =
      `Input data:\n${JSON.stringify(payload)}\n\n` +
      `Required JSON shape example:\n${JSON.stringify(example)}`;

    const baseBody = {
      model,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ],
    };

    const attempts = [
      { body: { ...baseBody, response_format: { type: "json_object" } } },
      { body: { ...baseBody } },
    ];

    for (let mode = 0; mode < attempts.length; mode += 1) {
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const body = JSON.stringify(attempts[mode].body);
        let response;

        try {
          response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            signal: AbortSignal.timeout(timeoutMs),
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body,
          });
        } catch (error) {
          if (error.name === "TimeoutError" || error.name === "AbortError") {
            throw new ProviderError(
              `The ${id} request timed out after ${Math.round(timeoutMs / 1000)}s.`,
            );
          }
          throw new ProviderError(`Could not reach ${id}. Check the network and base URL.`);
        }

        if (response.ok) {
          let parsed;
          try {
            parsed = await response.json();
          } catch (error) {
            if (error.name === "TimeoutError" || error.name === "AbortError") {
              throw new ProviderError(
                `The ${id} request timed out after ${Math.round(timeoutMs / 1000)}s.`,
              );
            }
            throw new ProviderError(`The ${id} response was not valid JSON.`);
          }

          const content = parsed?.choices?.[0]?.message?.content;
          let data;
          try {
            data = schema.parse(extractJson(content));
          } catch (error) {
            // JSON extraction failures mean the response wasn't usable at all;
            // schema failures can be a transient formatting slip from the model.
            if (error instanceof ProviderError) {
              if (attempt < maxRetries) {
                await sleep(1500);
                continue;
              }
              if (mode + 1 < attempts.length) break;
              throw error;
            }
            if (attempt < maxRetries) {
              await sleep(1500);
              continue;
            }
            if (mode + 1 < attempts.length) break;
            throw new ProviderError(
              `The ${id} response did not match the required structure for ${agentLabel}.`,
            );
          }

          return {
            data,
            meta: {
              provider: id,
              label,
              durationMs: Date.now() - startedAt,
            },
          };
        }

        const detail = await readErrorDetail(response);
        const retryableStatus = response.status === 429 || response.status >= 500;
        const outputTooLarge =
          response.status === 429 &&
          /request too large|reduce max_tokens|exceeds the enforced limit/i.test(detail);
        const jsonModeIssue =
          response.status === 400 &&
          /json|response_format|failed_generation|schema/i.test(detail);

        // A per-day quota will not clear within a retry window. Fail fast with
        // a clear message instead of retrying for several minutes.
        const dailyQuota =
          response.status === 429 && /per day|requests per day|daily/i.test(detail);
        if (dailyQuota) {
          throw new ProviderError(
            `${id} has reached the daily request quota for ${model}. Wait for the quota to reset or switch to another model, then try again.`,
          );
        }

        // Output-token cap errors won't resolve by waiting alone; retry once with
        // a smaller cap if possible.
        if (outputTooLarge && attempt === 0) {
          const reduced = Math.max(512, Math.floor(maxTokens * 0.7));
          if (reduced < maxTokens) {
            attempts[mode].body.max_tokens = reduced;
            // also apply to other mode
            for (const a of attempts) a.body.max_tokens = reduced;
            await sleep(1000);
            continue;
          }
        }

        if (retryableStatus && attempt < maxRetries) {
          const wait = response.status === 429 ? retryDelayMs(response, detail, attempt) : retryDelayMs(response, detail, attempt);
          await sleep(wait);
          continue;
        }

        // Some models reject JSON mode/settings; fall back to a plain request.
        if (jsonModeIssue && mode + 1 < attempts.length) {
          break;
        }

        throw new ProviderError(
          `${id} rejected the request with HTTP ${response.status}.${
            detail ? ` ${detail}` : " Check the API key, model name and rate limit."
          }`,
        );
      }
    }

    throw new ProviderError(`${id} could not complete the request.`);
  },
});
