"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * Email HTML, layer two (D-028): the ingest-sanitized HTML in an iframe with
 * no scripts and no same-origin access, and a CSP that blocks every remote
 * load (remote images were moved to data-dopl-src at ingest). Links open in a
 * new tab. Without same-origin the page can't measure the email, so the
 * height is estimated from its text and can be expanded (D-109).
 */
export const EMAIL_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";
const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";

function frameDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="referrer" content="no-referrer"><base target="_blank"><style>html,body{margin:0;padding:0}body{font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}img[data-dopl-src]{display:none}table{max-width:100%}blockquote{margin:0 0 0 8px;padding-left:8px;border-left:2px solid rgba(0,0,0,.15)}</style></head><body>${html}</body></html>`;
}

/** Rough height from the text: enough for short mails, capped for long ones. */
function estimateHeight(text: string, expanded: boolean): number {
  const lines = text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 95)), 0);
  const px = lines * 22 + 40;
  return expanded ? Math.max(px, 400) : Math.min(Math.max(px, 96), 520);
}

export function EmailFrame({ html, text, title }: { html: string; text: string; title: string }) {
  const t = useTranslations("mail.reader");
  const [expanded, setExpanded] = useState(false);
  const doc = useMemo(() => frameDoc(html), [html]);
  const height = estimateHeight(text, expanded);
  const long = estimateHeight(text, false) >= 520;
  return (
    <div className="flex flex-col gap-1">
      <iframe
        title={title}
        sandbox={EMAIL_SANDBOX}
        srcDoc={doc}
        referrerPolicy="no-referrer"
        loading="lazy"
        className="w-full rounded-control border-0 bg-surface"
        style={{ height }}
        data-testid="email-frame"
      />
      {long ? (
        <Button
          variant="link"
          size="xs"
          className="self-start"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t("showLess") : t("showMore")}
        </Button>
      ) : null}
    </div>
  );
}
