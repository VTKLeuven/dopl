export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-8 py-7" data-testid={`section-${title}`}>
      <h2 className="mb-4 text-caption font-medium tracking-wide text-fg-muted uppercase">
        {title}
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function Row({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {label ? <span className="w-28 shrink-0 text-small text-fg-muted">{label}</span> : null}
      {children}
    </div>
  );
}

export function Swatch({ name, varName }: { name: string; varName: string }) {
  return (
    <div className="flex w-24 flex-col gap-1">
      <div
        className="h-10 rounded-chip border border-border"
        style={{ background: `var(${varName})` }}
      />
      <span className="text-caption text-fg-muted">{name}</span>
    </div>
  );
}
