export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full">
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-950/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-ink-950 to-vg-600 transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      {label && <p className="mt-1.5 text-xs text-ink-500">{label}</p>}
    </div>
  );
}
