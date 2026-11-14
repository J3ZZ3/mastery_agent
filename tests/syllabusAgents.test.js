import test from "node:test";
import assert from "node:assert/strict";
import {
  agentSchemas,
  runSyllabusAgents,
} from "../server/agents/syllabusAgents.js";
import { ProviderError } from "../server/providers/openaiCompatible.js";

/**
 * A scripted provider that plays the role of the model. It lets the test drive
 * a full multi-agent run deterministically: Scout decides a strategy, the
 * Architect drafts an outline with one wrong page, the Verifier catches it,
 * the Architect corrects it, the Verifier approves, and the Planner schedules.
 */
const scriptedProvider = (script) => {
  const remaining = [...script];
  return {
    id: "scripted",
    async generateJSON({ schema, label }) {
      const index = remaining.findIndex(
        (item) => item.label === label && item.schema === schema,
      );
      if (index === -1) {
        throw new ProviderError(`No scripted response for ${label}.`);
      }
      const [item] = remaining.splice(index, 1);
      return {
        data: schema.parse(item.data),
        meta: { provider: "scripted" },
      };
    },
  };
};

const buildDocument = () => ({
  kind: "pdf",
  pageCount: 7,
  needsOcr: false,
  tocEntries: [
    { title: "Chapter 1: Whole numbers", printedPage: 1 },
    { title: "Chapter 2: Algebra", printedPage: 4 },
  ],
  outline: [
    { title: "Chapter 1: Whole numbers", level: 1, page: 3 },
    { title: "1.1 Place value", level: 2, page: 4 },
    { title: "1.2 Ordering numbers", level: 2, page: 5 },
    { title: "Chapter 2: Algebra", level: 1, page: 6 },
    { title: "2.1 Variables", level: 2, page: 7 },
  ],
  pages: [
    { page: 1, text: "MATHEMATICS Grade 9 Learner Book" },
    { page: 2, text: "Table of contents Chapter 1: Whole numbers 1" },
    { page: 3, text: "Chapter 1 Whole numbers 1.1 Place value 4 1.2 Ordering numbers 5" },
    { page: 4, text: "1.1 Place value Each digit has a value." },
    { page: 5, text: "1.2 Ordering numbers We compare from left to right." },
    { page: 6, text: "Chapter 2 Algebra 2.1 Variables 7" },
    { page: 7, text: "2.1 Variables A variable stands for an unknown number." },
  ],
});

const draftWithMistake = [
  { title: "Chapter 1: Whole numbers", level: 1, page: 3 },
  { title: "1.1 Place value", level: 2, page: 5 },
  { title: "1.2 Ordering numbers", level: 2, page: 5 },
  { title: "Chapter 2: Algebra", level: 1, page: 6 },
  { title: "2.1 Variables", level: 2, page: 7 },
];

const correctedOutline = [
  { title: "Chapter 1: Whole numbers", level: 1, page: 3 },
  { title: "1.1 Place value", level: 2, page: 4 },
  { title: "1.2 Ordering numbers", level: 2, page: 5 },
  { title: "Chapter 2: Algebra", level: 1, page: 6 },
  { title: "2.1 Variables", level: 2, page: 7 },
];

const scheme = {
  summary: "Two chapters over two terms.",
  terms: [
    {
      term: "Term 1",
      weeks: [
        {
          week: 1,
          focus: "Whole numbers",
          pages: "p3-p5",
          assessment: "Exit ticket on place value.",
        },
      ],
    },
    {
      term: "Term 2",
      weeks: [
        {
          week: 1,
          focus: "Algebra",
          pages: "p6-p7",
          assessment: "Short mastery check.",
        },
      ],
    },
  ],
  misconceptions: ["Reading a digit's value from its face value."],
};

