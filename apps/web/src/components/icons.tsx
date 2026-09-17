import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function make(paths: string) {
  return function Icon({ size = 16, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...props}
      >
        <path d={paths} />
      </svg>
    );
  };
}

export const IconUndo = make("M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11");
export const IconRedo = make("m15 14 5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13");
export const IconPlus = make("M12 5v14 M5 12h14");
export const IconMinus = make("M5 12h14");
export const IconCheck = make("M20 6 9 17l-5-5");
export const IconX = make("M18 6 6 18 M6 6l12 12");
export const IconArrowLeft = make("M19 12H5 M12 19l-7-7 7-7");
export const IconArrowRight = make("M5 12h14 M12 5l7 7-7 7");
export const IconChevronDown = make("m6 9 6 6 6-6");
export const IconChevronRight = make("m9 18 6-6-6-6");
export const IconUpload = make("M12 16V4 M7 9l5-5 5 5 M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3");
export const IconDownload = make("M12 4v12 M7 11l5 5 5-5 M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3");
export const IconCamera = make("M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z");
export const IconFile = make("M14 3H6v18h12V7z M14 3v4h4 M9 13h6 M9 17h6");
export const IconText = make("M4 6h16 M4 12h16 M4 18h10");
export const IconSparkle = make("M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6.3 6.3l2.2 2.2 M15.5 15.5l2.2 2.2 M6.3 17.7l2.2-2.2 M15.5 8.5l2.2-2.2");
export const IconLayers = make("m12 3 9 5-9 5-9-5z M3 13l9 5 9-5 M3 17.5l9 5 9-5");
export const IconChat = make("M4 5h16v11H9l-5 4z");
export const IconSliders = make("M4 6h10 M18 6h2 M16 4v4 M4 12h4 M12 12h8 M10 10v4 M4 18h12 M20 18h0 M18 16v4");
export const IconList = make("M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01");
export const IconHistory = make("M3 12a9 9 0 1 0 3-6.7 M3 4v5h5 M12 7v5l3 2");
export const IconQr = make("M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 14h2 M14 18h2 M18 18h2v2 M16 20h0");
export const IconGlobe = make("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18");
export const IconTrash = make("M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3");
export const IconLock = make("M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3");
export const IconUnlock = make("M6 11h12v9H6z M8 11V8a4 4 0 0 1 7.5-2");
export const IconAlert = make("M12 9v4 M12 17h.01 M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z");
export const IconEye = make("M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z");
export const IconGrip = make("M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01");
export const IconZoomIn = make("M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4 M11 8v6 M8 11h6");
export const IconZoomOut = make("M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4 M8 11h6");
export const IconExternal = make("M14 4h6v6 M20 4 10 14 M18 13v6H5V6h6");
export const IconCopy = make("M9 9h11v11H9z M5 15H4V4h11v1");
export const IconChart = make("M4 20V10 M10 20V4 M16 20v-8 M22 20H2");
export const IconUser = make("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0");
export const IconSettings = make("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 3.9V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z");
export const IconGrid = make("M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z");
export const IconTag = make("M3 12V4h8l10 10-8 8z M7.5 7.5h.01");
export const IconRefresh = make("M20 12a8 8 0 1 1-2.3-5.7 M20 4v5h-5");
