/**
 * Shapes exchanged between apps/web, apps/api and apps/worker. Documents inside them are
 * validated with the Zod schemas; these interfaces describe the envelopes.
 */
import type { PlanId } from "./billing/plans.ts";
import type { DesignBrief, StyleDescriptors } from "./schemas/design-brief.ts";
import type { Edit, VersionSource } from "./schemas/edit.ts";
import type { LayoutSpec } from "./schemas/layout-spec.ts";
import type { MenuDocument, VenueType } from "./schemas/menu-document.ts";
import type { OverflowReport } from "./schemas/overflow.ts";

export type MemberRole = "owner" | "editor" | "viewer";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retryable?: boolean;
    issues?: string[];
    upgradeTo?: PlanId;
  };
}

export interface SessionUser {
  id: string;
  email: string | null;
  isAdmin: boolean;
}

export interface WhiteLabel {
  brandName?: string;
  logoUrl?: string;
  qrSubdomain?: string;
}

export interface OrgDto {
  id: string;
  name: string;
  type: "venue" | "agency";
  plan: PlanId;
  country: string;
  role: MemberRole;
  whiteLabel: WhiteLabel;
  createdAt: string;
}

export interface MemberDto {
  userId: string;
  email: string | null;
  role: MemberRole;
  createdAt: string;
}

export interface VenueDto {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  venueType: VenueType;
  city: string | null;
  country: string;
  currency: string;
  locale: string;
  timezone: string;
  logoUrl: string | null;
  createdAt: string;
}

export interface ProjectDto {
  id: string;
  venueId: string;
  name: string;
  status: "draft" | "published" | "archived";
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VersionSummaryDto {
  id: string;
  projectId: string;
  parentVersionId: string | null;
  seq: number;
  source: VersionSource;
  instruction: string | null;
  summary: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface VersionDto extends VersionSummaryDto {
  document: MenuDocument;
  brief: DesignBrief | null;
  spec: LayoutSpec | null;
  edits: Edit[] | null;
}

export interface ProjectDetailDto {
  project: ProjectDto;
  venue: VenueDto;
  org: OrgDto;
  head: VersionDto | null;
}

export interface ConceptDto {
  id: string;
  projectId: string;
  batchId: string;
  spec: LayoutSpec;
  selected: boolean;
  promptVersion: string | null;
  fitReport: OverflowReport | null;
  createdAt: string;
}

export interface UploadDto {
  id: string;
  kind: "menu_source" | "logo" | "reference";
  mime: string;
  sizeBytes: number;
  pageCount: number | null;
  url: string;
  createdAt: string;
}

export type ExportKind = "pdf" | "pdf_crop_marks" | "png" | "print_pack";
export type ExportStatus = "queued" | "rendering" | "done" | "failed";

export interface ExportFileDto {
  name: string;
  path: string;
  bytes: number;
  contentType: string;
  url?: string;
}

export interface ExportDto {
  id: string;
  projectId: string;
  versionId: string;
  kind: ExportKind;
  status: ExportStatus;
  files: ExportFileDto[];
  watermarked: boolean;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PublishedMenuDto {
  id: string;
  venueId: string;
  projectId: string;
  versionId: string;
  slug: string;
  isLive: boolean;
  languages: string[];
  themeMode: "match_print" | "mobile_optimized";
  publishedAt: string;
  url: string;
}

export type ExtractionWarningCode = "missing_price" | "duplicate_name" | "empty_section" | "currency_unknown" | "unreadable";

export interface ExtractionWarning {
  code: ExtractionWarningCode;
  message: string;
  sectionId?: string;
  itemId?: string;
}

export interface ExtractResponse {
  version: VersionDto;
  warnings: ExtractionWarning[];
}

export interface ConceptsResponse {
  batchId: string;
  concepts: ConceptDto[];
}

export type EditResponse =
  | { kind: "applied"; version: VersionDto; summary: string; contentChanged: { prices: boolean; names: boolean; descriptions: boolean } }
  | { kind: "clarify"; question: string }
  | { kind: "unsupported"; message: string };

export interface TranslateResponse {
  version: VersionDto;
  fontWarning: { message: string; suggestedPairingIds: string[] } | null;
}

export interface EngineeringSuggestionDto {
  id: string;
  itemId: string;
  itemName: string;
  quadrant: "star" | "plowhorse" | "puzzle" | "dog";
  message: string;
  edits: Edit[];
}

export interface EngineeringResponse {
  analysis: {
    method: "sales_mix" | "owner_popularity";
    averageMargin: number;
    results: { itemId: string; name: string; contributionMargin: number; marginTier: "high" | "mid" | "low"; popularity: "high" | "low"; quadrant: "star" | "plowhorse" | "puzzle" | "dog" }[];
    skipped: { itemId: string; name: string; reason: string }[];
  };
  suggestions: EngineeringSuggestionDto[];
}

export interface DescribeReferenceResponse {
  descriptors: StyleDescriptors;
}

export interface UsageDto {
  plan: PlanId;
  venues: number;
  aiEditsThisMonth: number;
  aiEditCredits: number;
  exportCredits: number;
  billingProvider: "stripe" | "razorpay";
  billingCurrency: "GBP" | "USD" | "INR";
  subscription: { status: string; currentPeriodEnd: string | null } | null;
}

export interface AnalyticsDto {
  days: { date: string; views: number }[];
  languages: { lang: string; views: number }[];
  devices: { device: string; views: number }[];
  topItems: { itemId: string; name: string; opens: number }[];
}

export interface AdminOverviewDto {
  orgs: { id: string; name: string; plan: string; aiCostUsdMicros: number; aiCalls: number; exportsFailed: number }[];
  failedExports: { id: string; projectId: string; error: string | null; createdAt: string }[];
  flags: { id: string; orgId: string; kind: string; message: string; createdAt: string }[];
  totals: { aiCostUsdMicros: number; aiCalls: number; exports: number; exportsFailed: number };
}
