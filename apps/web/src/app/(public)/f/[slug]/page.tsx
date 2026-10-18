import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { PublicFormQuerySchema } from "@dopl/shared/schemas/intake";
import { getPublicForm } from "@/server/queries/public-forms";
import { messagesFor, type AppLocale } from "@/i18n/messages";
import { Skeleton } from "@/components/ui/skeleton";
import { PublicForm, type FormMode } from "@/features/intake/public-form";

export const metadata: Metadata = { title: "Form", robots: { index: false, follow: false } };

/**
 * Public intake form (ARCHITECTURE §6). The shell prerenders; the cached
 * form definition streams in. `?embed=1` renders without chrome for an
 * iframe, `?embed=modal` for the embed.js modal. `?lang=nl` shows Dopl's own
 * words in Dutch, and `?email=` / `?name=` prefill the contact fields (D-142).
 */
export default function PublicFormPage({ params, searchParams }: PageProps<"/f/[slug]">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Form params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Form({
  params,
  searchParams,
}: Pick<PageProps<"/f/[slug]">, "params" | "searchParams">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const form = await getPublicForm(slug);
  if (!form) notFound();
  const embed = typeof sp.embed === "string" ? sp.embed : null;
  const mode: FormMode = embed === "modal" ? "modal" : embed ? "embed" : "page";
  const origin = typeof sp.origin === "string" ? sp.origin : null;
  const { lang, email, name } = PublicFormQuerySchema.parse(sp);
  const prefill = { email, name };
  if (mode === "page")
    return (
      <div className="flex min-h-dvh justify-center px-4 pt-[8vh] pb-16">
        <div className="flex w-full flex-col gap-3 sm:max-w-[560px]" lang={lang}>
          {form.onFeedbackPage ? <BackToFeedback locale={lang} /> : null}
          <FormLocale locale={lang}>
            <PublicForm form={form} mode={mode} prefill={prefill} />
          </FormLocale>
        </div>
      </div>
    );
  return (
    <div className="min-h-dvh bg-surface" lang={lang}>
      <FormLocale locale={lang}>
        <PublicForm form={form} mode={mode} originParam={origin} prefill={prefill} />
      </FormLocale>
    </div>
  );
}

/**
 * The rest of Dopl stays English (D-043), so only the form's own namespace
 * goes to the client in another language; English needs no second provider.
 */
function FormLocale({ locale, children }: { locale: AppLocale; children: React.ReactNode }) {
  if (locale === "en") return children;
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={{ publicForm: messagesFor(locale).publicForm }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

/** Forms listed on /feedback (D-139) lead back to the others. */
async function BackToFeedback({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "feedbackPage" });
  return (
    <Link
      href="/feedback"
      className="inline-flex items-center gap-1.5 self-start rounded-chip text-small font-medium text-fg-muted focus-ring transition-colors hover:text-fg"
      data-testid="back-to-feedback"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      {t("back")}
    </Link>
  );
}

function FormSkeleton() {
  return (
    <div className="flex min-h-dvh justify-center px-4 pt-[8vh] pb-16" aria-busy>
      <div className="flex w-full flex-col gap-5 rounded-panel border border-border bg-surface p-7 shadow-card sm:max-w-[560px]">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-3.5 w-full" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-full rounded-control" />
          </div>
        ))}
      </div>
    </div>
  );
}
