import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isAppLocale, messagesFor } from "./messages";

/**
 * English for the app (D-043). The locale is static on purpose: reading a
 * cookie here would make every page dynamic and defeat the static shell.
 * A page can still ask for Dutch explicitly (`getTranslations({ locale })`),
 * which only the public form does (D-142).
 */
export default getRequestConfig(async ({ locale }) => {
  const resolved = isAppLocale(locale) ? locale : defaultLocale;
  return {
    locale: resolved,
    timeZone: "Europe/Brussels",
    messages: messagesFor(resolved),
  };
});
