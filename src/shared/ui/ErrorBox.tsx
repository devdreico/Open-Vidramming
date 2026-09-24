import type { ReactNode } from 'react';

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="card-error">{children}</div>;
}
