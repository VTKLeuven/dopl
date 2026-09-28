/**
 * Transactional email templates (subject + HTML + text). Rendered in the
 * worker. Inline styles use the design tokens (DESIGN_SYSTEM §3) because
 * email clients ignore stylesheets.
 */
import { z } from "zod";

export const emailTemplates = {
  "auth.invite": z.object({
    workspaceName: z.string(),
    inviterName: z.string(),
    url: z.url(),
    role: z.string(),
  }),
  "auth.magic_link": z.object({ url: z.url() }),
  "auth.reset_password": z.object({ url: z.url() }),
} as const;

export type EmailTemplateKey = keyof typeof emailTemplates;
export type EmailTemplateData<K extends EmailTemplateKey> = z.infer<(typeof emailTemplates)[K]>;

interface Rendered {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(opts: { heading: string; body: string; cta?: { label: string; url: string }; footnote?: string; appUrl: string }) {
  const button = opts.cta
    ? `<a href="${esc(opts.cta.url)}" style="display:inline-block;background:#16161A;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;line-height:20px;padding:10px 16px;border-radius:10px">${esc(opts.cta.label)}</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F5F5F6;font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #ECECEE;border-radius:16px">
<tr><td style="padding:28px 28px 8px"><img src="${esc(opts.appUrl)}/brand/dopl-mark-192.png" width="28" height="28" alt="Dopl" style="display:block"></td></tr>
<tr><td style="padding:8px 28px 0;font-size:20px;line-height:28px;font-weight:600;letter-spacing:-0.012em">${esc(opts.heading)}</td></tr>
<tr><td style="padding:8px 28px 20px;font-size:14px;line-height:22px;color:#52525B">${opts.body}</td></tr>
${button ? `<tr><td style="padding:0 28px 24px">${button}</td></tr>` : ""}
${opts.footnote ? `<tr><td style="padding:0 28px 28px;font-size:12px;line-height:16px;color:#6B6B73">${opts.footnote}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
}

export function renderEmail<K extends EmailTemplateKey>(
  key: K,
  data: EmailTemplateData<K>,
  appUrl: string,
): Rendered {
  switch (key) {
    case "auth.invite": {
      const d = data as EmailTemplateData<"auth.invite">;
      return {
        subject: `${d.inviterName} invited you to ${d.workspaceName} on Dopl`,
        html: layout({
          appUrl,
          heading: `Join ${d.workspaceName} on Dopl`,
          body: `${esc(d.inviterName)} invited you as <strong>${esc(d.role)}</strong>. Accept the invite to choose how you sign in.`,
          cta: { label: "Accept invite", url: d.url },
          footnote: "This link expires in 7 days. If you weren't expecting this, you can ignore it.",
        }),
        text: `${d.inviterName} invited you to ${d.workspaceName} on Dopl as ${d.role}.\n\nAccept: ${d.url}\n\nThis link expires in 7 days.`,
      };
    }
    case "auth.magic_link": {
      const d = data as EmailTemplateData<"auth.magic_link">;
      return {
        subject: "Your Dopl sign-in link",
        html: layout({
          appUrl,
          heading: "Sign in to Dopl",
          body: "Use the button below to sign in. The link works once and expires in 10 minutes.",
          cta: { label: "Sign in", url: d.url },
          footnote: "If you didn't request this, you can safely ignore it.",
        }),
        text: `Sign in to Dopl: ${d.url}\n\nThe link works once and expires in 10 minutes.`,
      };
    }
    case "auth.reset_password": {
      const d = data as EmailTemplateData<"auth.reset_password">;
      return {
        subject: "Reset your Dopl password",
        html: layout({
          appUrl,
          heading: "Reset your password",
          body: "Choose a new password with the button below. The link expires in 1 hour.",
          cta: { label: "Choose a new password", url: d.url },
          footnote: "If you didn't request this, your password stays unchanged.",
        }),
        text: `Reset your Dopl password: ${d.url}\n\nThe link expires in 1 hour.`,
      };
    }
    default:
      throw new Error(`Unknown email template: ${String(key)}`);
  }
}
