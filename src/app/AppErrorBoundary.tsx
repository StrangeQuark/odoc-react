import { Component, type ReactNode } from 'react';

type AppErrorBoundaryProps = { children: ReactNode };
type AppErrorBoundaryState = { hasError: boolean };

/** Keeps a failed route or lazy feature from turning the whole application blank. */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
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
            <button onClick={() => this.setState({ hasError: false })}>
              Try again
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
