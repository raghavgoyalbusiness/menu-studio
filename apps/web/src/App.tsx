import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from "react-router";
import { AppShell } from "./components/AppShell.tsx";
import { Toaster } from "./components/toast.tsx";
import { Spinner } from "./components/ui.tsx";
import { queryClient, useMe } from "./lib/queries.ts";
import { initSession, useSession } from "./lib/session.ts";
import { AuthCallback, InviteAccept, SignIn } from "./routes/auth/Auth.tsx";
import { Dashboard } from "./routes/dashboard/Dashboard.tsx";
import { Onboarding } from "./routes/onboarding/Onboarding.tsx";
import { NewProject } from "./routes/projects/NewProject.tsx";
import { PrintRoute } from "./routes/print/PrintRoute.tsx";
import { PrintTent } from "./routes/print/PrintTent.tsx";

function Privacy() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-[14.5px] leading-relaxed text-ink-2">
      <h1 className="display mb-6 text-[44px] text-ink">Privacy</h1>
      <p className="mb-4">Placeholder privacy notice. Replace with your reviewed policy before launch.</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>We store the menus, designs and uploads you create so you can edit and publish them.</li>
        <li>Menu photos are sent to Anthropic's API to read their content. EXIF metadata is removed before upload is stored.</li>
        <li>QR menu analytics are anonymous counts. No cookies, IP addresses or device identifiers are stored.</li>
        <li>You can download all your data or delete your account from Settings at any time.</li>
      </ul>
    </div>
  );
}

const Review = lazy(() => import("./routes/review/Review.tsx").then((m) => ({ default: m.Review })));
const Brief = lazy(() => import("./routes/brief/Brief.tsx").then((m) => ({ default: m.Brief })));
const Concepts = lazy(() => import("./routes/concepts/Concepts.tsx").then((m) => ({ default: m.Concepts })));
const EditorPage = lazy(() => import("./routes/editor/EditorPage.tsx").then((m) => ({ default: m.EditorPage })));
const Publish = lazy(() => import("./routes/publish/Publish.tsx").then((m) => ({ default: m.Publish })));
const QuickEdit = lazy(() => import("./routes/publish/QuickEdit.tsx").then((m) => ({ default: m.QuickEdit })));
const Engineering = lazy(() => import("./routes/engineering/Engineering.tsx").then((m) => ({ default: m.Engineering })));
const Billing = lazy(() => import("./routes/billing/Billing.tsx").then((m) => ({ default: m.Billing })));
const Settings = lazy(() => import("./routes/settings/Settings.tsx").then((m) => ({ default: m.Settings })));
const Agency = lazy(() => import("./routes/agency/Agency.tsx").then((m) => ({ default: m.Agency })));
const Admin = lazy(() => import("./routes/admin/Admin.tsx").then((m) => ({ default: m.Admin })));
const RendererGallery = lazy(() => import("./routes/dev/RendererGallery.tsx").then((m) => ({ default: m.RendererGallery })));

function FullPageSpinner() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center text-muted">
      <Spinner size={20} />
    </div>
  );
}

function RequireAuth() {
  const status = useSession((s) => s.status);
  const location = useLocation();
  if (status === "loading") return <FullPageSpinner />;
  if (status === "signed_out") return <Navigate to={`/auth/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}

function RequireOrg({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isLoading) return <FullPageSpinner />;
  if (me.data && me.data.orgs.length === 0) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

const shell = (node: ReactNode) => (
  <RequireOrg>
    <AppShell>
      <Suspense fallback={<FullPageSpinner />}>{node}</Suspense>
    </AppShell>
  </RequireOrg>
);

const bare = (node: ReactNode) => (
  <RequireOrg>
    <Suspense fallback={<FullPageSpinner />}>{node}</Suspense>
  </RequireOrg>
);

const router = createBrowserRouter([
  { path: "/auth/sign-in", element: <SignIn /> },
  { path: "/auth/callback", element: <AuthCallback /> },
  { path: "/print/:projectId/:versionId", element: <PrintRoute /> },
  { path: "/print-tent", element: <PrintTent /> },
  { path: "/privacy", element: <Privacy /> },
  {
    path: "/dev/renderer",
    element: (
      <Suspense fallback={<FullPageSpinner />}>
        <RendererGallery />
      </Suspense>
    ),
  },
  {
    element: <RequireAuth />,
    children: [
      { path: "/invite", element: <InviteAccept /> },
      { path: "/onboarding", element: <Onboarding /> },
      { path: "/", element: shell(<Dashboard />) },
      { path: "/venues/:venueId/new", element: shell(<NewProject />) },
      { path: "/projects/:projectId/review", element: shell(<Review />) },
      { path: "/projects/:projectId/brief", element: shell(<Brief />) },
      { path: "/projects/:projectId/concepts", element: bare(<Concepts />) },
      { path: "/projects/:projectId/editor", element: bare(<EditorPage />) },
      { path: "/projects/:projectId/publish", element: shell(<Publish />) },
      { path: "/projects/:projectId/quick-edit", element: shell(<QuickEdit />) },
      { path: "/projects/:projectId/engineering", element: shell(<Engineering />) },
      { path: "/billing", element: shell(<Billing />) },
      { path: "/settings", element: shell(<Settings />) },
      { path: "/agency", element: shell(<Agency />) },
      { path: "/admin", element: shell(<Admin />) },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  useEffect(() => {
    void initSession();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipPrimitive.Provider>
        <RouterProvider router={router} />
        <Toaster />
      </TooltipPrimitive.Provider>
    </QueryClientProvider>
  );
}
