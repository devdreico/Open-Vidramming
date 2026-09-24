import type { ReactNode } from 'react';

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/30 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="glass-panel-strong max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-950">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost rounded-full px-2 py-1 text-ink-500"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
