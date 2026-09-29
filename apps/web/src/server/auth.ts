import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink, twoFactor } from "better-auth/plugins";
import { sso } from "@better-auth/sso";
import { db } from "./db";
import { env, googleEnabled } from "./env";
import { queueEmail } from "./email/outbox";
import { acceptPendingInvites, canStartSession, isEligibleEmail } from "./auth-gate";

const isProd = env.NODE_ENV === "production";

/**
 * Better Auth — invite-only across every method (D-050).
 * Users are created by Dopl's invite service; Better Auth never signs anyone up.
 */
export const auth = betterAuth({
  appName: "Dopl",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  trustedOrigins: [env.APP_URL],
  advanced: {
    database: { generateId: false },
    useSecureCookies: isProd,
    cookiePrefix: "dopl",
  },
  // Clients can't register SSO providers — only admins, via a server action.
  disabledPaths: ["/sso/register"],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  user: {
    additionalFields: {
      kind: { type: "string", required: false, input: false, defaultValue: "HUMAN" },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      if (!(await isEligibleEmail(user.email))) return;
      await db.$transaction((tx) =>
        queueEmail(tx, { template: "auth.reset_password", to: user.email, data: { url }, userId: user.id }),
      );
    },
  },
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID ?? "",
          clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
          disableSignUp: true,
          prompt: "select_account",
        },
      }
    : {},
  account: {
    accountLinking: {
      enabled: true,
      // Google and admin-registered SSO providers may attach to an invited
      // user by verified email. Nothing else links implicitly.
      trustedProviders: async (request) => {
        // Called without a request during initialisation (and at build time):
        // answer statically there, and only hit the DB for real sign-ins.
        if (!request) return ["google"];
        try {
          const providers = await db.ssoProvider.findMany({ select: { providerId: true } });
          return ["google", ...providers.map((p) => p.providerId)];
        } catch {
          return ["google"];
        }
      },
    },
  },
  rateLimit: {
    enabled: isProd,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 5 },
      "/sign-in/magic-link": { window: 10 * 60, max: 5 },
      "/request-password-reset": { window: 15 * 60, max: 3 },
      "/two-factor/verify-totp": { window: 5 * 60, max: 5 },
      "/two-factor/verify-backup-code": { window: 5 * 60, max: 5 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Invite-only: never create users from a sign-in.
        before: async () => false,
      },
    },
    session: {
      create: {
        before: async (session) => {
          if (!(await canStartSession(session.userId))) return false;
        },
        after: async (session) => {
          await acceptPendingInvites(session.userId, {
            ip: session.ipAddress ?? null,
            userAgent: session.userAgent ?? null,
          });
        },
      },
    },
  },
  plugins: [
    magicLink({
      disableSignUp: true,
      expiresIn: 10 * 60,
      sendMagicLink: async ({ email, url }) => {
        const eligible = await isEligibleEmail(email);
        if (!eligible) return; // silent: same response for unknown addresses
        await db.$transaction((tx) =>
          queueEmail(tx, { template: "auth.magic_link", to: email, data: { url }, userId: eligible.userId }),
        );
      },
    }),
    twoFactor({ issuer: "Dopl" }),
    sso({ disableImplicitSignUp: true }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
