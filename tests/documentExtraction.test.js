import test from "node:test";
import assert from "node:assert/strict";
import { extractDocument } from "../server/services/documentExtraction.js";
import {
  makeNoisyPdf,
  makeSamplePdf,
  makeTextbookPdf,
} from "./samplePdf.js";

test("PDF extraction keeps page numbers and detects topics and subtopics", async () => {
  const result = await extractDocument(makeSamplePdf(), "grade-9-learner-book.pdf");

  assert.equal(result.kind, "pdf");
  assert.equal(result.pageCount, 3);
  assert.equal(result.pageAccurate, true);
  assert.equal(result.needsOcr, false);

  // Per-page text is preserved.
  assert.match(result.pages[0].text, /Chapter 1: Whole numbers/);
  assert.match(result.pages[1].text, /A variable stands for a number/);
  assert.match(result.pages[2].text, /interior angles of a triangle/);

  // Chapters are level 1, numbered topics are level 2, with the right pages.
  assert.deepEqual(
    result.outline.find((entry) => entry.title === "Chapter 2: Algebra"),
    { title: "Chapter 2: Algebra", level: 1, page: 2 },
  );
  assert.deepEqual(
    result.outline.find(
      (entry) => entry.title === "2.1 Using letters for unknown numbers",
    ),
    { title: "2.1 Using letters for unknown numbers", level: 2, page: 2 },
  );
  assert.deepEqual(
    result.outline.find((entry) => entry.title === "3.2 Triangles"),
    { title: "3.2 Triangles", level: 2, page: 3 },
  );
});

test("a PDF with no extractable text is flagged for OCR", async () => {
  const result = await extractDocument(
    makeSamplePdf({ blank: true }),
    "scanned-learner-book.pdf",
  );

  assert.equal(result.kind, "pdf");
  assert.equal(result.pageCount, 2);
  assert.equal(result.needsOcr, true);
  assert.deepEqual(result.outline, []);
});

test("the table of contents is used and printed pages are mapped to PDF pages", async () => {
  const result = await extractDocument(
    makeTextbookPdf(),
    "grade-9-textbook.pdf",
  );

  // Printed page 1 is PDF page 3, so every printed number shifts by +2.
  assert.deepEqual(result.outline, [
    { title: "Chapter 1: Whole numbers", level: 1, page: 3 },
    { title: "1.1 Place value", level: 2, page: 4 },
    { title: "1.2 Ordering numbers", level: 2, page: 5 },
    { title: "Chapter 2: Algebra", level: 1, page: 6 },
    { title: "2.1 Variables", level: 2, page: 7 },
  ]);

  // The outline is short and practical, not a dump of every line.
  assert.ok(result.outline.length <= 10);
});

test("exercise questions, running headers and maths fragments are rejected", async () => {
  const result = await extractDocument(makeNoisyPdf(), "noisy-book.pdf");

  const titles = result.outline.map((entry) => entry.title);
  assert.deepEqual(titles, [
    "Chapter 1: Whole numbers",
    "1.1 Properties of numbers",
    "1.2 Calculations with whole numbers",
  ]);

  for (const entry of result.outline) {
    assert.doesNotMatch(entry.title, /\(a\)|\(b\)|=/);
    assert.doesNotMatch(entry.title, /MATHEMATICS|Grade 9|CAPS/);
    assert.doesNotMatch(entry.title, /^CHAPTER \d+:.*\d$/);
  }
});
