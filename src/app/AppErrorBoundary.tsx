import { Component, type ReactNode } from 'react';

type AppErrorBoundaryProps = { children: ReactNode };
type AppErrorBoundaryState = { hasError: boolean; supportId: string | null };

/** Keeps a failed route or lazy feature from turning the whole application blank. */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false, supportId: null };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    const supportId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : null;
    return { hasError: true, supportId };
  }

  componentDidCatch() {
    // Observability is intentionally introduced by P1-111. Do not log page
    // content or error internals from this foundational UI boundary.
  }

  render() {
    if (this.state.hasError) {
      return (
        <main id="main-content" className="login-shell">
          <section className="login-card" role="alert" aria-live="assertive">
            <p className="eyebrow">Unexpected error</p>
            <h1>Odoc could not display this screen.</h1>
            <p>Try loading the screen again. Your saved work is not changed.</p>
            {this.state.supportId && (
              <p className="support-detail">Support ID: {this.state.supportId}</p>
            )}
            <button onClick={() => this.setState({ hasError: false, supportId: null })}>
              Try again
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
