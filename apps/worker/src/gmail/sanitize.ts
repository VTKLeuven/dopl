import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

/**
 * Email HTML, layer one of two (D-028): sanitized at ingest, before anything
 * is stored for rendering. Layer two is the reader's sandboxed iframe (no
 * scripts, no same-origin) with a strict CSP.
 *
 * - scripts, event handlers, forms, frames, objects, embeds, <base>, <link>
 *   and <meta> go; so do javascript:, vbscript: and data: links
 * - remote images (src, srcset, background) are moved to data-dopl-src so the
 *   reader shows them only on request, and hasRemoteImages is set
 * - links open in a new tab without an opener or referrer
 */
const window = new JSDOM("").window;
const purify = createDOMPurify(window);

const REMOTE = /^\s*(https?:)?\/\//i;

export interface SanitizedHtml {
  html: string;
  hasRemoteImages: boolean;
}

export function sanitizeEmailHtml(raw: string): SanitizedHtml {
  let hasRemoteImages = false;
  purify.removeAllHooks();
  purify.addHook("afterSanitizeAttributes", (node) => {
    const el = node;
    if (el.tagName === "IMG") {
      const src = el.getAttribute("src") ?? "";
      if (REMOTE.test(src)) {
        el.setAttribute("data-dopl-src", src);
        el.removeAttribute("src");
        hasRemoteImages = true;
      }
      if (el.hasAttribute("srcset")) {
        el.removeAttribute("srcset");
        hasRemoteImages = true;
      }
    }
    const bg = el.getAttribute("background");
    if (bg !== null) {
      if (REMOTE.test(bg)) hasRemoteImages = true;
      el.removeAttribute("background");
    }
    const style = el.getAttribute("style");
    if (style && /url\s*\(/i.test(style)) {
      if (/url\s*\(\s*['"]?\s*(https?:)?\/\//i.test(style)) hasRemoteImages = true;
      el.setAttribute("style", style.replace(/url\s*\([^)]*\)/gi, "none"));
    }
    if (el.tagName === "A") {
      const href = el.getAttribute("href") ?? "";
      if (/^\s*(javascript|vbscript|data):/i.test(href)) el.removeAttribute("href");
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer nofollow");
    }
  });
  const html = purify.sanitize(raw, {
    WHOLE_DOCUMENT: false,
    FORBID_TAGS: [
      "script",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "iframe",
      "frame",
      "frameset",
      "object",
      "embed",
      "base",
      "link",
      "meta",
      "svg",
      "math",
    ],
    FORBID_ATTR: ["srcdoc", "formaction", "action", "ping"],
    ADD_ATTR: ["target"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
  purify.removeAllHooks();
  return { html, hasRemoteImages };
}
