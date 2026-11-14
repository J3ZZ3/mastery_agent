import { query } from "../db/postgres.js";
import { AppError } from "../lib/errors.js";
import { newId } from "../lib/id.js";
import { runSyllabusAgents } from "../agents/syllabusAgents.js";
import { getResourceDocument, saveResourceOutline } from "./planService.js";
import { providerStatus } from "../providers/index.js";

/**
 * Persistence and execution for observable agent runs.
 *
 * A run is created immediately (status "running") and executed in the
 * background. Every agent event is appended to the `trace` jsonb column as it
 * happens, so the teacher UI can poll and watch the agents think, call tools
 * and hand work to each other.
 */

const RUN_SELECT = `
  select id, slot, status, goal, provider, provider_label, trace, result,
         error, created_at, updated_at
    from agent_runs
`;

const runDto = (row) => ({
  id: row.id,
  slot: row.slot,
  status: row.status,
  goal: row.goal,
  provider: row.provider,
  providerLabel: row.provider_label,
  trace: Array.isArray(row.trace) ? row.trace : [],
  result: row.result || null,
  error: row.error || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const assertSlot = (slot) => {
  if (slot !== "student-book" && slot !== "teachers-guide") {
    throw new AppError(400, "Unknown resource slot.");
  }
};

export async function createAgentRun(teacherId, slot, goal = null) {
  assertSlot(slot);
  const id = newId("run");
  const status = providerStatus();

  const { rows } = await query(
    `insert into agent_runs (id, teacher_id, slot, status, goal, provider, provider_label)
     values ($1, $2, $3, 'running', $4, $5, $6)
     returning id, slot, status, goal, provider, provider_label, trace, result,
               error, created_at, updated_at`,
    [id, teacherId, slot, goal, status.active, status.label],
  );

  return runDto(rows[0]);
}

export async function getAgentRun(teacherId, runId) {
  const { rows } = await query(
    `${RUN_SELECT} where id = $1 and teacher_id = $2`,
    [runId, teacherId],
  );
  if (!rows[0]) throw new AppError(404, "Agent run not found.");
  return runDto(rows[0]);
}

export async function listAgentRuns(teacherId, limit = 20) {
  const { rows } = await query(
    `${RUN_SELECT} where teacher_id = $1 order by created_at desc limit $2`,
    [teacherId, Math.min(Math.max(Number(limit) || 20, 1), 50)],
  );
  return rows.map(runDto);
}

/**
 * Execute a run. Each event is appended to the stored trace so polling clients
 * see progress instead of waiting for one big response.
 */
export async function executeAgentRun({ teacherId, runId, slot }) {
  let queue = Promise.resolve();

  const append = (event) => {
    queue = queue
      .then(() =>
        query(
          `update agent_runs
              set trace = trace || $2::jsonb,
                  updated_at = now()
            where id = $1`,
          [runId, JSON.stringify([event])],
        ),
      )
      .catch(() => {
        // Losing a progress event must not abort the analysis.
      });
  };

  try {
    const document = await getResourceDocument(teacherId, slot);
    const result = await runSyllabusAgents({ document, onEvent: append });
    await queue;

    await saveResourceOutline(teacherId, slot, result.outline);

    await query(
      `update agent_runs
          set status = $2,
              result = $3::jsonb,
              provider = $4,
              provider_label = $5,
              trace = $6::jsonb,
              updated_at = now()
        where id = $1`,
      [
        runId,
        result.needsOcr ? "needs_ocr" : "complete",
        JSON.stringify({
          outline: result.outline,
          scheme: result.scheme,
          scout: result.scout,
          verdict: result.verdict,
          needsOcr: result.needsOcr,
        }),
        result.provider.active,
        result.provider.label,
        JSON.stringify(result.trace),
      ],
    );

    return result;
  } catch (error) {
    await queue;
    await query(
      `update agent_runs
          set status = 'failed', error = $2, updated_at = now()
        where id = $1`,
      [runId, error.message],
    );
    throw error;
  }
}

/** Create a run and start it without blocking the HTTP response. */
export async function startAgentRun(teacherId, slot, goal = null) {
  const run = await createAgentRun(teacherId, slot, goal);
  setImmediate(() => {
    void executeAgentRun({ teacherId, runId: run.id, slot }).catch((error) => {
      console.error("[MASTERY] Agent run failed:", error.message);
    });
  });
  return run;
}
