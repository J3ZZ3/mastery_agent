import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { z } from "zod";

const attempts = [];
let mode = "fallback";

const rateLimit = (res, model) => {
  res.writeHead(429, { "Content-Type": "application/json", "retry-after": "1" });
  res.end(
    JSON.stringify({
      error: { message: `Rate limit reached for model ${model}. Please try again in 1s.` },
    }),
  );
};

const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const parsed = JSON.parse(body);
  attempts.push(parsed.model);

  if (mode === "allfail" || parsed.model === "primary-model") {
    rateLimit(res, parsed.model);
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      choices: [{ message: { content: '{"message":"from fallback"}' } }],
    }),
  );
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

process.env.AI_PROVIDER = "groq";
process.env.GROQ_BASE_URL = `http://127.0.0.1:${server.address().port}/openai/v1`;
process.env.GROQ_API_KEY = "groq-test-key";
process.env.GROQ_MODEL = "primary-model";
process.env.GROQ_MODEL_FALLBACKS = "fallback-model";
process.env.GROQ_FALLBACK_RETRIES = "0";
process.env.GROQ_TIMEOUT_MS = "2000";

const { groqProvider } = await import("../server/providers/groqProvider.js");
const { ProviderError } = await import("../server/providers/openaiCompatible.js");

test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const call = (provider = groqProvider) =>
  provider.generateJSON({
    schema: z.object({ message: z.string() }),
    example: { message: "shape example only" },
    instructions: "Return the test message.",
    payload: { input: "test" },
    label: "Test Agent",
  });

test("Groq provider falls back to the next model when the primary is rate-limited", async () => {
  mode = "fallback";
  attempts.length = 0;

  const result = await call();

  assert.equal(result.data.message, "from fallback");
  assert.equal(result.meta.model, "fallback-model");
  assert.deepEqual(result.meta.fallbackFrom, ["primary-model"]);
  assert.deepEqual(attempts, ["primary-model", "fallback-model"]);
});

test("Groq provider throws a provider error when every model fails", async () => {
  mode = "allfail";
  attempts.length = 0;

  await assert.rejects(
    () => call(),
    (error) =>
      error instanceof ProviderError && /Every configured Groq model failed/.test(error.message),
  );

  assert.deepEqual(attempts, ["primary-model", "fallback-model"]);
});
