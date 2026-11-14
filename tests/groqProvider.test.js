import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { z } from "zod";

let received;
const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  received = {
    url: req.url,
    authorization: req.headers.authorization,
    body: JSON.parse(body),
  };
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      choices: [{ message: { content: '{"message":"from groq"}' } }],
    }),
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

process.env.AI_PROVIDER = "groq";
process.env.GROQ_BASE_URL = `http://127.0.0.1:${server.address().port}/openai/v1`;
process.env.GROQ_API_KEY = "groq-test-key";
process.env.GROQ_MODEL = "llama-test-model";
process.env.GROQ_TIMEOUT_MS = "2000";

const { groqProvider } = await import("../server/providers/groqProvider.js");

test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

test("Groq provider uses the Groq base URL, key and model", async () => {
  const result = await groqProvider.generateJSON({
    schema: z.object({ message: z.string() }),
    example: { message: "shape example only" },
    instructions: "Return the test message.",
    payload: { input: "test" },
    label: "Test Agent",
  });

  assert.equal(result.data.message, "from groq");
  assert.equal(result.meta.provider, "groq");
  assert.equal(received.url, "/openai/v1/chat/completions");
  assert.equal(received.authorization, "Bearer groq-test-key");
  assert.equal(received.body.model, "llama-test-model");
  assert.equal(received.body.response_format.type, "json_object");
});