const script = [
  {
    label: "Scout Agent",
    schema: agentSchemas.stepSchema,
    data: { thought: "I will check the contents page.", action: "finish", args: {} },
  },
  {
    label: "Scout Agent",
    schema: agentSchemas.scoutSchema,
    data: {
      approach: "contents",
      offset: 2,
      focusPages: [2, 3],
      reasoning: "The contents list is reliable and printed pages are offset by +2.",
    },
  },
  {
    label: "Architect Agent",
    schema: agentSchemas.stepSchema,
    data: {
      thought: "I need to confirm where section 1.1 starts.",
      action: "read_pages",
      args: { from: 4, to: 4 },
    },
  },
  {
    label: "Architect Agent",
    schema: agentSchemas.stepSchema,
    data: { thought: "I have enough to draft.", action: "finish", args: {} },
  },
  {
    label: "Architect Agent",
    schema: agentSchemas.outlineSchema,
    data: { outline: draftWithMistake, reasoning: "Drafted from the contents list." },
  },
  {
    label: "Verifier Agent",
    schema: agentSchemas.stepSchema,
    data: { thought: "I will check the suspect page.", action: "finish", args: {} },
  },
  {
    label: "Verifier Agent",
    schema: agentSchemas.verdictSchema,
    data: {
      approved: false,
      reasoning: "Section 1.1 is mapped to page 5 but starts on page 4.",
      issues: [
        {
          title: "1.1 Place value",
          page: 5,
          problem: "Page 5 starts section 1.2, not 1.1.",
        },
      ],
    },
  },
  {
    label: "Architect Agent",
    schema: agentSchemas.stepSchema,
    data: { thought: "Applying the correction.", action: "finish", args: {} },
  },
  {
    label: "Architect Agent",
    schema: agentSchemas.outlineSchema,
    data: { outline: correctedOutline, reasoning: "Moved 1.1 to page 4." },
  },
  {
    label: "Verifier Agent",
    schema: agentSchemas.stepSchema,
    data: { thought: "Re-checking.", action: "finish", args: {} },
  },
  {
    label: "Verifier Agent",
    schema: agentSchemas.verdictSchema,
    data: { approved: true, reasoning: "Every entry now matches its page.", issues: [] },
  },
  {
    label: "Planner Agent",
    schema: agentSchemas.schemeSchema,
    data: scheme,
  },
];

test("agents scout, draft, self-correct and plan across multiple roles", async () => {
  const events = [];
  const result = await runSyllabusAgents({
    document: buildDocument(),
    provider: scriptedProvider(script),
    onEvent: (event) => events.push(event),
  });

  const agents = new Set(result.trace.map((event) => event.agent));
  assert.ok(agents.has("Scout Agent"));
  assert.ok(agents.has("Architect Agent"));
  assert.ok(agents.has("Verifier Agent"));
  assert.ok(agents.has("Planner Agent"));

  // The agent chose a tool rather than following a fixed pipeline.
  assert.ok(result.trace.some((event) => event.kind === "action" && event.tool === "read_pages"));

  // Self-correction: the first verdict rejected, the second approved.
  const verdicts = result.trace.filter((event) => event.kind === "verdict");
  assert.equal(verdicts.length, 2);
  assert.equal(verdicts[0].approved, false);
  assert.equal(verdicts[1].approved, true);

  // The bad page was corrected from 5 to 4.
  assert.deepEqual(
    result.outline.find((entry) => entry.title === "1.1 Place value"),
    { title: "1.1 Place value", level: 2, page: 4 },
  );

  // Work was handed between agents.
  assert.ok(result.trace.filter((event) => event.kind === "handoff").length >= 3);

  // The planner produced a real scheme of work.
  assert.equal(result.scheme.terms.length, 2);
  assert.equal(result.scheme.terms[0].weeks[0].pages, "p3-p5");

  // The live listener saw the same events that were stored.
  assert.deepEqual(events, result.trace);
});

test("a provider failure aborts the run instead of returning deterministic data", async () => {
  const failingProvider = {
    id: "failing",
    async generateJSON() {
      throw new ProviderError("Groq rejected the request with HTTP 429.");
    },
  };

  await assert.rejects(
    () =>
      runSyllabusAgents({
        document: buildDocument(),
        provider: failingProvider,
      }),
    (error) =>
      error instanceof ProviderError && /HTTP 429/.test(error.message),
  );
});
