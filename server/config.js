import "dotenv/config";

const asNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asBoolean = (value, fallback) => {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const asList = (value, fallback) =>
  String(value || fallback)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const nodeEnv = process.env.NODE_ENV || "development";
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

export const config = {
  nodeEnv,
  port: asNumber(process.env.PORT, 8787),
  clientOrigin,
  // The platform runs on a live model. There is no deterministic demo engine:
  // if the selected provider is unreachable the agent call fails loudly.
  aiProvider: (process.env.AI_PROVIDER || "groq").toLowerCase(),
  masteryThreshold: asNumber(process.env.MASTERY_THRESHOLD, 80),
  maxAttempts: 2,
  corsOrigins: asList(process.env.CORS_ORIGINS, clientOrigin),

  // Classroom tenancy (Postgres). When DATABASE_URL is empty the demo keeps
  // working from the JSON store and classroom routes return 503.
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl:
    process.env.DATABASE_SSL === undefined
      ? undefined
      : asBoolean(process.env.DATABASE_SSL, false),
  databasePoolMax: asNumber(process.env.DATABASE_POOL_MAX, 10),
  sessionTtlDays: asNumber(process.env.SESSION_TTL_DAYS, 30),
  studentSessionHours: asNumber(process.env.STUDENT_SESSION_HOURS, 12),
  sessionCookieSecure: asBoolean(process.env.SESSION_COOKIE_SECURE, nodeEnv === "production"),
  teacherSignupOpen: asBoolean(process.env.TEACHER_SIGNUP_OPEN, true),

  // Absolute origin used in emailed links (password reset, verification).
  appOrigin: (process.env.APP_ORIGIN || clientOrigin).replace(/\/$/, ""),
  requireTeacherEmailVerification: asBoolean(
    process.env.REQUIRE_TEACHER_EMAIL_VERIFICATION,
    false,
  ),

  // Teacher account lifecycle. "console" prints the message to the server log,
  // which is enough for a pilot; use "resend" for real delivery.
  emailDelivery: (process.env.EMAIL_DELIVERY || "console").toLowerCase(),
  emailFrom: process.env.EMAIL_FROM || "MASTERY <no-reply@localhost>",
  resendApiKey: process.env.RESEND_API_KEY || "",
  passwordResetTtlMinutes: asNumber(process.env.PASSWORD_RESET_TTL_MINUTES, 30),
  emailVerificationTtlHours: asNumber(process.env.EMAIL_VERIFICATION_TTL_HOURS, 48),

  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    baseUrl: (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, ""),
    model: process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
    timeoutMs: asNumber(process.env.GROQ_TIMEOUT_MS, 60000),
    // Free-tier Groq models have a low output-tokens-per-minute cap. qwen
    // (1000 OTPM) cannot fit the intervention JSON, while gpt-oss models can.
    maxTokens: asNumber(process.env.GROQ_MAX_TOKENS, 900),
  },

  // Optional OpenAI-compatible endpoint, kept so the same code can point at
  // OpenAI, a local llama.cpp server or another compatible gateway.
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    timeoutMs: asNumber(process.env.OPENAI_TIMEOUT_MS, 60000),
    // Reasoning models (e.g. Gemini) spend part of the completion budget on
    // internal thinking, so a low cap truncates the JSON. Groq keeps its own
    // smaller cap to stay inside free-tier token limits.
    maxTokens: asNumber(process.env.OPENAI_MAX_TOKENS, 3000),
  },
};
