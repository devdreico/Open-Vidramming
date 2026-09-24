export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-vg-500 border-t-transparent" />
      {label && <p className="text-sm text-ink-600">{label}</p>}
    </div>
  );
}
