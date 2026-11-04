import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("The application encountered an unexpected error.", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-error" role="alert">
          <h1>SiteSketch could not load this drawing.</h1>
          <p>Your browser-local plan may still be available after reloading the app.</p>
          <button className="button button-primary" onClick={() => window.location.reload()}>
            Reload app
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

const privateQueryParameters = [
  "customer_name",
  "customerName",
  "customer.name",
  "customer_email",
  "customerEmail",
  "job.email",
];
const currentUrl = new URL(window.location.href);
let removedPrivateParameter = false;
for (const parameter of privateQueryParameters) {
  if (currentUrl.searchParams.has(parameter)) {
    currentUrl.searchParams.delete(parameter);
    removedPrivateParameter = true;
  }
}
if (removedPrivateParameter) {
  window.history.replaceState(window.history.state, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
}

const root = document.getElementById("root");
if (!root) throw new Error("The application root element is missing.");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
