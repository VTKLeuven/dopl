import { describe, expect, it } from "vitest";
import {
  baseSubject,
  decodeHeader,
  htmlToText,
  parseAddressList,
  parseGmailMessage,
  statusAfterMessage,
  type GmailMessage,
} from "./mail";

const b64url = (s: string, encoding: BufferEncoding = "utf8") =>
  Buffer.from(s, encoding).toString("base64url");
const h = (name: string, value: string) => ({ name, value });

describe("mail domain", () => {
  it("parses address lists with quoted commas and encoded names", () => {
    expect(
      parseAddressList(
        '"Doe, Jane" <Jane@Example.test>, bob@example.test, =?utf-8?Q?Chlo=C3=A9?= <chloe@x.test>, nonsense',
      ),
    ).toEqual([
      { email: "jane@example.test", name: "Doe, Jane" },
      { email: "bob@example.test", name: null },
      { email: "chloe@x.test", name: "Chloé" },
    ]);
  });

  it("decodes RFC 2047 headers in base64 and quoted-printable", () => {
    expect(decodeHeader("=?UTF-8?B?UHJpbnRlciDwn5aoIGJyb2tlbg==?=")).toBe("Printer 🖨 broken");
    expect(decodeHeader("=?iso-8859-1?Q?Caf=E9_ferm=E9?= today")).toBe("Café fermé today");
    expect(decodeHeader("=?utf-8?Q?a?= =?utf-8?Q?b?=")).toBe("ab");
  });

  it("picks text and HTML from nested multiparts, with charsets, and lists attachments", () => {
    const msg: GmailMessage = {
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX", "UNREAD"],
      snippet: "Hi, it&#39;s broken &amp; loud",
      internalDate: "1790000000000",
      sizeEstimate: 4200,
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          h("From", "Lotte Peeters <lotte@student.example.test>"),
          h("To", "it@vtk.be"),
          h("Cc", "board@vtk.be"),
          h("Subject", "Re: Printer on the 2nd floor"),
          h("Message-ID", "<abc@mail.example.test>"),
          h("In-Reply-To", "<first@vtk.be>"),
          h("References", "<root@vtk.be> <first@vtk.be>"),
        ],
        parts: [
          {
            mimeType: "multipart/related",
            parts: [
              {
                mimeType: "multipart/alternative",
                parts: [
                  {
                    mimeType: "text/plain",
                    headers: [h("Content-Type", 'text/plain; charset="iso-8859-1"')],
                    body: { data: b64url("Café is out of paper", "latin1") },
                  },
                  {
                    mimeType: "text/html",
                    headers: [h("Content-Type", "text/html; charset=utf-8")],
                    body: { data: b64url('<p>Café <img src="cid:logo1"></p>') },
                  },
                ],
              },
              {
                mimeType: "image/png",
                filename: "",
                headers: [h("Content-ID", "<logo1>"), h("Content-Disposition", "inline")],
                body: { attachmentId: "att-logo", size: 1200 },
              },
            ],
          },
          {
            mimeType: "application/pdf",
            filename: "error-log.pdf",
            headers: [h("Content-Disposition", 'attachment; filename="error-log.pdf"')],
            body: { attachmentId: "att-pdf", size: 52_000 },
          },
        ],
      },
    };
    const p = parseGmailMessage(msg, ["it@vtk.be"]);
    expect(p.text).toBe("Café is out of paper");
    expect(p.html).toBe('<p>Café <img src="cid:logo1"></p>');
    expect(p.snippet).toBe("Hi, it's broken & loud");
    expect(p.subject).toBe("Re: Printer on the 2nd floor");
    expect(p.from).toEqual({ email: "lotte@student.example.test", name: "Lotte Peeters" });
    expect(p.cc.map((a) => a.email)).toEqual(["board@vtk.be"]);
    expect(p.rfc822MessageId).toBe("<abc@mail.example.test>");
    expect(p.inReplyTo).toBe("<first@vtk.be>");
    expect(p.references).toEqual(["<root@vtk.be>", "<first@vtk.be>"]);
    expect(p.sentAt.getTime()).toBe(1_790_000_000_000);
    expect(p.direction).toBe("INBOUND");
    expect(p.attachments).toEqual([
      {
        attachmentId: "att-logo",
        filename: "logo1",
        mimeType: "image/png",
        size: 1200,
        contentId: "logo1",
        isInline: true,
      },
      {
        attachmentId: "att-pdf",
        filename: "error-log.pdf",
        mimeType: "application/pdf",
        size: 52_000,
        contentId: null,
        isInline: false,
      },
    ]);
  });

  it("treats mail from the mailbox or its aliases, or in SENT, as outbound", () => {
    const base = (from: string, labelIds: string[] = []): GmailMessage => ({
      id: "x",
      threadId: "t",
      labelIds,
      payload: { mimeType: "text/plain", headers: [h("From", from)], body: { data: b64url("hi") } },
    });
    expect(parseGmailMessage(base("IT <IT@vtk.be>"), ["it@vtk.be"]).direction).toBe("OUTBOUND");
    expect(
      parseGmailMessage(base("helpdesk@vtk.be"), ["it@vtk.be", "helpdesk@vtk.be"]).direction,
    ).toBe("OUTBOUND");
    expect(parseGmailMessage(base("x@y.test", ["SENT"]), ["it@vtk.be"]).direction).toBe("OUTBOUND");
    expect(parseGmailMessage(base("x@y.test"), ["it@vtk.be"]).text).toBe("hi");
  });

  it("reopens solved threads on inbound mail only", () => {
    expect(statusAfterMessage("SOLVED", "INBOUND")).toEqual({ status: "OPEN", reopened: true });
    expect(statusAfterMessage("SOLVED", "OUTBOUND")).toEqual({ status: "SOLVED", reopened: false });
    expect(statusAfterMessage("IGNORED", "INBOUND")).toEqual({
      status: "IGNORED",
      reopened: false,
    });
  });

  it("strips reply prefixes and turns HTML into text", () => {
    expect(baseSubject("RE: Fwd: AW: VPN down")).toBe("VPN down");
    expect(htmlToText("<style>p{}</style><p>One</p><p>Two<br>Three</p>")).toBe("One\nTwo\nThree");
  });
});
