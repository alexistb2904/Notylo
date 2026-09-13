import { Component, type ErrorInfo, type ReactNode } from "react";
import { errorMessages } from "../i18n/error";
import { BrandMark } from "./BrandMark";

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
}

interface AppErrorBoundaryState {
  readonly failed: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep diagnostics useful without logging notebook content, API responses,
    // credentials, URLs or arbitrary error messages that could contain data.
    console.error("Notylo UI failure", {
      name: error.name,
      componentStack: info.componentStack
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="fatal-state app-error-boundary" role="alert">
        <BrandMark />
        <p className="eyebrow">{errorMessages.eyebrow}</p>
        <h1>{errorMessages.title}</h1>
        <p>{errorMessages.description}</p>
        <div className="app-error-actions">
          <button type="button" className="primary-action" onClick={() => window.location.reload()}>
            {errorMessages.reload}
          </button>
          <button type="button" className="outline-action" onClick={() => window.location.assign("/")}>
            {errorMessages.home}
          </button>
        </div>
      </main>
    );
  }
}
