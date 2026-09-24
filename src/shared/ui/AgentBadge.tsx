import { cn } from '../lib/cn';

export function AgentBadge({ status }: { status: string }) {
  const active = /indexando|generando|preparando|skills|codificando|capturando/i.test(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide backdrop-blur-md',
        active
          ? 'border-vg-300/60 bg-vg-50/80 text-vg-700'
          : 'border-ink-950/10 bg-white/70 text-ink-600',
      )}
      title="Agente oculto que orquesta skills, archivos y flujo de trabajo"
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          active ? 'animate-pulse bg-vg-500' : 'bg-emerald-500',
        )}
      />
      OPENVG-AGENT
      <span className="font-normal text-ink-400">· {status}</span>
    </span>
  );
}
