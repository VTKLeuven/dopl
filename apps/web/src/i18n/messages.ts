import en from "../../messages/en.json";
import nl from "../../messages/nl.json";

/**
 * Dopl is English (D-043). Dutch exists only for what someone outside the team
 * reads: the public form, chosen with `?lang=nl` by the site that links or
 * embeds it (D-142). nl.json therefore holds a few namespaces, and every other
 * namespace stays English.
 */
export const appLocales = ["en", "nl"] as const;
export type AppLocale = (typeof appLocales)[number];
export const defaultLocale: AppLocale = "en";

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (appLocales as readonly string[]).includes(value);
}

type Catalogue = typeof en;

// A Dutch namespace must carry every key of the English one: a missing key
// fails the typecheck here instead of rendering as `publicForm.sendingAs`.
const dutch: Pick<Catalogue, keyof typeof nl> = nl;

export function messagesFor(locale: AppLocale): Catalogue {
  return locale === "nl" ? { ...en, ...dutch } : en;
}
