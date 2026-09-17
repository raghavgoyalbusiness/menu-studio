import * as Sentry from "@sentry/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles/app.css";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (dsn) {
  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_ENVIRONMENT as string | undefined) ?? "development",
    tracesSampleRate: 0.1,
    // Menu content is the owner's business data: never ship it to an error tracker.
    sendDefaultPii: false,
    beforeBreadcrumb: (crumb) => (crumb.category === "console" ? null : crumb),
  });
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
