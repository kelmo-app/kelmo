import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';

interface State {
  error: Error | null;
}

/** Last-resort error state so a rendering bug never leaves a blank window. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[KELMO] render error', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bad/10 text-bad">
          <AlertTriangle size={26} aria-hidden />
        </span>
        <h2 className="text-lg font-semibold text-fg">Something went wrong on this screen</h2>
        <p className="text-[13px] text-fg2">{this.state.error.message || 'An unexpected error occurred.'} Your downloads are not affected.</p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload KELMO
          </Button>
        </div>
      </div>
    );
  }
}
