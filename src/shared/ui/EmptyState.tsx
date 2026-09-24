import type { ReactNode } from 'react';

export function EmptyState({ icon, children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="glass-panel max-w-md rounded-3xl px-8 py-10 text-center">
      {icon && <div className="mb-3 text-4xl">{icon}</div>}
      <div className="text-sm text-ink-600">{children}</div>
    </div>
  );
}
