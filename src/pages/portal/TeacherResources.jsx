import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  Brain,
  CheckCircle2,
  Eye,
  FileText,
  Folder,
  ListChecks,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Upload,
  Wrench,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { useApp } from "../../context/AppContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  Alert,
  Badge,
  Button,
  Card,
  SectionHeading,
  Spinner,
  StatCard,
} from "../../components/ui.jsx";
import { cx } from "../../lib/cx.js";
import { formatDate } from "../../lib/format.js";

const SLOTS = [
  {
    key: "student-book",
    title: "Learner book",
    hint: "The student textbook or workbook the AI should follow.",
    icon: BookOpen,
    resourceKey: "studentBook",
  },
  {
    key: "teachers-guide",
    title: "Teacher's guide",
    hint: "Your guide, scheme of work or notes for the same book.",
    icon: Folder,
    resourceKey: "teachersGuide",
  },
];

const OUTLINE_DOCS = [
  { key: "student-book", title: "Learner book", resourceKey: "studentBook" },
  { key: "teachers-guide", title: "Teacher's guide", resourceKey: "teachersGuide" },
];

const AGENT_META = {
  "Scout Agent": { icon: Search, tone: "sky", label: "Scout" },
  "Architect Agent": { icon: Brain, tone: "mint", label: "Architect" },
  "Verifier Agent": { icon: CheckCircle2, tone: "amber", label: "Verifier" },
  "Planner Agent": { icon: ListChecks, tone: "sky", label: "Planner" },
  Coordinator: { icon: Bot, tone: "slate", label: "Coordinator" },
};

const KIND_META = {
  thought: { icon: Brain, label: "Thought", tone: "slate" },
  action: { icon: Wrench, label: "Tool call", tone: "sky" },
  observation: { icon: Eye, label: "Observation", tone: "slate" },
  handoff: { icon: ArrowRight, label: "Handoff", tone: "amber" },
  verdict: { icon: CheckCircle2, label: "Verdict", tone: "mint" },
  result: { icon: CheckCircle2, label: "Result", tone: "mint" },
  system: { icon: Bot, label: "System", tone: "slate" },
  error: { icon: AlertTriangle, label: "Error", tone: "rose" },
};

const RUN_STATUS = {
  running: { label: "Running", tone: "sky" },
  complete: { label: "Complete", tone: "mint" },
  failed: { label: "Failed", tone: "rose" },
  needs_ocr: { label: "Needs OCR", tone: "amber" },
};

const isTerminalRun = (run) =>
  !run || ["complete", "failed", "needs_ocr"].includes(run.status);

const resourceHint = (resource, empty) => {
  if (!resource) return empty;
  const pages = resource.pageCount ? `${resource.pageCount} pages · ` : "";
  return `${pages}${resource.name}`;
};

