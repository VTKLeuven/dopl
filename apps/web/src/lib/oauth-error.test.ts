import { describe, expect, it } from "vitest";
import { oauthErrorKind } from "./oauth-error";

describe("oauthErrorKind", () => {
  it("reads core OAuth codes and the SSO plugin's spaced reasons alike", () => {
    expect(oauthErrorKind("signup_disabled")).toBe("notInvited");
    expect(oauthErrorKind("signup disabled")).toBe("notInvited");
    expect(oauthErrorKind("account not linked")).toBe("notLinked");
    expect(oauthErrorKind("unable_to_link_account")).toBe("notLinked");
    expect(oauthErrorKind("unable to create session")).toBe("noAccess");
    expect(oauthErrorKind("access_denied")).toBe("cancelled");
  });

  it("falls back to a generic failure, and to nothing without a code", () => {
    expect(oauthErrorKind("invalid_provider")).toBe("failed");
    expect(oauthErrorKind("discovery_failed")).toBe("failed");
    expect(oauthErrorKind(null)).toBeNull();
    expect(oauthErrorKind("  ")).toBeNull();
  });
});
