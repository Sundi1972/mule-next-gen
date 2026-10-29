import { Component, type ErrorInfo, type ReactNode } from 'react';

interface EventBoundaryProps {
  children: ReactNode;
  /** What stands in for the show once it has thrown: nothing, unless the caller's screen needs something under it. */
  fallback?: ReactNode;
}

/**
 * Around the show's layers and rails: if the show throws, it goes away and the screen under it still renders. It logs
 * once and never rethrows; it stays down for the rest of its mount.
 */
export class EventBoundary extends Component<EventBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The event show broke; the screen goes on without it.', error, info.componentStack);
  }

  override render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
