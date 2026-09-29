import { describe, expect, it } from "vitest";
import { sanitizeEmailHtml } from "./sanitize";

describe("email HTML sanitizer (D-028)", () => {
  it("renders scripts and handlers inert", () => {
    const { html } = sanitizeEmailHtml(`
      <p onclick="alert(1)">Hi</p>
      <script>fetch('/api/v1/vtk/palette')</script>
      <img src=x onerror="alert(document.cookie)">
      <a href="javascript:alert(1)">click</a>
      <iframe src="https://evil.test"></iframe>
      <form action="https://evil.test"><input name=a></form>
      <object data="x.swf"></object><embed src="x.swf">
      <meta http-equiv="refresh" content="0;url=https://evil.test">
      <svg><script>alert(1)</script></svg>
      <base href="https://evil.test/">`);
    expect(html).not.toMatch(
      /<script|onerror|onclick|javascript:|<iframe|<form|<input|<object|<embed|<meta|<svg|<base/i,
    );
    expect(html).toContain("<p>Hi</p>");
    expect(html).toContain(">click</a>");
  });

  it("holds back remote images and backgrounds, keeps inline ones", () => {
    const res = sanitizeEmailHtml(`
      <img src="https://tracker.test/pixel.gif" alt="t">
      <img src="cid:logo1" alt="logo">
      <td background="https://x.test/bg.png">x</td>
      <div style="background:url('https://x.test/a.png');color:red">y</div>`);
    expect(res.hasRemoteImages).toBe(true);
    expect(res.html).toContain('data-dopl-src="https://tracker.test/pixel.gif"');
    expect(res.html).not.toMatch(/\ssrc="https:/);
    expect(res.html).toContain('src="cid:logo1"');
    expect(res.html).not.toContain("x.test/a.png");
    expect(res.html).toContain("color:red");
  });

  it("opens links in a new tab without an opener", () => {
    const { html, hasRemoteImages } = sanitizeEmailHtml('<a href="https://vtk.be">VTK</a>');
    expect(hasRemoteImages).toBe(false);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });
});
