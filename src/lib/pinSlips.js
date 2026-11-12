const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/**
 * Open a print-ready page with one slip per student. The PINs only exist in
 * this response, so the teacher should print or hand them out immediately.
 */
export function printPinSlips({ className, joinUrl, joinCode, slips }) {
  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) return false;

  const cards = slips
    .map(
      (slip) => `
        <article class="slip">
          <p class="eyebrow">MASTERY · Classroom pilot</p>
          <h2>${escapeHtml(className)}</h2>
          <p class="name">${escapeHtml(slip.displayName)}</p>
          <div class="row">
            <div>
              <span class="label">Class code</span>
              <span class="code">${escapeHtml(joinCode)}</span>
            </div>
            <div>
              <span class="label">PIN</span>
              <span class="code">${escapeHtml(slip.pin)}</span>
            </div>
          </div>
          <p class="url">Sign in at <strong>${escapeHtml(joinUrl)}</strong></p>
          <p class="note">Keep this PIN private. Ask your teacher for a new one if it stops working.</p>
        </article>`,
    )
    .join("");

  win.document.open();
  win.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>PIN slips · ${escapeHtml(className)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; background: #fff; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .slip { border: 1.5px dashed #94a3b8; border-radius: 14px; padding: 18px; break-inside: avoid; }
    .eyebrow { margin: 0; font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #64748b; }
    h2 { margin: 6px 0 0; font-size: 15px; }
    .name { margin: 14px 0 12px; font-size: 22px; font-weight: 800; }
    .row { display: flex; gap: 28px; }
    .label { display: block; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #64748b; }
    .code { display: block; margin-top: 2px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 24px; font-weight: 700; letter-spacing: .2em; }
    .url { margin: 14px 0 0; font-size: 11px; color: #475569; word-break: break-all; }
    .note { margin: 10px 0 0; font-size: 10px; line-height: 1.5; color: #94a3b8; }
    @media print { body { padding: 0; } .slip { border-color: #cbd5e1; } }
  </style>
</head>
<body>
  <div class="grid">${cards}</div>
  <script>window.addEventListener("load", () => { window.focus(); window.print(); });</script>
</body>
</html>`);
  win.document.close();
  return true;
}
