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
  aiProvider: (process.env.AI_PROVIDER || "demo").toLowerCase(),
  masteryThreshold: asNumber(process.env.MASTERY_THRESHOLD, 80),
  demoDelayMs: asNumber(process.env.DEMO_DELAY_MS, 450),
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

  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    timeoutMs: asNumber(process.env.OPENAI_TIMEOUT_MS, 18000),
  },
};
