import { config } from "../config.js";
import { createOpenAiCompatibleProvider } from "./openaiCompatible.js";

/**
 * Groq provider.
 *
 * Groq exposes an OpenAI-compatible chat-completions API, so the strict
 * factory in `openaiCompatible.js` does the work. There is no fallback: if the
 * request fails the agent run fails with a ProviderError.
 */
export const groqProvider = createOpenAiCompatibleProvider({
  id: "groq",
  label: `Groq · ${config.groq.model}`,
  baseUrl: config.groq.baseUrl,
  apiKey: config.groq.apiKey,
  model: config.groq.model,
  timeoutMs: config.groq.timeoutMs,
  maxTokens: config.groq.maxTokens,
});
