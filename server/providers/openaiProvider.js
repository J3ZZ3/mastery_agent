import { config } from "../config.js";
import { createOpenAiCompatibleProvider } from "./openaiCompatible.js";

/**
 * OpenAI-compatible provider.
 *
 * This is the same strict factory Groq uses. It is useful for pointing the
 * platform at OpenAI, a local llama.cpp/ollama server, or any other
 * chat-completions compatible gateway via OPENAI_BASE_URL.
 */
export const openaiProvider = createOpenAiCompatibleProvider({
  id: "openai",
  label: `OpenAI-compatible · ${config.openai.model}`,
  baseUrl: config.openai.baseUrl,
  apiKey: config.openai.apiKey,
  model: config.openai.model,
  timeoutMs: config.openai.timeoutMs,
  maxTokens: config.openai.maxTokens,
});
