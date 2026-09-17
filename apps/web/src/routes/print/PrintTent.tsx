import { MenuRenderer } from "@menu-studio/renderer";
import type { LayoutSpec, MenuDocument } from "@menu-studio/shared";
import { useEffect, useState } from "react";

/** Browser-printable table tent: the renderer at exact paper size, then the print dialog. */
export function PrintTent() {
  const [data] = useState<{ document: MenuDocument; spec: LayoutSpec; qr: string } | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("menu-studio.tent") ?? "null") as { document: MenuDocument; spec: LayoutSpec; qr: string } | null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (!data) return;
    document.body.style.background = "#fff";
    const onReady = () => setTimeout(() => window.print(), 300);
    window.addEventListener("menu:ready", onReady, { once: true });
    return () => window.removeEventListener("menu:ready", onReady);
  }, [data]);
  if (!data) return <p style={{ padding: 24 }}>Open the table tent from the QR menu page.</p>;
  return <MenuRenderer document={data.document} spec={data.spec} mode="print" signalReady qrCode={{ src: data.qr, caption: "Scan for the full menu" }} />;
}
