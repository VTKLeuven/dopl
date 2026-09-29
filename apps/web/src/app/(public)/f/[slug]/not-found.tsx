import { getTranslations } from "next-intl/server";
import { FileX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default async function FormNotFound() {
  const t = await getTranslations("publicForm");
  return (
    <div className="flex min-h-dvh justify-center px-4 pt-[12vh]">
      <div className="w-full rounded-panel border border-border bg-surface shadow-card sm:max-w-[560px]">
        <EmptyState
          icon={<FileX />}
          title={t("unavailableTitle")}
          description={t("unavailableBody")}
        />
      </div>
    </div>
  );
}
