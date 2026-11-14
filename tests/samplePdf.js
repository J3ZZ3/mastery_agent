/**
 * Build tiny but valid multi-page PDFs for extraction tests.
 * Text is placed with absolute text matrices so PDF.js can read every line.
 */

const escape = (text) =>
  text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const contentFor = (lines) => {
  const ops = ["BT"];
  let y = 740;
  for (const [text, size] of lines) {
    ops.push(`/F1 ${size} Tf`);
    ops.push(`1 0 0 1 72 ${y} Tm`);
    ops.push(`(${escape(text)}) Tj`);
    y -= size + 14;
  }
  ops.push("ET");
  return ops.join("\n");
};

const buildPdf = (pages) => {
  const objects = [];
  const pageCount = pages.length;
  const firstPageObject = 3;
  const firstContentObject = firstPageObject + pageCount;
  const fontObject = firstContentObject + pageCount;

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] =
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${firstPageObject + i} 0 R`).join(" ")}] ` +
    `/Count ${pageCount} >>`;

  pages.forEach((_, index) => {
    objects[firstPageObject + index] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Contents ${firstContentObject + index} 0 R ` +
      `/Resources << /Font << /F1 ${fontObject} 0 R >> >> >>`;
  });

  pages.forEach((lines, index) => {
    const body = contentFor(lines);
    objects[firstContentObject + index] =
      `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`;
  });

  objects[fontObject] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let output = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 1; i <= fontObject; i += 1) {
    offsets[i] = Buffer.byteLength(output);
    output += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(output);
  output += `xref\n0 ${fontObject + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= fontObject; i += 1) {
    output += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${fontObject + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(output);
};

/** Three pages of clean chapter/topic headings, no table of contents. */
export function makeSamplePdf({ blank = false } = {}) {
  const pages = blank
    ? [[], []]
    : [
        [
          ["Chapter 1: Whole numbers", 20],
          ["1.1 Place value", 12],
          ["Digits tell us the value of each position in a number.", 10],
          ["1.2 Ordering and comparing numbers", 12],
          ["We compare numbers from left to right.", 10],
        ],
        [
          ["Chapter 2: Algebra", 20],
          ["2.1 Using letters for unknown numbers", 12],
          ["A variable stands for a number we do not know yet.", 10],
          ["2.2 Simplifying expressions", 12],
          ["Collect like terms before you add or subtract.", 10],
        ],
        [
          ["Chapter 3: Geometry", 20],
          ["3.1 Angles and lines", 12],
          ["An angle measures the turn between two lines.", 10],
          ["3.2 Triangles", 12],
          ["The interior angles of a triangle add to 180 degrees.", 10],
        ],
      ];

  return buildPdf(pages);
}

/**
 * A miniature textbook that mirrors the real Grade 9 book:
 *  - a cover and a table of contents whose printed page numbers are offset
 *    from the PDF page indices,
 *  - chapter opening pages with a large "Chapter N" line,
 *  - per-chapter contents lists,
 *  - body pages that contain noisy exercise questions.
 *
 * Printed page 1 is PDF page 3, so the offset is +2.
 */
export function makeTextbookPdf() {
  const pages = [
    // 1. cover
    [
      ["MATHEMATICS Grade 9 Learner Book", 30],
      ["Developed and funded by the Sasol Inzalo Foundation", 11],
    ],
    // 2. table of contents (printed pages 1 and 4)
    [
      ["Table of contents", 30],
      ["Chapter 1:", 18],
      ["Whole numbers ......................................................................1", 16],
      ["Chapter 2:", 18],
      ["Algebra ....................................................................................4", 16],
    ],
    // 3. chapter 1 opening page (printed page 1)
    [
      ["Chapter 1", 36],
      ["Whole numbers", 34],
      ["1.1 Place value .............................................................................2", 11.5],
      ["1.2 Ordering numbers ...................................................................3", 11.5],
      ["CHAPTER 1: WHOLE NUMBERS", 10.5],
    ],
    // 4. printed page 2 - section 1.1 with a noisy exercise
    [
      ["1.1 Place value", 12],
      ["Each digit has a value that depends on its position.", 10],
      ["1. (a) Is there a smallest natural number, that means a natural number smaller than all others?", 10],
      ["21 + 25 = 46 and 24 + 1 = 25.", 10],
      ["CHAPTER 1: WHOLE NUMBERS 2", 10],
    ],
    // 5. printed page 3 - section 1.2
    [
      ["1.2 Ordering numbers", 12],
      ["We compare numbers from left to right.", 10],
      ["2. (b) Which number is larger?", 10],
      ["CHAPTER 1: WHOLE NUMBERS 3", 10],
    ],
    // 6. chapter 2 opening page (printed page 4)
    [
      ["Chapter 2", 36],
      ["Algebra", 34],
      ["2.1 Variables ................................................................................5", 11.5],
      ["CHAPTER 2: ALGEBRA", 10.5],
    ],
    // 7. printed page 5 - section 2.1
    [
      ["2.1 Variables", 12],
      ["A variable stands for a number we do not know yet.", 10],
      ["3. (a) Write an expression for the sum.", 10],
      ["CHAPTER 2: ALGEBRA 5", 10],
    ],
  ];

  return buildPdf(pages);
}

/** A book with no table of contents, packed with the noise that broke the old detector. */
export function makeNoisyPdf() {
  const pages = [
    [
      ["MATHEMATICS", 30],
      ["Grade 9 Book 1 CAPS Learner Book", 18],
      ["Developed and funded as an ongoing project by the Sasol Inzalo Foundation", 10],
    ],
    [
      ["Chapter 1", 20],
      ["Whole numbers", 18],
      ["1.1 Properties of numbers", 12],
      ["1. (a) Is there a smallest natural number, that means a natural number that is smaller", 10],
      ["21 + 25 = 46 and 24 + 1 = 25. If you are working with whole numbers, in other words", 10],
      ["CHAPTER 1: WHOLE NUMBERS 3", 10],
    ],
    [
      ["1.2 Calculations with whole numbers", 12],
      ["4. (a) What is the smallest natural number?", 10],
      ["3 758 3", 10],
      ["5 486 5", 10],
      ["CHAPTER 1: WHOLE NUMBERS 7", 10],
    ],
  ];

  return buildPdf(pages);
}
