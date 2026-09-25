import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Cambiar este valor (p.ej. el id del código) reinicia el error guardado. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * El Scene lo compila `new Function` desde el modelo: un throw en render no debe
 * tumbar la app entera (pantalla blanca) — se muestra un fallback recuperable.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[openvg] error al renderizar la composición:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-ink-950">
            La composición falló al renderizar.
          </p>
          <p className="max-w-md break-words text-xs text-ink-500">{this.state.error.message}</p>
          <button
            type="button"
            className="btn btn-glass"
            onClick={() => this.setState({ error: null })}
          >
            Reintentar render
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
