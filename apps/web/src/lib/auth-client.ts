"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient, twoFactorClient } from "better-auth/client/plugins";
import { ssoClient } from "@better-auth/sso/client";

export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        // Runs outside React (inside the auth client), so no router here.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/sign-in/two-factor";
      },
    }),
    ssoClient(),
  ],
});
