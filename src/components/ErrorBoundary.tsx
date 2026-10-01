import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** When this changes (a new screen), the boundary resets itself. */
  resetKey: string;
}

interface State {
  error: Error | null;
  key: string;
}

/**
 * A crash in one screen must not blank the whole app: show what happened and let the person
 * move on. Moving to another screen resets it automatically.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('screen crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card" role="alert">
        <h2>משהו השתבש בעמוד הזה</h2>
        <p className="muted">שאר האפליקציה תקינה. אפשר לעבור לעמוד אחר, או לנסות שוב.</p>
        <pre className="mono-box">{this.state.error.message}</pre>
        <div className="row">
          <button type="button" className="primary" onClick={() => this.setState({ error: null })}>
            נסה שוב
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            רענן את הדף
          </button>
        </div>
      </div>
    );
  }
}
