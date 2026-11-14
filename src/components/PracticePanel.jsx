import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Delete,
  Lightbulb,
  MessageSquare,
  Plus,
  XCircle,
} from "lucide-react";
import { Badge, Button, Card, ProgressBar } from "./ui.jsx";
import { cx } from "../lib/cx.js";

function toLines(value) {
  if (Array.isArray(value)) return value.length ? value : [""];
  const str = String(value ?? "");
  if (!str) return [""];
  const parts = str.replace(/\r\n/g, "\n").split("\n");
  return parts.length ? parts : [""];
}

function fromLines(lines) {
  return lines.join("\n");
}

const NUM_PAD = [
  ["7", "8", "9", "+"],
  ["4", "5", "6", "-"],
  ["1", "2", "3", "×"],
  ["0", ".", "=", "÷"],
  ["(", ")", "x", "⌫"],
];

const ALPHA_PAD = [
  ["a", "b", "c", "x"],
  ["y", "z", "√", "²"],
  ["^", "/", "π", "("],
  [")", "=", "+", "-"],
  ["×", "÷", " ", "⌫"],
];

const SUPER = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","(":"⁽",")":"⁾","n":"ⁿ","i":"ⁱ" };
const SUPER_CHARS = new Set(Object.values(SUPER));

function applyMathInsert(current, key) {
  if (key === "⌫") return current.slice(0, -1);
  if (key === "^") {
    if (current.endsWith("^")) return current.slice(0, -1);
    return current + "^";
  }
  if (SUPER[key]) {
    if (current.endsWith("^")) return current.slice(0, -1) + SUPER[key];
    const last = current.slice(-1);
    if (SUPER_CHARS.has(last)) return current + SUPER[key];
  }
  return current + key;
}

