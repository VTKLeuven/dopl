import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { googleEnabled } from "@/server/env";
import { Skeleton } from "@/components/ui/skeleton";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("signIn") };
}

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInSkeleton />}>
      <SignInForm googleEnabled={googleEnabled} />
    </Suspense>
  );
}

function SignInSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-9 w-full rounded-control" />
      <Skeleton className="h-9 w-full rounded-control" />
      <Skeleton className="h-9 w-full rounded-control" />
    </div>
  );
}