function EventBody({ event }) {
  const text = String(event.text || "");
  if (!text && !event.args) return null;

  const isLong = text.length > 320 || text.split("\n").length > 6;
  const [expanded, setExpanded] = useState(false);
  const shown = expanded || !isLong ? text : `${text.slice(0, 320)}…`;

  return (
    <div className="mt-1 space-y-1.5">
      {event.tool ? (
        <p className="font-mono text-[11px] text-slate-500">
          {event.tool}
          {event.args && Object.keys(event.args).length
            ? `(${JSON.stringify(event.args)})`
            : ""}
        </p>
      ) : null}
      {text ? (
        <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-5 text-slate-700">
          {shown}
        </pre>
      ) : null}
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="text-[11px] font-semibold text-mint-700 hover:text-mint-800"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

function TraceEvent({ event }) {
  const agent = AGENT_META[event.agent] || {
    icon: Bot,
    tone: "slate",
    label: event.agent || "Agent",
  };
  const kind =
    KIND_META[event.kind] ||
    (event.approved === true
      ? { ...KIND_META.verdict, tone: "mint", label: "Approved" }
      : event.approved === false
        ? { ...KIND_META.verdict, tone: "rose", label: "Rejected" }
        : { icon: Bot, label: event.kind || "Event", tone: "slate" });
  const AgentIcon = agent.icon;
  const KindIcon = kind.icon;

  return (
    <li className="relative pl-10">
      <span
        className={cx(
          "absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-inset",
          agent.tone === "mint" && "bg-mint-50 text-mint-700 ring-mint-200",
          agent.tone === "sky" && "bg-sky-50 text-sky-700 ring-sky-200",
          agent.tone === "amber" && "bg-amber-50 text-amber-700 ring-amber-200",
          agent.tone === "rose" && "bg-rose-50 text-rose-700 ring-rose-200",
          agent.tone === "slate" && "bg-slate-100 text-slate-600 ring-slate-200",
        )}
      >
        <AgentIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ink-950">{event.agent}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            <KindIcon className="h-3 w-3" aria-hidden="true" />
            {kind.label}
          </span>
          {event.provider ? (
            <span className="text-[10px] text-slate-400">{event.provider}</span>
          ) : null}
        </div>
        <EventBody event={event} />
      </div>
    </li>
  );
}

function AgentRunPanel({ slot, resource, run, onStart, starting }) {
  const bottomRef = useRef(null);
  const trace = run?.trace || [];
  const status = RUN_STATUS[run?.status] || RUN_STATUS.running;
  const running = run?.status === "running";
  const slotTitle = slot === "student-book" ? "learner book" : "teacher's guide";

  useEffect(() => {
    if (running && bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [trace.length, running]);

  if (!resource) return null;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-ink-950">
            Multi-agent analysis · {slot === "student-book" ? "Learner book" : "Teacher's guide"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Watch Scout, Architect, Verifier and Planner reason over the real document, call
            tools, challenge each other, and produce a verified topic-to-page map.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {run ? <Badge tone={status.tone}>{status.label}</Badge> : null}
          <Button
            variant="mint"
            size="sm"
            icon={running ? Loader2 : Play}
            loading={starting || running}
            disabled={Boolean(resource.needsOcr)}
            onClick={() => onStart(slot)}
          >
            {running ? "Agents working…" : run ? "Run again" : "Analyze with agents"}
          </Button>
        </div>
      </div>

      {resource.needsOcr ? (
        <Alert tone="warning" title="Text extraction required">
          This PDF has no readable text layer. OCR is needed before agents can map topics to pages.
        </Alert>
      ) : null}

      {run ? (
        <>
          {run.status === "failed" && run.error ? (
            <Alert tone="error" title="The agent run could not complete">
              {run.error}
              {run.error.includes("Rate limit") || run.error.includes("HTTP 429") ? (
                <span className="mt-1 block text-xs">
                  Groq free tier has per-minute token limits. The provider retries automatically, but
                  a large book can still hit the limit. Wait a moment and try again, or set{" "}
                  <code className="rounded bg-rose-100 px-1">GROQ_MODEL</code> to a lighter model
                  (for example <code className="rounded bg-rose-100 px-1">qwen/qwen3.8-27b</code>).
                </span>
              ) : null}
            </Alert>
          ) : null}

          {run.status === "needs_ocr" ? (
            <Alert tone="warning" title="OCR required">
              The document could not be analyzed because it has no extractable text.
            </Alert>
          ) : null}

          <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
            {trace.length === 0 ? (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                {running ? <Spinner className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                {running ? `Starting analysis of the ${slotTitle}…` : "No trace events yet."}
              </div>
            ) : (
              <ol className="space-y-3">
                {trace.map((event, index) => (
                  <TraceEvent key={event.id || `${event.at || index}-${index}`} event={event} />
                ))}
                {running ? (
                  <li className="flex items-center gap-2 pl-10 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Agents are working (live model calls may take time on the free tier)…
                  </li>
                ) : null}
                <li ref={bottomRef} aria-hidden="true" />
              </ol>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">
          No analysis run yet. Start one to see the agents reason, read pages, verify, self-correct,
          and hand off work.
        </p>
      )}
    </Card>
  );
}

export default function TeacherResources() {
  const { notify } = useApp();
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(null);
  const [runsBySlot, setRunsBySlot] = useState({});
  const [startingSlot, setStartingSlot] = useState(null);
  const inputRefs = useRef({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [planData, runsData] = await Promise.all([
        api.planInfo(),
        api.agentRuns(20).catch(() => ({ runs: [] })),
      ]);
      setPlan(planData);
      setRunsBySlot((current) => {
        const next = { ...current };
        const latestBySlot = {};
        for (const run of runsData.runs || []) {
          if (!latestBySlot[run.slot]) latestBySlot[run.slot] = run;
        }
        for (const [slot, run] of Object.entries(latestBySlot)) {
          // Don't clobber an actively polled run with a stale list entry.
          if (!next[slot] || isTerminalRun(next[slot]) || next[slot].id === run.id) {
            next[slot] = run;
          }
        }
        return next;
      });
      setError(null);
    } catch (err) {
      if (err.status === 401) {
        await refresh();
        navigate("/portal/teacher/login", { replace: true });
        return;
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [navigate, refresh]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshPlan = useCallback(async () => {
    try {
      const data = await api.planInfo();
      setPlan(data);
    } catch {
      // Non-fatal: the outline will refresh on next full load.
    }
  }, []);

  // Poll any running agent run so the trace updates live.
  useEffect(() => {
    const active = Object.values(runsBySlot).filter(
      (run) => run && run.status === "running",
    );
    if (active.length === 0) return undefined;

    let cancelled = false;
    const poll = async () => {
      const updates = await Promise.all(
        active.map(async (run) => {
          try {
            return await api.agentRun(run.id);
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;

      let anyCompleted = false;
      setRunsBySlot((current) => {
        const next = { ...current };
        for (const updated of updates) {
          if (!updated) continue;
          next[updated.slot] = updated;
          if (isTerminalRun(updated) && current[updated.slot]?.status === "running") {
            anyCompleted = true;
          }
        }
        return next;
      });

      if (anyCompleted) {
        refreshPlan();
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runsBySlot, refreshPlan]);

  const upload = async (slotKey, file) => {
    if (!file) return;
    setUploading(slotKey);
    try {
      await api.uploadResource(slotKey, file);
      notify(`${file.name} uploaded.`, "success");
      await load();
    } catch (err) {
      notify(err.message || "Could not upload the file.", "error");
    } finally {
      setUploading(null);
      const input = inputRefs.current[slotKey];
      if (input) input.value = "";
    }
  };

  const startAnalysis = async (slotKey) => {
    setStartingSlot(slotKey);
    try {
      const run = await api.analyzeResource(slotKey);
      setRunsBySlot((current) => ({ ...current, [slotKey]: run }));
      notify("Agent analysis started.", "success");
    } catch (err) {
      notify(err.message || "Could not start the agent analysis.", "error");
    } finally {
      setStartingSlot(null);
    }
  };

  // Syllabus discussion UI removed; teachers use the verified outline and agent trace.

  const activeRunCount = useMemo(
    () => Object.values(runsBySlot).filter((run) => run?.status === "running").length,
    [runsBySlot],
  );

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-slate-500">
        <Spinner /> Loading your resources…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert tone="error" title="Could not load your resources">
          {error.message}
        </Alert>
        <Button variant="secondary" icon={RefreshCw} onClick={load}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <Link
        to="/portal/teacher"
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-ink-950"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All classes
      </Link>

      <SectionHeading
        eyebrow="Teacher resources"
        title="Upload your learner book and teacher's guide"
        description="The AI reads these documents so its syllabus discussion follows the books you actually teach. Run the multi-agent analysis to watch Scout, Architect, Verifier and Planner map topics to real PDF pages."
        action={
          activeRunCount > 0 ? (
            <Badge tone="sky" icon={Loader2} className="[&_svg]:animate-spin">
              {activeRunCount} agent run{activeRunCount === 1 ? "" : "s"} live
            </Badge>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Learner book"
          value={plan?.studentBook ? "Uploaded" : "Not uploaded"}
          hint={resourceHint(plan?.studentBook, "No learner book yet")}
          icon={BookOpen}
          tone={plan?.studentBook ? "mint" : "sky"}
        />
        <StatCard
          label="Teacher's guide"
          value={plan?.teachersGuide ? "Uploaded" : "Not uploaded"}
          hint={resourceHint(plan?.teachersGuide, "No teacher's guide yet")}
          icon={Folder}
          tone={plan?.teachersGuide ? "mint" : "sky"}
        />
        <StatCard
          label="Your classes"
          value={plan?.usage?.classes ?? 0}
          hint={`${plan?.usage?.students ?? 0} students enrolled`}
          icon={FileText}
          tone="slate"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SLOTS.map((slot) => {
          const resource = plan?.[slot.resourceKey];
          const Icon = slot.icon;
          return (
            <Card key={slot.key} className="flex h-full flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-mint-50 p-2 text-mint-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-bold text-ink-950">{slot.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{slot.hint}</p>
                  </div>
                </div>
                <Badge tone={resource ? "mint" : "slate"}>
                  {resource ? "Uploaded" : "Missing"}
                </Badge>
              </div>

              {resource ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="font-semibold text-ink-950">{resource.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {resource.pageCount ? `${resource.pageCount} pages · ` : ""}
                    {resource.uploadedAt
                      ? `Uploaded ${formatDate(resource.uploadedAt)}`
                      : "Uploaded"}
                  </p>
                  {resource.needsOcr ? (
                    <p className="mt-2 text-xs font-semibold text-amber-700">
                      Scanned PDF: no text could be read. OCR is needed before topics can be
                      mapped to pages.
                    </p>
                  ) : resource.outline?.length ? (
                    <p className="mt-2 text-xs text-slate-500">
                      {resource.outline.length} topics mapped with page numbers.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      No verified outline yet. Run the agents to map topics to pages.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No file uploaded yet.</p>
              )}

              <div className="mt-auto">
                <input
                  ref={(element) => {
                    inputRefs.current[slot.key] = element;
                  }}
                  id={`resource-${slot.key}`}
                  type="file"
                  className="sr-only"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={(event) => upload(slot.key, event.target.files?.[0])}
                />
                <Button
                  variant={resource ? "secondary" : "mint"}
                  icon={Upload}
                  loading={uploading === slot.key}
                  onClick={() => inputRefs.current[slot.key]?.click()}
                  className="w-full"
                >
                  {resource ? "Replace file" : "Upload file"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>


      <div className="space-y-4">
        {SLOTS.map((slot) => (
          <AgentRunPanel
            key={slot.key}
            slot={slot.key}
            resource={plan?.[slot.resourceKey]}
            run={runsBySlot[slot.key] || null}
            onStart={startAnalysis}
            starting={startingSlot === slot.key}
          />
        ))}
      </div>



      {!plan?.studentBook && !plan?.teachersGuide ? (
        <Alert tone="info" title="Upload a document to begin">
          Add the learner book and teacher's guide above. The multi-agent analysis reads them to
          build a verified topic-to-page map that can guide the learning cycle.
        </Alert>
      ) : null}
    </div>
  );
}
