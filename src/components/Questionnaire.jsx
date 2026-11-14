import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Delete, Plus } from "lucide-react";
import { Button, Card, ProgressBar } from "./ui.jsx";
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
    // toggle off if already in exponent marker context
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

export default function Questionnaire({
  eyebrow = "Assessment",
  title,
  description,
  icon: Icon,
  questions,
  answers,
  onAnswersChange,
  onSubmit,
  submitLabel = "Submit answers",
  busy = false,
  meta,
  footerNote,
}) {
  const [index, setIndex] = useState(0);
  const [activeLine, setActiveLine] = useState(0);
  const [padMode, setPadMode] = useState("num");

  useEffect(() => {
    setIndex(0);
  }, [questions.length]);

  const question = questions[index];
  const lines = toLines(question ? answers[question.id] || "" : "");

  useEffect(() => {
    setActiveLine(0);
  }, [question?.id]);

  if (!question) return null;

  const answered = questions.filter((item) => String(answers[item.id] ?? "").trim()).length;
  const allAnswered = answered === questions.length;
  const last = index === questions.length - 1;

  const setLines = (nextLines) => {
    onAnswersChange({ ...answers, [question.id]: fromLines(nextLines) });
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

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            {Icon ? (
              <span className="rounded-xl bg-ink-950 p-2.5 text-mint-300">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            ) : null}
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h2 className="mt-1 text-xl font-bold sm:text-2xl">{title}</h2>
              {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{description}</p> : null}
            </div>
          </div>
          {meta}
        </div>

        <ProgressBar
          value={(answered / questions.length) * 100}
          className="mt-5"
          label={`${answered} of ${questions.length} answered`}
          showValue
        />

        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Question navigation">
          {questions.map((item, itemIndex) => {
            const isAnswered = Boolean(String(answers[item.id] ?? "").trim());
            const isCurrent = itemIndex === index;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(itemIndex)}
                aria-label={`Question ${itemIndex + 1}${isAnswered ? ", answered" : ", not answered"}`}
                aria-current={isCurrent ? "step" : undefined}
                className={cx(
                  "flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-bold transition",
                  isCurrent
                    ? "border-ink-950 bg-ink-950 text-white"
                    : isAnswered
                      ? "border-mint-300 bg-mint-50 text-mint-800 hover:bg-mint-100"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
                )}
              >
                {isAnswered && !isCurrent ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : itemIndex + 1}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <fieldset>
          <legend className="sr-only">
            Question {index + 1} of {questions.length}
          </legend>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Question {index + 1} of {questions.length}
                </p>
                <p className="text-xs font-medium text-slate-500">Type your answer</p>
              </div>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{question.prompt}</h3>

              <div className="mt-6 space-y-2">
                {lines.map((line, lineIndex) => (
                  <div key={`${question.id}-line-${lineIndex}`}>
                    <label htmlFor={`question-${question.id}-line-${lineIndex}`} className="sr-only">
                      {lineIndex === 0 ? `Answer for ${question.prompt}` : `Step ${lineIndex + 1}`}
                    </label>
                    <input
                      id={`question-${question.id}-line-${lineIndex}`}
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
                        "w-full rounded-xl border bg-white px-4 py-3 text-base font-medium text-ink-950 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mint-500 focus:ring-offset-1",
                        activeLine === lineIndex ? "border-mint-500" : "border-slate-200 focus:border-mint-500",
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
                <p className="text-xs text-slate-500">Add lines to show your working step by step. Your final answer should be on the last line.</p>
              </div>
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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
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
          {!last ? (
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

        <div className="flex flex-wrap items-center gap-3">
          {footerNote ? <p className="hidden max-w-xs text-[11px] leading-4 text-slate-500 lg:block">{footerNote}</p> : null}
          <Button
            variant="mint"
            onClick={() => onSubmit(answers)}
            loading={busy}
            disabled={!allAnswered}
            icon={CheckCircle2}
          >
            {allAnswered ? submitLabel : `Answer all ${questions.length} questions`}
          </Button>
        </div>
      </div>
    </Card>
  );
}
