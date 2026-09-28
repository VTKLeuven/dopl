import { getRequestConfig } from "next-intl/server";

/**
 * English only for now (D-043). The locale is static on purpose: reading a
 * cookie here would make every page dynamic and defeat the static shell.
 * When Dutch lands, resolve the user's locale inside Suspense boundaries.
 */
export const defaultLocale = "en";

export default getRequestConfig(async () => ({
  locale: defaultLocale,
  timeZone: "Europe/Brussels",
  messages: (await import("../../messages/en.json")).default,
}));
