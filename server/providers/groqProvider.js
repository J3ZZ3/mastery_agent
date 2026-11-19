import { config } from "../config.js";
import { createOpenAiCompatibleProvider, ProviderError } from "./openaiCompatible.js";

/**
 * Groq provider with an automatic model fallback chain.
 *
 * Groq exposes an OpenAI-compatible chat-completions API, so the strict
 * factory in `openaiCompatible.js` does the work. Each configured model is
 * tried in order: if the primary model is rate-limited (429) or the request
 * fails, the next model is used. This is a live-model failover, not a
 * deterministic fallback: if every model fails the run still throws.
 */
const models = config.groq.models || [config.groq.model];

// Only the gpt-oss models accept `reasoning_effort`; sending it to a
// non-reasoning model is rejected by Groq.
const supportsReasoningEffort = (model) => /gpt-oss/i.test(model);

const providers = models.map((model) =>
  createOpenAiCompatibleProvider({
    id: "groq",
    label: `Groq · ${model}`,
    baseUrl: config.groq.baseUrl,
    apiKey: config.groq.apiKey,
    model,
    timeoutMs: config.groq.timeoutMs,
    maxTokens: config.groq.maxTokens,
    maxRetries: config.groq.fallbackRetries,
    reasoningEffort: supportsReasoningEffort(model) ? config.groq.reasoningEffort : null,
    // Groq's TPM limit is per model and clears on a rolling window. Honour its
    // retry hint (often 10-30s) instead of giving up early and burning the
    // next model's budget too.
    retryDelayCapMs: 30000,
  }),
);

export const groqProvider = {
  id: "groq",
  label: providers.length > 1 ? `Groq · ${models.join(" → ")}` : providers[0].label,
  models,

  async generateJSON(options) {
    const failures = [];

    for (const [index, provider] of providers.entries()) {
      try {
        const result = await provider.generateJSON(options);
        return {
          ...result,
          meta: {
            ...result.meta,
            model: models[index],
            ...(index > 0 ? { fallbackFrom: models.slice(0, index) } : {}),
          },
        };
      } catch (error) {
        failures.push(`${models[index]}: ${error.message}`);
      }
    }

    throw new ProviderError(
      `Every configured Groq model failed. ${failures.join(" | ")}`,
    );
  },
};
