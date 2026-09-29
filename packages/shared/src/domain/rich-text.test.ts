import { describe, expect, it } from "vitest";
import {
  docToPlainText,
  extractItemRefs,
  extractMentions,
  sanitizeDoc,
  textToDoc,
} from "./rich-text";

describe("sanitizeDoc", () => {
  it("drops unknown nodes but keeps their text", () => {
    const doc = sanitizeDoc({
      type: "doc",
      content: [
        { type: "iframe", attrs: { src: "https://evil" }, content: [{ type: "text", text: "hi" }] },
      ],
    });
    expect(JSON.stringify(doc)).not.toContain("iframe");
    expect(docToPlainText(doc)).toBe("hi");
  });
  it("removes javascript: links and unknown attrs", () => {
    const doc = sanitizeDoc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { onclick: "x" },
          content: [
            {
              type: "text",
              text: "bad",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
            {
              type: "text",
              text: "good",
              marks: [{ type: "link", attrs: { href: "https://vtk.be" } }],
            },
          ],
        },
      ],
    });
    const s = JSON.stringify(doc);
    expect(s).not.toContain("javascript");
    expect(s).not.toContain("onclick");
    expect(s).toContain("https://vtk.be/");
  });
  it("returns an empty doc for garbage", () => {
    expect(sanitizeDoc("nope")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});

describe("extraction", () => {
  const doc = sanitizeDoc({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "cc " },
          { type: "mention", attrs: { id: "u1", label: "Ann" } },
          { type: "text", text: " see " },
          { type: "workItemRef", attrs: { id: "w1", identifier: "INFRA-4" } },
        ],
      },
    ],
  });
  it("finds mentions and refs", () => {
    expect(extractMentions(doc)).toEqual(["u1"]);
    expect(extractItemRefs(doc)).toEqual(["w1"]);
    expect(docToPlainText(doc)).toBe("cc @Ann see INFRA-4");
  });
  it("round-trips plain text", () => {
    expect(docToPlainText(textToDoc("a\n\nb"))).toBe("a\nb");
  });
});

describe("docToHtml (outgoing email)", () => {
  it("escapes text, keeps safe links, and flattens chips", async () => {
    const { docToHtml } = await import("./rich-text");
    const html = docToHtml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hi <Lotte> & " },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            {
              type: "text",
              text: " x",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
            {
              type: "text",
              text: " docs",
              marks: [{ type: "link", attrs: { href: "https://vtk.be/it" } }],
            },
            { type: "mention", attrs: { id: "u1", label: "Bram" } },
            { type: "workItemRef", attrs: { id: "i1", identifier: "INFRA-7", label: "INFRA-7" } },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }],
            },
          ],
        },
      ],
    });
    expect(html).toBe(
      '<p>Hi &lt;Lotte&gt; &amp; <strong>bold</strong> x<a href="https://vtk.be/it"> docs</a>@BramINFRA-7</p><ul><li><p>one</p></li></ul>',
    );
  });
});
