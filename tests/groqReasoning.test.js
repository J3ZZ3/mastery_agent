import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { z } from "zod";

const received = [];
let primaryLimited = false;

const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const parsed = JSON.parse(body);
  received.push(parsed);

  if (primaryLimited && parsed.model === "openai/gpt-oss-120b") {
    res.writeHead(429, { "Content-Type": "application/json", "retry-after": "1" });
    res.end(
      JSON.stringify({
        error: {
          message:
            "Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Used 7900, Requested 3000.",
        },
      }),
    );
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ choices: [{ message: { content: '{"message":"ok"}' } }] }));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

process.env.AI_PROVIDER = "groq";
process.env.GROQ_BASE_URL = `http://127.0.0.1:${server.address().port}/openai/v1`;
process.env.GROQ_API_KEY = "groq-test-key";
process.env.GROQ_MODEL = "openai/gpt-oss-120b";
process.env.GROQ_MODEL_FALLBACKS = "allam-2-7b";
process.env.GROQ_FALLBACK_RETRIES = "0";
process.env.GROQ_TIMEOUT_MS = "2000";

const { groqProvider } = await import("../server/providers/groqProvider.js");

test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const call = () =>
  groqProvider.generateJSON({
    schema: z.object({ message: z.string() }),
    example: { message: "shape example only" },
    instructions: "Return the test message.",
    payload: { input: "test" },
    label: "Test Agent",
  });

test("a reasoning model is asked for low effort so the JSON output is not truncated", async () => {
  primaryLimited = false;
  received.length = 0;

  const result = await call();

  assert.equal(result.data.message, "ok");
  assert.equal(received[0].model, "openai/gpt-oss-120b");
  assert.equal(received[0].reasoning_effort, "low");
});

test("a model without reasoning support is sent no reasoning_effort field", async () => {
  primaryLimited = true;
  received.length = 0;

  const result = await call();

  assert.equal(result.meta.model, "allam-2-7b");
  const fallback = received.find((body) => body.model === "allam-2-7b");
  assert.ok(fallback);
  assert.equal(fallback.reasoning_effort, undefined);
});
