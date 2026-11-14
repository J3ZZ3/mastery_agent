import { sleep } from "../lib/async.js";

/**
 * Test-only provider.
 *
 * It returns the JSON shape example supplied by the caller. It exists so the
 * test suite can exercise the orchestration without network access. It can
 * only be selected with `AI_PROVIDER=test`, and `providers/index.js` refuses
 * to select it in production.
 */
export const testProvider = {
  id: "test",
  label: "Test stub (not a language model)",

  async generateJSON({ schema, example, latencyMs = 0 }) {
    if (latencyMs > 0) {
      await sleep(latencyMs);
    }

    const data = schema.parse(example);
    return {
      data,
      meta: {
        provider: "test",
        label: "Test stub (not a language model)",
      },
    };
  },
};
