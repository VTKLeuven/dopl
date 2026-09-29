import { DoplLogo } from "@/components/icons/dopl-logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-col items-center bg-canvas px-4 pt-[12vh] pb-16">
      <DoplLogo className="mb-8" />
      <main className="w-full max-w-[400px] rounded-panel border border-border bg-surface p-7 shadow-card">
        {children}
      </main>
    </div>
  );
}
