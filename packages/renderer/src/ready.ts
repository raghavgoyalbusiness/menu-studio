import type { OverflowReport } from "@menu-studio/shared";

export interface RenderState {
  status: "pending" | "ready";
  fontsLoaded: boolean;
  report: OverflowReport | null;
}

declare global {
  interface Window {
    __MENU_RENDER__?: RenderState;
  }
}

export const READY_EVENT = "menu:ready";

/** Signal to the export worker that fonts are loaded and the overflow pass is done. */
export function publishRenderState(state: RenderState): void {
  if (typeof window === "undefined") return;
  window.__MENU_RENDER__ = state;
  if (state.status === "ready") window.dispatchEvent(new CustomEvent(READY_EVENT, { detail: state }));
}
