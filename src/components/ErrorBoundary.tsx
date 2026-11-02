import { Component, type ReactNode } from 'react';

// Keeps one failing tab from blanking the whole page, and says what is safe.
export default class ErrorBoundary extends Component<{ message: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <p className="sim-empty">{this.props.message}</p> : this.props.children;
  }
}
