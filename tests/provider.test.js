import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { z } from "zod";

let behavior = "valid";
let received;
let requestCount = 0;
const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  requestCount += 1;
  received = { url: req.url, authorization: req.headers.authorization, body: JSON.parse(body) };
  if (behavior === "timeout") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write('{"choices":');
    setTimeout(() => res.end("[]}"), 300);
    return;
  }
  if (behavior === "http-error") {
    res.writeHead(401);
    res.end("sensitive provider response");
    return;
  }
  if (behavior === "rate-blocked" || (behavior === "rate-shrink" && requestCount === 1)) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: {
        message:
          behavior === "rate-blocked"
            ? "Rate limit reached for model `test` in organization `org` on tokens per minute (TPM): Limit 8000, Used 7900, Requested 3000."
            : "Rate limit reached for model `test` in organization `org` on tokens per minute (TPM): Limit 8000, Used 7000, Requested 1200.",
      },
    }));
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    choices: [{ message: { content: behavior === "invalid" ? "not JSON" : '{"message":"from model"}' } }],
  }));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
process.env.OPENAI_API_KEY = "local-test-key";
process.env.OPENAI_MODEL = "local-test-model";
process.env.OPENAI_TIMEOUT_MS = "100";
const { openaiProvider } = await import("../server/providers/openaiProvider.js");
const { ProviderError } = await import("../server/providers/openaiCompatible.js");
const args = {
  schema: z.object({ message: z.string() }),
  example: { message: "shape example only" },
  instructions: "Return the test message.",
  payload: { input: "test" },
  label: "Test Agent",
};

test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

test("OpenAI provider sends a server-side request and returns validated model output", async () => {
  behavior = "valid";
  const result = await openaiProvider.generateJSON(args);
  assert.equal(result.data.message, "from model");
  assert.equal(result.meta.provider, "openai");
  assert.equal(result.meta.fallbackUsed, undefined);
  assert.equal(received.url, "/v1/chat/completions");
  assert.equal(received.authorization, "Bearer local-test-key");
  assert.equal(received.body.model, "local-test-model");
});

test("a per-call maxTokens cap overrides the provider default", async () => {
  behavior = "valid";
  await openaiProvider.generateJSON({ ...args, maxTokens: 1400 });
  assert.equal(received.body.max_tokens, 1400);
});

test("a rate limit that cannot fit the request fails fast instead of retrying", async () => {
  behavior = "rate-blocked";
  requestCount = 0;
  await assert.rejects(
    () => openaiProvider.generateJSON({ ...args, maxTokens: 1400 }),
    (error) => error instanceof ProviderError && /HTTP 429/.test(error.message),
  );
  // Retrying a request that is larger than the remaining window only adds
  // pressure, so exactly one attempt is made.
  assert.equal(requestCount, 1);
});

test("a rate limit shrinks the completion budget to what is left in the window", async () => {
  behavior = "rate-shrink";
  requestCount = 0;
  const result = await openaiProvider.generateJSON({ ...args, maxTokens: 1400 });
  assert.equal(result.data.message, "from model");
  assert.equal(requestCount, 2);
  assert.ok(received.body.max_tokens < 1400);
});

test("an invalid model response throws instead of returning the example", async () => {
  behavior = "invalid";
  await assert.rejects(
    () => openaiProvider.generateJSON(args),
    (error) => error instanceof ProviderError && /did not return a JSON object/.test(error.message),
  );
});

test("an HTTP error is reported without leaking the provider body", async () => {
  behavior = "http-error";
  await assert.rejects(
    () => openaiProvider.generateJSON(args),
    (error) =>
      error instanceof ProviderError &&
      /HTTP 401/.test(error.message) &&
      !/sensitive provider response/.test(error.message),
  );
});

test("a timeout throws a provider error", async () => {
  behavior = "timeout";
  await assert.rejects(
    () => openaiProvider.generateJSON(args),
    (error) => error instanceof ProviderError && /timed out/.test(error.message),
  );
});
