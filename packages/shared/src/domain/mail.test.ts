import { describe, expect, it } from "vitest";
import {
  addressedToShared,
  baseSubject,
  decodeHeader,
  htmlToText,
  matchIgnoreRule,
  normalizeRuleValue,
  parseAddressList,
  parseGmailMessage,
  senderRuleHint,
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

  it("finds the real sender behind a Google Group's rewritten From", () => {
    const msg = (...headers: Array<{ name: string; value: string }>): GmailMessage => ({
      id: "x",
      threadId: "t",
      payload: { mimeType: "text/plain", headers, body: { data: b64url("hi") } },
    });
    // DMARC rewrite: the original is in X-Original-From.
    const dmarc = parseGmailMessage(
      msg(
        h("From", "'DMARC Aggregate Report' via IT <it@vtk.be>"),
        h("X-Original-From", "DMARC Aggregate Report <dmarcreport@microsoft.com>"),
        h("X-Original-Sender", "dmarcreport@microsoft.com"),
      ),
      ["it-inbox@vtk.be"],
    );
    expect(dmarc.from).toEqual({
      email: "dmarcreport@microsoft.com",
      name: "DMARC Aggregate Report",
    });
    expect(dmarc.direction).toBe("INBOUND");
    // Only X-Original-Sender: the name comes from the wrapped one.
    expect(
      parseGmailMessage(
        msg(
          h("From", "'noreply-dmarc-support' via IT <it@vtk.be>"),
          h("X-Original-Sender", "noreply-dmarc-support@google.com"),
        ),
        ["it-inbox@vtk.be"],
      ).from,
    ).toEqual({ email: "noreply-dmarc-support@google.com", name: "noreply-dmarc-support" });
    // Every group mail has X-Original-Sender; unrewritten, From stays as it is.
    expect(
      parseGmailMessage(
        msg(h("From", "Ann <ann@example.test>"), h("X-Original-Sender", "ann@example.test")),
        ["it-inbox@vtk.be"],
      ).from,
    ).toEqual({ email: "ann@example.test", name: "Ann" });
    // A forged original can't make mail ours: direction follows From.
    const forged = parseGmailMessage(
      msg(h("From", "x@evil.test"), h("X-Original-From", "it-inbox@vtk.be")),
      ["it-inbox@vtk.be"],
    );
    expect(forged.direction).toBe("INBOUND");
    expect(forged.from.email).toBe("x@evil.test");
  });

  it("matches ignore rules on sender address or name, or subject, ignoring case", () => {
    const rules = [
      { field: "SENDER" as const, value: normalizeRuleValue(" Renovate[bot] ") },
      { field: "SENDER" as const, value: "noreply-dmarc" },
      { field: "SUBJECT" as const, value: normalizeRuleValue("Report  Domain:") },
    ];
    const m = (email: string, name: string | null, subject = "Hello") =>
      matchIgnoreRule(rules, { from: { email, name }, subject });
    expect(m("bot@github.test", "renovate[bot]")).toBe(rules[0]);
    expect(m("noreply-dmarc-support@google.com", null)).toBe(rules[1]);
    expect(m("x@y.test", null, "Report domain: vtk.be Submitter: google.com")).toBe(rules[2]);
    expect(m("ann@example.test", "Ann", "Printer broken")).toBeNull();
    // A sender rule starts from the address, or from the name a group wrapped.
    expect(senderRuleHint({ email: "bot@github.test", name: "renovate[bot]" })).toBe(
      "bot@github.test",
    );
    expect(senderRuleHint({ email: "it@vtk.be", name: "'renovate[bot]' via IT" })).toBe(
      "renovate[bot]",
    );
    // An empty rule would match everything: it matches nothing.
    expect(
      matchIgnoreRule([{ field: "SUBJECT", value: "" }], {
        from: { email: "a@b.test", name: null },
        subject: "x",
      }),
    ).toBeNull();
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

  it("knows mail that a shared mailbox tracks, so a personal one leaves it (D-138)", () => {
    const msg = (...headers: Array<{ name: string; value: string }>): GmailMessage => ({
      id: "x",
      threadId: "t",
      payload: { mimeType: "text/plain", headers, body: { data: b64url("hi") } },
    });
    const shared = new Set(["it-inbox@vtk.be", "it@vtk.be"]);
    const own = ["bram@vtk.be"];
    // To or Cc the group, in any case.
    const toGroup = parseGmailMessage(msg(h("From", "a@x.test"), h("To", "IT <IT@vtk.be>")), own);
    expect(addressedToShared(toGroup, shared)).toBe(true);
    const cc = parseGmailMessage(
      msg(h("From", "a@x.test"), h("To", "bram@vtk.be"), h("Cc", "it@vtk.be")),
      own,
    );
    expect(addressedToShared(cc, shared)).toBe(true);
    // Bcc'd to the group: only the group's own headers say so.
    const bcc = parseGmailMessage(
      msg(
        h("From", "a@x.test"),
        h("To", "someone@x.test"),
        h("Mailing-list", "list it@vtk.be; contact it+owners@vtk.be"),
        h("List-Post", "<https://groups.google.com/a/vtk.be/group/it/post>, <mailto:it@vtk.be>"),
      ),
      own,
    );
    expect(bcc.lists).toEqual(["it@vtk.be"]);
    expect(addressedToShared(bcc, shared)).toBe(true);
    // Our own reply-all to the group is the team's too.
    const reply = parseGmailMessage(
      msg(h("From", "bram@vtk.be"), h("To", "a@x.test"), h("Cc", "it@vtk.be")),
      own,
    );
    expect(reply.direction).toBe("OUTBOUND");
    expect(addressedToShared(reply, shared)).toBe(true);
    // Personal mail, and any mail when no shared mailbox is connected, stays.
    const personal = parseGmailMessage(msg(h("From", "a@x.test"), h("To", "bram@vtk.be")), own);
    expect(addressedToShared(personal, shared)).toBe(false);
    expect(addressedToShared(toGroup, new Set())).toBe(false);
  });
});
