import { Component, type ErrorInfo, type ReactNode } from 'react';
import { GAME_DEFINITION } from '../game';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  public state: AppErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(): AppErrorBoundaryState {
    return {
      hasError: true,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`${GAME_DEFINITION.title} client crashed`, error, errorInfo);
  }

  public render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="page-shell narrow">
        <section className="panel centered-panel">
          <p className="eyebrow">Client recovery</p>
          <h1>Something went wrong</h1>
          <p className="subtitle">
            The page hit an unexpected client error. Reload the app to recover your session. If the server restarted,
            the room may no longer exist.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload app
          </button>
        </section>
      </main>
    );
  }
}
