/**
 * Provider failures (rate limits, outages, malformed model output) are
 * operational, not something a learner can act on. Keep provider internals —
 * organisation ids, billing/upgrade links, raw HTTP statuses — out of the
 * student UI while the full detail stays in the server log.
 */
export const AGENTS_BUSY_MESSAGE =
  "The learning agents are briefly busy and could not finish this step. Your answers are saved — try again in a minute.";

export const isProviderFailure = (error) =>
  error?.name === "ProviderError" ||
  error?.status === 429 ||
  (typeof error?.status === "number" && error.status >= 502 && error.status <= 504);

export function friendlyAgentMessage(error) {
  return isProviderFailure(error) ? AGENTS_BUSY_MESSAGE : error.message;
}

// Safety net for errors stored before this module existed, or for provider
// text that reaches the serializer through another path.
const PROVIDER_TEXT =
  /every configured .* model failed|rejected the request with http \d+|rate limit|tokens per minute|try again in [\d.]+s|upgrade to .*tier|billing|console\.groq\.com|api key/i;

export function sanitizeAgentError(message) {
  if (!message) return message || null;
  return PROVIDER_TEXT.test(message) ? AGENTS_BUSY_MESSAGE : message;
}
