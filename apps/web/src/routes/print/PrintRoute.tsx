import { MenuRenderer } from "@menu-studio/renderer";
import type { LayoutSpec, MenuDocument } from "@menu-studio/shared";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { API_URL } from "../../lib/api.ts";

interface PrintData {
  document: MenuDocument;
  spec: LayoutSpec;
  logoUrl: string | null;
  timezone: string;
}

/**
 * Chrome-less route the export worker opens. Data comes from the API with a short-lived
 * signed token; the renderer publishes window.__MENU_RENDER__ when fonts and fit are ready.
 */
export function PrintRoute() {
  const [params] = useSearchParams();
  const [data, setData] = useState<PrintData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = params.get("token") ?? "";

  useEffect(() => {
    document.documentElement.style.background = "#fff";
    document.body.style.background = "#fff";
    document.body.style.margin = "0";
    fetch(`${API_URL}/print-data?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Print data request failed (${res.status})`);
        setData((await res.json()) as PrintData);
      })
      .catch((e: Error) => {
        setError(e.message);
        window.__MENU_RENDER__ = { status: "ready", fontsLoaded: false, report: { fits: false, fontsLoaded: false, pages: [], appliedSteps: [], message: e.message } };
      });
  }, [token]);

  if (error) return <pre data-print-error>{error}</pre>;
  if (!data) return null;
  const mode = params.get("mode") === "png" ? "png" : "print";
  const lang = params.get("lang");
  return (
    <MenuRenderer
      document={data.document}
      spec={data.spec}
      mode={mode}
      cropMarks={params.get("crop") === "1"}
      watermark={params.get("wm") === "1"}
      logoUrl={data.logoUrl}
      timezone={data.timezone}
      signalReady
      {...(lang ? { lang } : {})}
    />
  );
}
