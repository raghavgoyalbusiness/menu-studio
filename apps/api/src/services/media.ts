import { badRequest } from "@menu-studio/server-core";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 10;
export const MAX_IMAGE_EDGE = 2400;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface NormalizedUpload {
  body: Uint8Array;
  mime: string;
  extension: string;
  pageCount: number | null;
}

/**
 * Validate and normalize an upload before it is stored or sent to Claude:
 * images are auto-rotated, downscaled, re-encoded as JPEG and stripped of EXIF
 * (sharp drops metadata unless asked to keep it); PDFs are page-counted.
 */
export async function normalizeUpload(input: Uint8Array, declaredMime: string, kind: "menu_source" | "logo" | "reference"): Promise<NormalizedUpload> {
  if (input.byteLength === 0) throw badRequest("The file is empty.");
  if (input.byteLength > MAX_UPLOAD_BYTES) throw badRequest("Files can be up to 20 MB.");
  const mime = sniffMime(input) ?? declaredMime;

  if (mime === "application/pdf") {
    if (kind === "logo") throw badRequest("Logos must be an image.");
    let pages: number;
    try {
      const pdf = await PDFDocument.load(input, { ignoreEncryption: false, updateMetadata: false });
      pages = pdf.getPageCount();
    } catch {
      throw badRequest("That PDF could not be read. If it is password-protected, remove the password and try again.");
    }
    if (pages > MAX_PDF_PAGES) throw badRequest(`PDFs can have up to ${MAX_PDF_PAGES} pages (this one has ${pages}).`);
    return { body: input, mime, extension: "pdf", pageCount: pages };
  }

  if (mime === "image/heic" || mime === "image/heif") {
    throw badRequest("HEIC photos are not supported yet. On iPhone, choose 'Most Compatible' in Settings › Camera › Formats, or export as JPEG.");
  }
  if (!IMAGE_TYPES.has(mime)) throw badRequest("Upload a JPEG, PNG, WebP or PDF.");

  try {
    if (kind === "logo") {
      const body = await sharp(input).rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      return { body: new Uint8Array(body), mime: "image/png", extension: "png", pageCount: null };
    }
    const body = await sharp(input)
      .rotate()
      .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    return { body: new Uint8Array(body), mime: "image/jpeg", extension: "jpg", pageCount: 1 };
  } catch {
    throw badRequest("That image could not be read.");
  }
}

export function sniffMime(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  const brand = String.fromCharCode(...b.slice(4, 12));
  if (brand.startsWith("ftypheic") || brand.startsWith("ftypheix") || brand.startsWith("ftypmif1") || brand.startsWith("ftyphevc")) return "image/heic";
  return null;
}
