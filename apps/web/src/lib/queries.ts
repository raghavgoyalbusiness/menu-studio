import type {
  AnalyticsDto,
  ConceptDto,
  ExportDto,
  MemberDto,
  OrgDto,
  ProjectDetailDto,
  ProjectDto,
  PublishedMenuDto,
  UsageDto,
  VenueDto,
  VersionSummaryDto,
} from "@menu-studio/shared";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./api.ts";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

export const keys = {
  me: ["me"] as const,
  seeds: ["seeds"] as const,
  projects: (venueId?: string) => ["projects", venueId ?? "all"] as const,
  project: (id: string) => ["project", id] as const,
  versions: (id: string) => ["versions", id] as const,
  concepts: (id: string) => ["concepts", id] as const,
  exports: (id: string) => ["exports", id] as const,
  published: (id: string) => ["published", id] as const,
  usage: (orgId: string) => ["usage", orgId] as const,
  members: (orgId: string) => ["members", orgId] as const,
  analytics: (id: string) => ["analytics", id] as const,
  plans: (country: string) => ["plans", country] as const,
  agency: (orgId: string) => ["agency", orgId] as const,
  admin: ["admin"] as const,
};

export interface MeDto {
  user: { id: string; email: string | null; isAdmin: boolean };
  orgs: OrgDto[];
  venues: VenueDto[];
}

export interface SeedSummary {
  id: string;
  label: string;
  venueName: string;
  venueType: string;
  city: string;
  currency: string;
  archetype: string;
}

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<MeDto>("/me") });
export const useSeeds = () => useQuery({ queryKey: keys.seeds, queryFn: () => api<SeedSummary[]>("/seeds"), staleTime: Infinity });
export const useProjects = (venueId?: string) =>
  useQuery({ queryKey: keys.projects(venueId), queryFn: () => api<ProjectDto[]>(`/projects${venueId ? `?venueId=${venueId}` : ""}`) });
export const useProject = (id: string) => useQuery({ queryKey: keys.project(id), queryFn: () => api<ProjectDetailDto>(`/projects/${id}`) });
export const useVersions = (id: string) => useQuery({ queryKey: keys.versions(id), queryFn: () => api<VersionSummaryDto[]>(`/projects/${id}/versions`) });
export const useConcepts = (id: string) => useQuery({ queryKey: keys.concepts(id), queryFn: () => api<ConceptDto[]>(`/projects/${id}/concepts`) });
export const useUsage = (orgId: string | undefined) =>
  useQuery({ queryKey: keys.usage(orgId ?? ""), queryFn: () => api<UsageDto>(`/orgs/${orgId}/usage`), enabled: Boolean(orgId) });
export const useMembers = (orgId: string | undefined) =>
  useQuery({ queryKey: keys.members(orgId ?? ""), queryFn: () => api<MemberDto[]>(`/orgs/${orgId}/members`), enabled: Boolean(orgId) });
export const usePublished = (projectId: string) =>
  useQuery({ queryKey: keys.published(projectId), queryFn: () => api<PublishedMenuDto[]>(`/projects/${projectId}/published`) });
export const useAnalytics = (publishedId: string | undefined) =>
  useQuery({ queryKey: keys.analytics(publishedId ?? ""), queryFn: () => api<AnalyticsDto>(`/published/${publishedId}/analytics`), enabled: Boolean(publishedId) });

export function useExports(projectId: string) {
  return useQuery({
    queryKey: keys.exports(projectId),
    queryFn: () => api<ExportDto[]>(`/projects/${projectId}/exports`),
    refetchInterval: (query) => (query.state.data?.some((e) => e.status === "queued" || e.status === "rendering") ? 1500 : false),
  });
}

/** The organization currently in focus (persisted per browser). */
const ORG_KEY = "menu-studio.org";
export function preferredOrgId(orgs: OrgDto[]): string | undefined {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(ORG_KEY) : null;
  return orgs.find((o) => o.id === stored)?.id ?? orgs[0]?.id;
}
export function setPreferredOrgId(id: string): void {
  localStorage.setItem(ORG_KEY, id);
}
