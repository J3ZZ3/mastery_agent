import { z } from "zod";
import { getAiProvider, providerStatus } from "../providers/index.js";

/**
 * Multi-agent syllabus analysis for an uploaded textbook.
 *
 * This is a real agent pipeline, not a single prompt:
 *
 *   Scout      inspects the document and decides how the outline should be built
 *   Architect  drafts chapters/topics/subtopics with page numbers
 *   Verifier   checks every page reference against the actual page text
 *   Architect  revises using the Verifier's issues (self-correction)
 *   Planner    turns the verified outline into a term/week scheme of work
 *
 * Agents do not follow a fixed script. Each one runs a small ReAct loop:
 * it thinks, chooses a tool (read pages / search / finish), observes the
 * result, and decides what to do next. Every thought, action, observation and
 * handoff is emitted through `onEvent` so the teacher can watch it reason.
 *
 * Every step is a live model call. There is no deterministic result to fall
 * back to: if the provider fails, the run fails with a visible error.
 */

const MAX_OUTLINE_ENTRIES = 150;
const MAX_READ_PAGES = 3;
const PAGE_TEXT_LIMIT = 1400;

const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const median = (numbers) => {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const titleKey = (value) =>
  normalize(value)
    .toLowerCase()
    .replace(/^\d+(?:\.\d+)*\s*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/* ------------------------------------------------------------------ *
 * Tools the agents can call
 * ------------------------------------------------------------------ */

const createToolbox = (document) => {
  const pages = [...(document.pages || [])].sort((a, b) => a.page - b.page);
  const byPage = new Map(pages.map((page) => [page.page, page.text || ""]));
  const lastPage = pages.length > 0 ? pages[pages.length - 1].page : 1;

  return {
    lastPage,

    readPages(args = {}) {
      const from = clamp(Number(args.from) || 1, 1, lastPage);
      const requestedTo = clamp(Number(args.to) || from, from, from + MAX_READ_PAGES - 1);
      const to = Math.min(requestedTo, lastPage);

      const result = [];
      for (let page = from; page <= to; page += 1) {
        result.push({
          page,
          text: (byPage.get(page) || "").slice(0, PAGE_TEXT_LIMIT),
        });
      }
      return { from, to, pages: result };
    },

    search(args = {}) {
      const query = normalize(args.query);
      const terms = query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length > 2);
      if (terms.length === 0) return { query, hits: [] };

      const hits = [];
      for (const page of pages) {
        const lower = (page.text || "").toLowerCase();
        if (!terms.every((term) => lower.includes(term))) continue;

        const line = (page.text || "")
          .split("\n")
          .find((candidate) =>
            terms.some((term) => candidate.toLowerCase().includes(term)),
          );
        hits.push({ page: page.page, snippet: normalize(line).slice(0, 180) });
        if (hits.length >= 8) break;
      }
      return { query, hits };
    },
  };
};

/**
 * Printed page numbers are usually offset from PDF page indices. Compare the
 * book's contents entries with the chapter pages the extractor already found.
 */
const estimatePrintedOffset = (document) => {
  const contents = document.tocEntries || [];
  const outline = document.outline || [];
  if (contents.length === 0 || outline.length === 0) return 0;

  const byTitle = new Map();
  for (const entry of outline) {
    const key = titleKey(entry.title);
    if (key && !byTitle.has(key)) byTitle.set(key, entry);
  }

  const votes = [];
  for (const entry of contents) {
    const key = titleKey(entry.title);
    const match = key ? byTitle.get(key) : null;
    if (match) votes.push(match.page - entry.printedPage);
  }

  return votes.length > 0 ? Math.round(median(votes)) : 0;
};

const buildFacts = (document) => {
  const pageCount = document.pageCount || document.pages?.length || 0;
  // Keep the shared context small enough for a free-tier token budget. Agents
  // fetch anything else they need through read_pages/search.
  const samplePages = [1, 2]
    .filter((page) => page <= pageCount)
    .map((page) => ({
      page,
      text: (document.pages?.find((item) => item.page === page)?.text || "").slice(
        0,
        180,
      ),
    }));

  return {
    kind: document.kind,
    pageCount,
    needsOcr: Boolean(document.needsOcr),
    printedPageOffset: estimatePrintedOffset(document),
    contentsEntries: (document.tocEntries || []).slice(0, 16).map((entry) => ({
      title: String(entry.title || "").slice(0, 80),
      printedPage: entry.printedPage,
    })),
    samplePages,
  };
};

/** A compact candidate outline used by the Architect, not by every agent. */
const buildCandidateOutline = (document) =>
  (document.outline || []).slice(0, MAX_OUTLINE_ENTRIES).map((entry) => ({
    title: String(entry.title || "").slice(0, 110),
    level: entry.level,
    page: entry.page,
  }));

/* ------------------------------------------------------------------ *
 * Schemas
 * ------------------------------------------------------------------ */

const stepSchema = z.object({
  thought: z.string().min(1).max(1500).default("Continuing with the next action."),
  action: z.enum(["read_pages", "search", "finish"]),
  args: z
    .object({
      from: z.number().int().positive().optional(),
      to: z.number().int().positive().optional(),
      query: z.string().min(1).max(200).optional(),
    })
    .optional()
    .default({}),
});

const scoutSchema = z.object({
  approach: z.enum(["contents", "scan", "ocr"]),
  offset: z.number().int(),
  focusPages: z.array(z.number().int().positive()).max(10),
  reasoning: z.string().min(1).max(1500),
});

const outlineEntrySchema = z.object({
  title: z.string().trim().min(2).max(160),
  level: z.number().int().min(1).max(3),
  page: z.number().int().positive(),
});

const outlineSchema = z.object({
  outline: z.array(outlineEntrySchema).min(1).max(MAX_OUTLINE_ENTRIES),
  reasoning: z.string().min(1).max(1500),
});

const verdictSchema = z.object({
  approved: z.boolean(),
  reasoning: z.string().min(1).max(1500),
  issues: z
    .array(
      z.object({
        title: z.string().max(160),
        page: z.number().int(),
        problem: z.string().max(300),
      }),
    )
    .max(40),
});

const schemeSchema = z.object({
  summary: z.string().min(1).max(1500),
  terms: z
    .array(
      z.object({
        term: z.string().min(1).max(80),
        weeks: z
          .array(
            z.object({
              week: z.number().int().positive(),
              focus: z.string().min(1).max(200),
              pages: z.string().min(1).max(60),
              assessment: z.string().min(1).max(200),
            }),
          )
          .max(20),
      }),
    )
    .max(6),
  misconceptions: z.array(z.string().max(240)).max(12),
});

/* ------------------------------------------------------------------ *
 * ReAct exploration
 * ------------------------------------------------------------------ */

const toolInstructions = [
  "You can choose exactly one action per turn, returned as JSON fields:",
  '  read_pages {"from": n, "to": m}  - read up to 3 PDF pages of real text.',
  '  search {"query": "words"}       - find pages containing all the words.',
  "  finish                          - stop exploring; you have enough evidence.",
  "Put the action name in the JSON `action` field and its arguments in `args`.",
  "Do not use the function-calling API. Choose the next action that gives you the evidence you still need.",
  "Do not read more than you need. Never invent page content.",
].join("\n");

const runExploration = async ({
  provider,
  label,
  role,
  goal,
  facts,
  tools,
  maxSteps,
  exampleThought,
  emit,
}) => {
  const observations = [];

  for (let step = 0; step < maxSteps; step += 1) {
    const { data, meta } = await provider.generateJSON({
      label,
      instructions: `${role}\n\n${toolInstructions}`,
      payload: { goal, facts, observations, step: step + 1, maxSteps },
      schema: stepSchema,
      example: { thought: exampleThought, action: "finish", args: {} },
    });

    emit({
      agent: label,
      kind: "thought",
      text: data.thought,
      provider: meta.provider,
    });

    if (data.action === "finish") break;

    const args = data.args || {};
    const observation =
      data.action === "read_pages"
        ? tools.readPages(args)
        : tools.search(args);

    emit({
      agent: label,
      kind: "action",
      text:
        data.action === "read_pages"
          ? `read pages ${observation.from}-${observation.to}`
          : `search "${observation.query}"`,
      tool: data.action,
      args,
    });

    emit({
      agent: label,
      kind: "observation",
      text:
        data.action === "read_pages"
          ? observation.pages
              .map((page) => `p${page.page}: ${page.text.slice(0, 240)}`)
              .join("\n")
          : observation.hits.length > 0
            ? observation.hits
                .map((hit) => `p${hit.page}: ${hit.snippet}`)
                .join("\n")
            : "No matching pages.",
      tool: data.action,
    });

    observations.push({ action: data.action, args, observation });
  }

  return observations;
};

/* ------------------------------------------------------------------ *
 * Example objects (shape only, never substituted for model output)
 * ------------------------------------------------------------------ */

const exampleScout = (facts) => ({
  approach: facts.needsOcr
    ? "ocr"
    : facts.contentsEntries.length > 0
      ? "contents"
      : "scan",
  offset: facts.printedPageOffset,
  focusPages: facts.samplePages.map((page) => page.page),
  reasoning: facts.needsOcr
    ? "The PDF has no extractable text layer, so OCR is required before topics can be mapped."
    : facts.contentsEntries.length > 0
      ? `The book lists ${facts.contentsEntries.length} contents entries. I will use those and shift printed pages by ${facts.printedPageOffset}.`
      : "No contents list was found, so I will scan body headings and verify each one.",
});

const exampleOutline = (document) => ({
  outline: (document.outline || [])
    .filter((entry) => entry.title && entry.page)
    .map((entry) => ({
      title: entry.title,
      level: entry.level,
      page: entry.page,
    }))
    .slice(0, MAX_OUTLINE_ENTRIES),
  reasoning:
    "Used the outline recovered directly from the document's contents pages.",
});

/**
 * Hard evidence for the Verifier: does the page it points at actually contain
 * the section number and the words of the title?
 */
const auditOutline = (document, outline) => {
  const byPage = new Map(
    (document.pages || []).map((page) => [page.page, page.text || ""]),
  );

  return outline.map((entry) => {
    const text = byPage.get(entry.page) || "";
    const lower = text.toLowerCase();
    const number = entry.title.match(/^(\d+(?:\.\d+)+)/)?.[1] || null;
    const words = titleKey(entry.title)
      .split(" ")
      .filter((word) => word.length > 4);
    const hits = words.filter((word) => lower.includes(word));

    return {
      title: entry.title,
      page: entry.page,
      sectionNumber: number,
      numberFound: number ? lower.includes(number.toLowerCase()) : null,
      keywordHits: hits.length,
      keywordTotal: words.length,
      pageStart: normalize(text).slice(0, 180),
    };
  });
};

const correctFromAudit = (outline, audit, document) => {
  const pageCount = document.pageCount || document.pages?.length || 0;
  const fixes = new Map(
    audit
      .filter(
        (item) =>
          item.numberFound === false ||
          (item.keywordTotal > 0 && item.keywordHits === 0),
      )
      .map((item) => [`${item.title}|${item.page}`, item]),
  );

  return outline
    .map((entry) => {
      const issue = fixes.get(`${entry.title}|${entry.page}`);
      if (!issue) return entry;

      const byPage = new Map(
        (document.pages || []).map((page) => [page.page, page.text || ""]),
      );
      for (const delta of [1, -1, 2, -2]) {
        const candidate = entry.page + delta;
        if (candidate < 1 || candidate > pageCount) continue;
        const text = (byPage.get(candidate) || "").toLowerCase();
        const numberOk = issue.sectionNumber
          ? text.includes(issue.sectionNumber.toLowerCase())
          : true;
        if (numberOk) return { ...entry, page: candidate };
      }
      return entry;
    })
    .filter((entry) => entry.page >= 1 && entry.page <= pageCount);
};

/* ------------------------------------------------------------------ *
 * Agents
 * ------------------------------------------------------------------ */

const scoutAgent = async ({ provider, facts, tools, emit }) => {
  emit({
    agent: "Scout Agent",
    kind: "handoff",
    text: "Taking the document and deciding how the outline should be built.",
  });

  const observations = await runExploration({
    provider,
    label: "Scout Agent",
    role:
      "You are the Scout Agent. Decide how this book should be turned into a topic-to-page outline. Check whether the table of contents is usable, whether printed page numbers are offset from PDF pages, and whether the text layer is real or scanned.",
    goal: "Decide the outline strategy and the printed-to-PDF page offset.",
    facts,
    tools,
    maxSteps: 3,
    exampleThought:
      "The extractor already recovered a contents list, so no further reading is needed.",
    emit,
  });

  const { data, meta } = await provider.generateJSON({
    label: "Scout Agent",
    instructions:
      "Return your strategy. approach=contents when a contents list can be trusted, scan when body headings must be found manually, ocr when there is no text. offset is the number you add to a printed page number to get the PDF page.",
    payload: { facts, observations },
    schema: scoutSchema,
    example: exampleScout(facts),
  });

  emit({
    agent: "Scout Agent",
    kind: "result",
    text: `${data.reasoning}\nStrategy: ${data.approach}, page offset: ${data.offset >= 0 ? "+" : ""}${data.offset}.`,
    provider: meta.provider,
  });

  return data;
};

const architectAgent = async ({
  provider,
  facts,
  tools,
  emit,
  feedback = null,
  previous = null,
  exampleOutlineData = null,
}) => {
  emit({
    agent: "Architect Agent",
    kind: "handoff",
    text: feedback
      ? `Revising the outline after the Verifier raised ${feedback.length} issue(s).`
      : "Drafting the chapter, topic and subtopic outline with page numbers.",
  });

  const observations = await runExploration({
    provider,
    label: "Architect Agent",
    role:
      "You are the Syllabus Architect. Build a practical outline a teacher can use: chapters as level 1, sections/topics as level 2, and only genuinely useful subtopics as level 3. Keep it short. Verify any page you are unsure about with the tools.",
    goal: feedback
      ? "Fix the Verifier's issues and return a corrected outline."
      : "Produce a clean, teacher-usable outline with accurate PDF page numbers.",
    facts: { ...facts, previous, feedback },
    tools,
    maxSteps: feedback ? 2 : 4,
    exampleThought: feedback
      ? "I will apply the Verifier's corrections directly."
      : "The extracted candidate outline is already grounded in the book's contents pages.",
    emit,
  });

  const { data, meta } = await provider.generateJSON({
    label: "Architect Agent",
    instructions:
      "Return the outline. Every page number must be a PDF page (1-based). Level 1 = chapter/unit, level 2 = section/topic, level 3 = subtopic. Do not include running headers, exercise questions, page numbers on their own, or publisher text. If the Verifier listed issues, fix every one of them.",
    payload: {
      facts,
      observations,
      feedback,
      previous,
      candidateOutline: exampleOutlineData,
    },
    schema: outlineSchema,
    example: exampleOutline({
      outline: (previous || exampleOutlineData || []).slice(0, 10),
    }),
  });

  const outline = sanitizeOutline(data.outline, facts.pageCount);
  emit({
    agent: "Architect Agent",
    kind: "result",
    text: `${data.reasoning}\nDraft has ${outline.length} entries.`,
    provider: meta.provider,
  });

  return { outline, reasoning: data.reasoning };
};

const verifierAgent = async ({ provider, facts, tools, emit, outline }) => {
  emit({
    agent: "Verifier Agent",
    kind: "handoff",
    text: `Checking ${outline.length} entries against the real page text.`,
  });

  const audit = auditOutline({ pages: facts.pages, pageCount: facts.pageCount }, outline);
  const suspect = audit.filter(
    (item) =>
      item.numberFound === false ||
      (item.keywordTotal > 0 && item.keywordHits === 0),
  );

  emit({
    agent: "Verifier Agent",
    kind: "observation",
    text:
      suspect.length === 0
        ? "Every mapped page contains its section number and title words."
        : `${suspect.length} entries point at a page that does not contain them:\n` +
          suspect
            .slice(0, 8)
            .map((item) => `- p${item.page} "${item.title}"`)
            .join("\n"),
  });

  const observations = await runExploration({
    provider,
    label: "Verifier Agent",
    role:
      "You are the Verifier Agent. Check the outline against the actual page text. A correct entry points at the first PDF page where that section starts. Read suspect pages before deciding.",
    goal: "Approve the outline or list concrete issues.",
    // Keep the free-tier payload small: only the most suspicious entries.
    facts: { pageCount: facts.pageCount, audit: audit.slice(0, 12) },
    tools,
    maxSteps: suspect.length > 0 ? 2 : 1,
    exampleThought:
      suspect.length === 0
        ? "The deterministic audit found no mismatches."
        : "I will report the audit mismatches as issues.",
    emit,
  });

  const { data, meta } = await provider.generateJSON({
    label: "Verifier Agent",
    instructions:
      "Return approved=true only if every entry points at a page that genuinely covers it. Otherwise approved=false and list each problem with the title and current page. Be specific and do not invent new page numbers without evidence.",
    payload: {
      pageCount: facts.pageCount,
      auditSummary: {
        total: audit.length,
        suspect: suspect.length,
      },
      audit: audit.slice(0, 12),
      observations: observations.slice(-2),
    },
    schema: verdictSchema,
    example: {
      approved: suspect.length === 0,
      reasoning:
        suspect.length === 0
          ? "The deterministic audit matched every entry to its page."
          : `${suspect.length} entries did not match the page they point at.`,
      issues: suspect.slice(0, 8).map((item) => ({
        title: item.title,
        page: item.page,
        problem: "The mapped page does not contain this section number or title words.",
      })),
    },
  });

  emit({
    agent: "Verifier Agent",
    kind: "verdict",
    text: data.reasoning,
    approved: data.approved,
    provider: meta.provider,
  });

  return data;
};

const plannerAgent = async ({ provider, facts, emit, outline, scout }) => {
  emit({
    agent: "Planner Agent",
    kind: "handoff",
    text: "Turning the verified outline into a term-by-term teaching plan.",
  });

  const { data, meta } = await provider.generateJSON({
    label: "Planner Agent",
    instructions:
      "Build a practical scheme of work a teacher can follow. Group the outline into terms and weeks. Each week must name a focus, the exact PDF pages to teach, and a short assessment. Use only topics and pages from the verified outline.",
    // The full outline is compact (title/level/page); send it so the plan covers the whole book.
    payload: {
      pageCount: facts.pageCount,
      offset: scout.offset,
      outline: outline.map(({ title, level, page }) => ({ title, level, page })),
      outlineCount: outline.length,
    },
    schema: schemeSchema,
    example: buildExampleScheme(outline, facts.pageCount),
  });

  emit({
    agent: "Planner Agent",
    kind: "result",
    text: data.summary,
    provider: meta.provider,
  });

  return data;
};

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const sanitizeOutline = (outline, pageCount) => {
  const seen = new Set();
  const cleaned = [];

  for (const entry of outline) {
    const title = normalize(entry.title);
    const page = Number(entry.page);
    if (!title || title.length < 2) continue;
    if (!Number.isFinite(page) || page < 1 || page > pageCount) continue;

    const key = `${entry.level}:${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ title, level: entry.level, page: Math.round(page) });
  }

  return cleaned
    .sort((a, b) => a.page - b.page || a.level - b.level)
    .slice(0, MAX_OUTLINE_ENTRIES);
};

const buildExampleScheme = (outline, pageCount) => {
  const chapters = outline.filter((entry) => entry.level === 1);
  const terms = [];

  const groups = [
    { term: "Term 1", items: chapters.slice(0, Math.ceil(chapters.length / 2)) },
    { term: "Term 2", items: chapters.slice(Math.ceil(chapters.length / 2)) },
  ].filter((group) => group.items.length > 0);

  for (const group of groups) {
    const weeks = group.items.map((chapter, index) => {
      const next = group.items[index + 1];
      const end = next ? Math.max(chapter.page, next.page - 1) : pageCount;
      return {
        week: index + 1,
        focus: chapter.title,
        pages: `p${chapter.page}-p${end}`,
        assessment: "Short mastery check on the chapter's worked examples.",
      };
    });
    terms.push({ term: group.term, weeks });
  }

  return {
    summary:
      "A chapter-by-chapter plan using the verified page map. Teach each section in order, then use the chapter's exercises as the mastery check.",
    terms,
    misconceptions: [],
  };
};

/* ------------------------------------------------------------------ *
 * Orchestrator
 * ------------------------------------------------------------------ */

export async function runSyllabusAgents({
  document,
  provider = getAiProvider(),
  goal = "Turn this book into a practical topic-to-page outline and scheme of work.",
  onEvent = () => {},
  maxRounds = 2,
} = {}) {
  if (!document || !Array.isArray(document.pages) || document.pages.length === 0) {
    throw new Error("A parsed document is required before agents can run.");
  }

  const status = providerStatus();
  const trace = [];
  const emit = (event) => {
    const record = {
      id: `evt_${trace.length + 1}`,
      at: new Date().toISOString(),
      ...event,
    };
    trace.push(record);
    try {
      onEvent(record);
    } catch {
      // A failing listener must never break the run.
    }
  };

  const facts = buildFacts(document);
  const tools = createToolbox(document);

  emit({
    agent: "Coordinator",
    kind: "system",
    text: `Goal: ${goal}\nProvider: ${status.label}. ${status.note}`,
    provider: status.active,
  });

  if (document.needsOcr) {
    emit({
      agent: "Coordinator",
      kind: "error",
      text: "This PDF has no text layer. OCR is required before topics can be mapped to pages.",
    });
    return {
      outline: [],
      scheme: null,
      scout: null,
      verdict: null,
      trace,
      provider: status,
      needsOcr: true,
    };
  }

  const scout = await scoutAgent({ provider, facts, tools, emit });

  emit({
    agent: "Coordinator",
    kind: "handoff",
    text: "Scout → Architect: strategy decided, handing over the outline brief.",
  });

  let draft = await architectAgent({
    provider,
    facts,
    tools,
    emit,
    exampleOutlineData: buildCandidateOutline(document),
  });
  let verdict = null;

  for (let round = 1; round <= maxRounds; round += 1) {
    verdict = await verifierAgent({
      provider,
      facts: { ...facts, pages: document.pages },
      tools,
      emit,
      outline: draft.outline,
    });

    if (verdict.approved) break;
    if (round === maxRounds) break;

    emit({
      agent: "Coordinator",
      kind: "handoff",
      text: `Verifier → Architect: ${verdict.issues.length} issue(s) to correct (round ${round + 1}).`,
    });

    draft = await architectAgent({
      provider,
      facts,
      tools,
      emit,
      feedback: verdict.issues,
      previous: draft.outline,
      exampleOutlineData: buildCandidateOutline(document),
    });
  }

  // Final safety net: never ship an entry whose page cannot be verified.
  const audit = auditOutline(
    { pages: document.pages, pageCount: facts.pageCount },
    draft.outline,
  );
  const corrected = correctFromAudit(draft.outline, audit, {
    pages: document.pages,
    pageCount: facts.pageCount,
  });
  if (corrected.length !== draft.outline.length) {
    emit({
      agent: "Coordinator",
      kind: "system",
      text: "Removed entries whose pages fell outside the document.",
    });
  }

  emit({
    agent: "Coordinator",
    kind: "handoff",
    text: "Architect → Planner: verified outline handed over for scheduling.",
  });

  const scheme = await plannerAgent({
    provider,
    facts,
    emit,
    outline: corrected,
    scout,
  });

  emit({
    agent: "Coordinator",
    kind: "result",
    text: `Finished. ${corrected.length} verified entries, ${scheme.terms.length} term(s) planned.`,
  });

  return {
    outline: corrected,
    scheme,
    scout,
    verdict,
    trace,
    provider: status,
    needsOcr: false,
  };
}

export const agentSchemas = {
  stepSchema,
  scoutSchema,
  outlineSchema,
  verdictSchema,
  schemeSchema,
};
