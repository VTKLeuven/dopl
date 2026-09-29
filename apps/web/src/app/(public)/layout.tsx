/** Public surface (/f, /s): no app shell, no session. */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <div className="min-h-full bg-canvas">{children}</div>;
}
