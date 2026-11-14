import { config } from "../config.js";
import { ProviderError } from "./openaiCompatible.js";
import { groqProvider } from "./groqProvider.js";
import { openaiProvider } from "./openaiProvider.js";
import { testProvider } from "./testProvider.js";

/**
 * Provider selection.
 *
 * MASTERY runs on a live language model. The only stubs are:
 *   - `test`, available outside production for the automated test suite;
 *   - `unconfigured`, which always throws, so a missing key is visible
 *     instead of silently returning deterministic data.
 */
const requested = config.aiProvider;

const isProduction = config.nodeEnv === "production";

const unconfiguredProvider = {
  id: "unconfigured",
  label: "No AI provider configured",
  async generateJSON() {
    throw new ProviderError(
      "No AI provider is configured. Set GROQ_API_KEY and AI_PROVIDER=groq in .env, then restart the server.",
    );
  },
};

export const providerStatus = () => {
  if (requested === "groq") {
    const configured = Boolean(config.groq.apiKey);
    return {
      active: "groq",
      requested,
      label: `Groq · ${config.groq.model}`,
      aiConfigured: configured,
      note: configured
        ? "Every agent calls Groq live. There is no deterministic fallback."
        : "AI_PROVIDER=groq but GROQ_API_KEY is missing. Agent calls will fail until the key is set.",
    };
  }

  if (requested === "openai") {
    const configured = Boolean(config.openai.apiKey);
    return {
      active: "openai",
      requested,
      label: `OpenAI-compatible · ${config.openai.model}`,
      aiConfigured: configured,
      note: configured
        ? "Every agent calls the configured chat-completions endpoint live. There is no deterministic fallback."
        : "AI_PROVIDER=openai but OPENAI_API_KEY is missing. Agent calls will fail until the key is set.",
    };
  }

  if (requested === "test" && !isProduction) {
    return {
      active: "test",
      requested,
      label: "Test stub (not a language model)",
      aiConfigured: true,
      note: "AI_PROVIDER=test is a test-only stub. It must never be used in production.",
    };
  }

  return {
    active: "unconfigured",
    requested,
    label: "No AI provider configured",
    aiConfigured: false,
    note: `AI_PROVIDER=${requested} is not a supported provider. Use groq, openai, or test outside production.`,
  };
};

export const getAiProvider = () => {
  const { active } = providerStatus();

  if (active === "groq") return groqProvider;
  if (active === "openai") return openaiProvider;
  if (active === "test") return testProvider;
  return unconfiguredProvider;
};

export { ProviderError };
