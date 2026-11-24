import { api, buildQuery } from "@/api/client";
import type { Notification, Paginated } from "@/types";
import type {
  ApproveResult,
  CreateSchoolPayload,
  CreateSchoolResult,
  Invitation,
  InviteAdminPayload,
  NotificationTemplate,
  OnboardingProgress,
  PlanPayload,
  PlatformOverview,
  PlatformSetting,
  PlatformStats,
  PlatformUser,
  SchoolApplication,
  SchoolDetail,
  SchoolMember,
  SchoolProfilePatch,
  SchoolSummary,
  SubscriptionPayload,
  SubscriptionPlan,
  TemplatePayload,
} from "./types";

/** Query keys. String keys are used by <DataTable queryKey>; invalidate them with [key]. */
export const platformKeys = {
  overview: ["platform", "overview"] as const,
  stats: ["platform", "stats"] as const,
  applications: "platform-applications",
  application: (id: string) => ["platform", "application", id] as const,
  schools: "platform-schools",
  schoolOptions: ["platform", "school-options"] as const,
  school: (id: string) => ["platform", "school", id] as const,
  schoolOnboarding: (id: string) => ["platform", "school", id, "onboarding"] as const,
  schoolInvitations: (id: string) => ["platform", "school", id, "invitations"] as const,
  schoolMembers: (id: string) => ["platform", "school", id, "members"] as const,
  plans: "platform-plans",
  plansPrefix: ["platform", "plans"] as const,
  activePlans: ["platform", "plans", "active"] as const,
  allPlans: ["platform", "plans", "all"] as const,
  settings: ["platform", "settings"] as const,
  templates: ["platform", "templates"] as const,
  auditLogs: "platform-audit-logs",
  users: "platform-users",
  myNotifications: ["notifications", "mine"] as const,
};

function unwrap<T>(p: Promise<{ data: T }>): Promise<T> {
  return p.then((r) => r.data);
}

export const platformApi = {
  overview: () => unwrap(api.get<PlatformOverview>("/platform/overview/")),
  stats: () => unwrap(api.get<PlatformStats>("/platform/stats/")),

  application: (id: string) => unwrap(api.get<SchoolApplication>(`/platform/applications/${id}/`)),
  reviewApplication: (id: string) => unwrap(api.post<SchoolApplication>(`/platform/applications/${id}/review/`)),
  approveApplication: (id: string, data: { plan?: string; notes?: string }) =>
    unwrap(api.post<ApproveResult>(`/platform/applications/${id}/approve/`, data)),
  rejectApplication: (id: string, data: { notes: string }) => unwrap(api.post<SchoolApplication>(`/platform/applications/${id}/reject/`, data)),

  activePlans: () => unwrap(api.get<Paginated<SubscriptionPlan>>("/platform/plans/?is_active=true&page_size=100")).then((d) => d.results),
  allPlans: () => unwrap(api.get<Paginated<SubscriptionPlan>>("/platform/plans/?page_size=100")).then((d) => d.results),
  createPlan: (data: PlanPayload) => unwrap(api.post<SubscriptionPlan>("/platform/plans/", data)),
  updatePlan: (id: string, data: Partial<PlanPayload>) => unwrap(api.patch<SubscriptionPlan>(`/platform/plans/${id}/`, data)),
  deletePlan: (id: string) => api.delete(`/platform/plans/${id}/`),

  school: (id: string) => unwrap(api.get<SchoolDetail>(`/platform/schools/${id}/`)),
  schoolOptions: () => unwrap(api.get<Paginated<SchoolSummary>>("/platform/schools/?page_size=200&ordering=name")).then((d) => d.results),
  createSchool: (data: CreateSchoolPayload) => unwrap(api.post<CreateSchoolResult>("/platform/schools/", data)),
  updateSchool: (id: string, data: SchoolProfilePatch) => unwrap(api.patch<SchoolDetail>(`/platform/schools/${id}/`, data)),
  suspendSchool: (id: string, reason: string) => unwrap(api.post<SchoolDetail>(`/platform/schools/${id}/suspend/`, { reason })),
  reactivateSchool: (id: string) => unwrap(api.post<SchoolDetail>(`/platform/schools/${id}/reactivate/`)),
  updateSubscription: (id: string, data: SubscriptionPayload) => unwrap(api.post<SchoolDetail>(`/platform/schools/${id}/subscription/`, data)),
  schoolOnboarding: (id: string) => unwrap(api.get<OnboardingProgress>(`/platform/schools/${id}/onboarding/`)),
  schoolInvitations: (id: string) => unwrap(api.get<Invitation[]>(`/platform/schools/${id}/invitations/`)),
  schoolMembers: (id: string) => unwrap(api.get<SchoolMember[]>(`/platform/schools/${id}/members/`)),
  inviteAdmin: (id: string, data: InviteAdminPayload) => unwrap(api.post<Invitation>(`/platform/schools/${id}/invite-admin/`, data)),

  settings: () => unwrap(api.get<PlatformSetting[]>("/platform/settings/")),
  updateSetting: (key: string, value: unknown) => unwrap(api.patch<PlatformSetting>(`/platform/settings/${encodeURIComponent(key)}/`, { value })),

  templates: (params: Record<string, unknown> = {}) => unwrap(api.get<NotificationTemplate[]>(`/platform/notification-templates/${buildQuery(params)}`)),
  createTemplate: (data: TemplatePayload) => unwrap(api.post<NotificationTemplate>("/platform/notification-templates/", data)),
  updateTemplate: (id: string, data: Partial<TemplatePayload>) => unwrap(api.patch<NotificationTemplate>(`/platform/notification-templates/${id}/`, data)),
  deleteTemplate: (id: string) => api.delete(`/platform/notification-templates/${id}/`),

  activateUser: (id: string) => unwrap(api.post<PlatformUser>(`/platform/users/${id}/activate/`)),
  deactivateUser: (id: string) => unwrap(api.post<PlatformUser>(`/platform/users/${id}/deactivate/`)),

  myNotifications: (params: Record<string, unknown>) => unwrap(api.get<Paginated<Notification>>(`/notifications/mine/${buildQuery(params)}`)),
  markRead: (id: string) => unwrap(api.post<Notification>(`/notifications/mine/${id}/read/`)),
  markAllRead: () => unwrap(api.post<{ updated: number }>("/notifications/mine/read-all/")),
};
