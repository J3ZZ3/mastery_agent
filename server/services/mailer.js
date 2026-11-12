import { config } from "../config.js";

/**
 * Tiny mail transport for teacher account emails.
 *
 * - `console` (default): the message and its link are printed to the server log.
 *   This is deliberate for a pilot: no external provider is required, and the
 *   operator can hand the link to the teacher.
 * - `resend`: sends through Resend's HTTP API.
 * - `disabled`: drops the message (useful for local development).
 *
 * In non-production environments every message is also kept in a small
 * in-memory outbox so tests can read the token from the link without a mail
 * provider. Production never keeps message bodies in memory.
 */

const OUTBOX_LIMIT = 50;
const outbox = [];

export function getOutbox() {
  return outbox.slice();
}

export function clearOutbox() {
  outbox.length = 0;
}

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

async function sendWithResend({ to, subject, text, html }) {
  if (!config.resendApiKey) {
    throw new Error("EMAIL_DELIVERY=resend requires RESEND_API_KEY.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend rejected the message (${response.status}): ${detail.slice(0, 300)}`);
  }

  return { delivered: true, transport: "resend" };
}

export async function sendMail({ to, subject, text, html }) {
  if (!to) throw new Error("A recipient email address is required.");

  const message = {
    to,
    subject,
    text,
    html,
    sentAt: new Date().toISOString(),
  };

  if (config.nodeEnv !== "production") {
    outbox.push(message);
    if (outbox.length > OUTBOX_LIMIT) outbox.shift();
  }

  if (config.emailDelivery === "disabled") {
    return { delivered: false, transport: "disabled" };
  }

  if (config.emailDelivery === "resend") {
    return sendWithResend(message);
  }

  if (config.emailDelivery !== "console") {
    throw new Error(`Unknown EMAIL_DELIVERY value: ${config.emailDelivery}`);
  }

  console.log(
    `\n[MASTERY email] To: ${to}\nSubject: ${subject}\n\n${text}\n`,
  );
  return { delivered: true, transport: "console" };
}

/* ------------------------------------------------------------------ */
/* Teacher account messages                                            */
/* ------------------------------------------------------------------ */

const layout = ({ title, body, action, actionUrl, note }) => `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
    <p style="font-size:12px;font-weight:700;letter-spacing:.16em;color:#64748b;margin:0 0 24px">MASTERY</p>
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px">${escapeHtml(title)}</h1>
    <p style="font-size:14px;line-height:1.7;color:#475569;margin:0 0 20px">${body}</p>
    ${
      actionUrl
        ? `<p style="margin:0 0 24px"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:12px">${escapeHtml(action)}</a></p>
           <p style="font-size:12px;line-height:1.6;color:#64748b;margin:0 0 8px">If the button does not work, copy this link into your browser:</p>
           <p style="font-size:12px;line-height:1.6;word-break:break-all;margin:0 0 24px"><a href="${escapeHtml(actionUrl)}" style="color:#047857">${escapeHtml(actionUrl)}</a></p>`
        : ""
    }
    <p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:24px 0 0;border-top:1px solid #e2e8f0;padding-top:16px">${escapeHtml(note)}</p>
  </div>
`;

export function passwordResetEmail({ teacher, token }) {
  const url = `${config.appOrigin}/portal/teacher/reset-password?token=${encodeURIComponent(token)}`;
  const minutes = config.passwordResetTtlMinutes;

  return {
    to: teacher.email,
    subject: "Reset your MASTERY password",
    text: [
      `Hi ${teacher.name},`,
      "",
      "We received a request to reset your MASTERY teacher password.",
      `Open this link to choose a new password (valid for ${minutes} minutes):`,
      url,
      "",
      "If you did not ask for this, you can ignore this email. Your password will not change.",
      "",
      "MASTERY classroom pilot",
    ].join("\n"),
    html: layout({
      title: "Reset your password",
      body: `Hi ${escapeHtml(teacher.name)}, we received a request to reset your MASTERY teacher password. This link is valid for ${minutes} minutes.`,
      action: "Choose a new password",
      actionUrl: url,
      note: "If you did not ask for this, you can ignore this email. Your password will not change.",
    }),
  };
}

export function upgradeRequestEmail({ teacher, note }) {
  const lines = [
    `${teacher.name} <${teacher.email}> asked to upgrade from the free pilot.`,
    "",
    note ? `Note from the teacher:\n${note}` : "No note was included.",
    "",
    "Activate the paid plan with the billing webhook or:",
    `node server/scripts/setPlan.js ${teacher.email} paid`,
    "",
    "MASTERY classroom pilot",
  ];

  return {
    to: config.billingNotifyEmail,
    subject: `MASTERY upgrade request: ${teacher.name}`,
    text: lines.join("\n"),
    html: layout({
      title: "Upgrade request",
      body: `${escapeHtml(teacher.name)} (${escapeHtml(teacher.email)}) asked to upgrade from the free pilot. ${
        note ? `They wrote: “${escapeHtml(note)}”` : "No note was included."
      }`,
      action: "Open the teacher dashboard",
      actionUrl: `${config.appOrigin}/portal/teacher/billing`,
      note: "Activate the paid plan with the billing webhook or the setPlan script.",
    }),
  };
}

export function emailVerificationEmail({ teacher, token }) {
  const url = `${config.appOrigin}/portal/teacher/verify-email?token=${encodeURIComponent(token)}`;
  const hours = config.emailVerificationTtlHours;

  return {
    to: teacher.email,
    subject: "Verify your MASTERY email address",
    text: [
      `Hi ${teacher.name},`,
      "",
      "Confirm this email address for your MASTERY teacher account.",
      `Open this link to verify it (valid for ${hours} hours):`,
      url,
      "",
      "If you did not create a MASTERY account, you can ignore this email.",
      "",
      "MASTERY classroom pilot",
    ].join("\n"),
    html: layout({
      title: "Verify your email address",
      body: `Hi ${escapeHtml(teacher.name)}, confirm this email address for your MASTERY teacher account. This link is valid for ${hours} hours.`,
      action: "Verify my email",
      actionUrl: url,
      note: "If you did not create a MASTERY account, you can ignore this email.",
    }),
  };
}