export default function PracticePanel({
  intervention,
  sessionId,
  attemptNumber,
  savedAnswers = {},
  onCheck,
  onFinish,
  busy = false,
}) {
  const questions = intervention.practiceQuestions;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState(savedAnswers || {});
  const [checks, setChecks] = useState({});
  const [checking, setChecking] = useState(false);
  const [activeLine, setActiveLine] = useState(0);
  const [padMode, setPadMode] = useState("num");

  useEffect(() => {
    setAnswers(savedAnswers || {});
  }, [savedAnswers]);

  const question = questions[index];
  const lines = toLines(question ? answers[question.id] || "" : "");

  useEffect(() => {
    setActiveLine(0);
  }, [question?.id]);

  if (!question) return null;

  const currentCheck = checks[question.id];
  const answered = questions.filter((item) => String(answers[item.id] ?? "").trim()).length;
  const correctChecked = questions.filter((item) => checks[item.id]?.correct).length;
  const allAnswered = answered === questions.length;
  const hasContent = lines.some((l) => String(l).trim());

  const setLines = (nextLines) => {
    setAnswers((current) => ({ ...current, [question.id]: fromLines(nextLines) }));
    if (checks[question.id]) {
      setChecks((current) => {
        const next = { ...current };
        delete next[question.id];
        return next;
      });
    }
  };

  const updateLine = (lineIndex, value) => {
    const next = [...lines];
    next[lineIndex] = value;
    setLines(next);
  };

  const addLine = () => {
    const next = [...lines, ""];
    setLines(next);
    setActiveLine(next.length - 1);
  };

  const pressKey = (key) => {
    const lineIndex = Math.min(activeLine, Math.max(0, lines.length - 1));
    const current = lines[lineIndex] || "";
    updateLine(lineIndex, applyMathInsert(current, key));
  };

  const check = async () => {
    const value = fromLines(lines);
    if (!String(value).trim()) return;
    setChecking(true);
    try {
      const result = await onCheck(question.id, value);
      setChecks((current) => ({ ...current, [question.id]: result }));
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card className="overflow-hidden" aria-labelledby="practice-heading">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            <span className="rounded-xl bg-mint-50 p-2.5 text-mint-700 ring-1 ring-inset ring-mint-200">
              <MessageSquare className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="eyebrow">Guided practice · Tutor Agent</p>
              <h2 id="practice-heading" className="mt-1 text-lg font-bold">
                Try it yourself
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Check each answer. A hint appears before the answer is revealed.
              </p>
            </div>
          </div>
          <Badge tone="slate">
            Attempt {attemptNumber} · {answered}/{questions.length} answered
          </Badge>
        </div>

        <ProgressBar value={(answered / questions.length) * 100} className="mt-4" label="Practice progress" showValue />

        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Practice question navigation">
          {questions.map((item, itemIndex) => {
            const filled = Boolean(String(answers[item.id] ?? "").trim());
            const checked = checks[item.id];
            const isCurrent = itemIndex === index;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(itemIndex)}
                aria-label={`Practice question ${itemIndex + 1}${checked?.correct ? ", correct" : filled ? ", answered" : ", not answered"}`}
                aria-current={isCurrent ? "step" : undefined}
                className={cx(
                  "flex h-7 min-w-7 items-center justify-center rounded-full border px-1.5 text-[11px] font-bold transition",
                  isCurrent
                    ? "border-ink-950 bg-ink-950 text-white"
                    : checked?.correct
                      ? "border-mint-300 bg-mint-50 text-mint-800"
                      : checked
                        ? "border-amber-300 bg-amber-50 text-amber-800"
                        : filled
                          ? "border-slate-300 bg-slate-100 text-slate-700"
                          : "border-slate-200 text-slate-400 hover:border-slate-300",
                )}
              >
                {checked?.correct ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : itemIndex + 1}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-5">
        <fieldset>
          <legend className="sr-only">
            Practice question {index + 1} of {questions.length}
          </legend>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Question {index + 1} of {questions.length}
            </p>
          </div>
          <h3 className="mt-2 text-xl font-bold text-ink-950">{question.prompt}</h3>

          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1 space-y-2">
              {lines.map((line, lineIndex) => (
                <div key={`${question.id}-line-${lineIndex}`}>
                  <label htmlFor={`practice-${sessionId}-${attemptNumber}-${question.id}-line-${lineIndex}`} className="sr-only">
                    {lineIndex === 0 ? `Answer for ${question.prompt}` : `Step ${lineIndex + 1}`}
                  </label>
                  <input
                    id={`practice-${sessionId}-${attemptNumber}-${question.id}-line-${lineIndex}`}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={line}
                    onFocus={() => setActiveLine(lineIndex)}
                    onClick={() => setActiveLine(lineIndex)}
                    onChange={(e) => updateLine(lineIndex, e.target.value)}
                    placeholder={lineIndex === 0 ? "Start your working or answer…" : `Step ${lineIndex + 1}…`}
                    className={cx(
                      "w-full rounded-xl border bg-white px-4 py-3 text-base font-medium text-ink-950 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-offset-1",
                      currentCheck?.correct
                        ? "border-mint-500 ring-mint-500"
                        : currentCheck
                          ? "border-amber-400 ring-amber-400"
                          : activeLine === lineIndex
                            ? "border-mint-500 focus:border-mint-500 focus:ring-mint-500"
                            : "border-slate-200 focus:border-mint-500 focus:ring-mint-500",
                    )}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-mint-400 hover:bg-mint-50 hover:text-mint-700"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add line
              </button>
              <p className="text-xs text-slate-500">Add lines to show your working step by step. Put your final answer on the last line.</p>
              {currentCheck?.correct ? (
                <p className="inline-flex items-center gap-1 text-xs font-medium text-mint-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Correct
                </p>
              ) : currentCheck ? (
                <p className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                  <XCircle className="h-4 w-4" aria-hidden="true" /> Not quite yet
                </p>
              ) : null}
            </div>

            <div className="w-full shrink-0 lg:w-64 lg:mt-[5px]">
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPadMode("num")}
                  className={cx(
                    "flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition",
                    padMode === "num"
                      ? "border-ink-950 bg-ink-950 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  123
                </button>
                <button
                  type="button"
                  onClick={() => setPadMode("alpha")}
                  className={cx(
                    "flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition",
                    padMode === "alpha"
                      ? "border-ink-950 bg-ink-950 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  ABC
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                {(padMode === "num" ? NUM_PAD : ALPHA_PAD).flat().map((key, i) => (
                  <button
                    key={`${padMode}-${key}-${i}`}
                    type="button"
                    onClick={() => pressKey(key)}
                    className={cx(
                      "inline-flex h-11 items-center justify-center rounded-lg border text-sm font-semibold transition active:scale-[0.98]",
                      key === "⌫"
                        ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        : key === " "
                          ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                          : /[0-9]/.test(key)
                            ? "border-slate-200 bg-white text-ink-950 hover:border-mint-300 hover:bg-mint-50"
                            : padMode === "alpha" && /^[a-z]$/.test(key)
                              ? "border-slate-200 bg-white text-ink-950 hover:border-mint-300 hover:bg-mint-50"
                              : "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100",
                    )}
                    aria-label={key === "⌫" ? "Backspace" : key === " " ? "Space" : `Insert ${key}`}
                  >
                    {key === "⌫" ? <Delete className="h-4 w-4" aria-hidden="true" /> : key === " " ? "␣" : key}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </fieldset>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={Lightbulb}
            onClick={check}
            loading={checking}
            disabled={!hasContent || busy || Boolean(currentCheck?.correct)}
          >
            {currentCheck ? "Check again" : "Check answer"}
          </Button>
          <span className="text-[11px] text-slate-500">
            {correctChecked}/{questions.length} checked correctly
          </span>
        </div>

        {currentCheck ? (
          <div
            className={cx(
              "mt-4 rounded-xl border p-3.5 text-sm leading-6",
              currentCheck.correct
                ? "border-mint-200 bg-mint-50 text-mint-900"
                : "border-amber-200 bg-amber-50 text-amber-900",
            )}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-2">
              {currentCheck.correct ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <div>
                <p className="font-semibold">{currentCheck.correct ? "Correct" : "Not quite yet"}</p>
                <p className="mt-0.5">{currentCheck.correct ? currentCheck.feedback : currentCheck.hint}</p>
                {!currentCheck.correct ? (
                  <p className="mt-1 text-xs">Try the question again. The correct answer is not shown yet.</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
            Check your answer to get Tutor Agent feedback before moving on. You can retry a question.
          </p>
        )}
      </div>

      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={ArrowLeft}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              disabled={index === 0 || busy}
            >
              Previous
            </Button>
            {index < questions.length - 1 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIndex((value) => Math.min(questions.length - 1, value + 1))}
                disabled={busy}
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            ) : null}
          </div>

          <Button
            variant="mint"
            size="sm"
            onClick={() => onFinish(answers)}
            loading={busy}
            disabled={!allAnswered || checking}
            icon={ArrowRight}
          >
            {allAnswered ? "Finish practice & start mastery" : `Answer all ${questions.length} questions`}
          </Button>
        </div>
      </div>
    </Card>
  );
}
