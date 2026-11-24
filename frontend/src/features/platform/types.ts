// Platform (Super Admin) API types. Mirrors backend/apps/schools/platform_views.py + serializers.
import type { UUID } from "@/types";

export type ApplicationStatus = "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
export type SchoolStatus = "APPROVED" | "ACTIVE" | "SUSPENDED" | "INACTIVE";
export type SubscriptionStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
export type TemplateChannel = "IN_APP" | "PUSH" | "EMAIL" | "SMS";
export type AdminRole = "SCHOOL_ADMIN" | "TRANSPORT_MANAGER";

export interface SchoolApplication {
  id: UUID;
  tracking_code: string;
  school_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  designation: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  website: string;
  estimated_students: number;
  estimated_vehicles: number;
  requested_plan: UUID | null;
  requested_plan_name: string | null;
  message: string;
  status: ApplicationStatus;
  review_notes: string;
  reviewed_by: UUID | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  school: UUID | null;
  school_id: UUID | null;
  created_at: string;
  updated_at: string;
}

export interface PlanLimits {
  max_vehicles: number;
  max_students: number;
  max_staff: number;
  max_routes: number;
}

export interface SubscriptionPlan extends PlanLimits {
  id: UUID;
  code: string;
  name: string;
  description: string;
  price_monthly: string;
  currency: string;
  features: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlanPayload extends PlanLimits {
  code: string;
  name: string;
  description: string;
  price_monthly: string;
  currency: string;
  features: string[];
  is_active: boolean;
  sort_order: number;
}

export interface SchoolSubscription {
  id: UUID;
  plan: UUID;
  plan_name: string;
  plan_code: string;
  status: SubscriptionStatus;
  starts_at: string;
  ends_at: string | null;
  notes: string;
  is_usable: boolean;
  limits: PlanLimits;
}

export interface SubscriptionPayload {
  plan: string;
  status: SubscriptionStatus;
  starts_at: string;
  ends_at: string | null;
  notes: string;
}

export interface SchoolStats {
  vehicles: number;
  students: number;
  staff: number;
  routes: number;
}

export interface OnboardingSummary {
  completed_steps: number;
  total_steps: number;
  completed: boolean;
}

export interface SchoolSummary {
  id: UUID;
  name: string;
  slug: string;
  code: string;
  logo: string | null;
  status: SchoolStatus;
  city: string;
  state: string;
  country: string;
  email: string;
  phone: string;
  timezone: string;
  is_operational: boolean;
  subscription: SchoolSubscription | null;
  stats: SchoolStats;
  admin_email: string | null;
  onboarding: OnboardingSummary;
  approved_at: string | null;
  activated_at: string | null;
  suspended_at: string | null;
  suspension_reason: string;
  created_at: string;
}

export interface SchoolDetail {
  id: UUID;
  created_at: string;
  updated_at: string;
  name: string;
  slug: string;
  code: string;
  logo: string | null;
  status: SchoolStatus;
  email: string;
  phone: string;
  website: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  latitude: string | null;
  longitude: string | null;
  timezone: string;
  currency: string;
  academic_year_label: string;
  academic_year_start: string | null;
  academic_year_end: string | null;
  operating_weekdays: number[];
  morning_pickup_window_start: string | null;
  afternoon_dropoff_window_start: string | null;
  pickup_change_cutoff_hours: number;
  absence_report_cutoff_minutes: number;
  boarding_grace_minutes: number;
  arrival_alert_minutes: number;
  delay_alert_minutes: number;
  gps_stale_seconds: number;
  notification_channels: Record<string, boolean>;
  fee_billing_cycle: string;
  fee_due_day: number;
  fee_late_fee_amount: string;
  accepted_payment_methods: string[];
  transport_office_phone: string;
  transport_office_email: string;
  emergency_contact_phone: string;
  parent_help_text: string;
  show_driver_phone_to_parents: boolean;
  approved_at: string | null;
  activated_at: string | null;
  suspended_at: string | null;
  suspension_reason: string;
  onboarding_dismissed: boolean;
  notes: string;
  subscription: SchoolSubscription | null;
  is_operational: boolean;
  full_address: string;
}

export type SchoolProfilePatch = Partial<
  Pick<SchoolDetail, "name" | "email" | "phone" | "website" | "address_line1" | "address_line2" | "city" | "state" | "country" | "postal_code" | "timezone" | "notes">
>;

export interface CreateSchoolPayload {
  name: string;
  email?: string;
  phone?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  timezone?: string;
  plan?: string;
  admin_email: string;
  admin_first_name: string;
  admin_last_name?: string;
}

export interface Invitation {
  id: UUID;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  invited_by_name: string;
  /** Only present in demo mode. */
  accept_url: string | null;
  created_at: string;
}

export interface InviteAdminPayload {
  email: string;
  first_name: string;
  last_name?: string;
  role: AdminRole;
}

export interface SchoolMember {
  id: UUID;
  user: UUID;
  email: string;
  full_name: string;
  phone: string;
  role: string;
  is_active: boolean;
  is_primary: boolean;
  user_is_active: boolean;
  last_login: string | null;
  created_at: string;
}

export interface OnboardingStep {
  key: string;
  label: string;
  done: boolean;
  href: string;
}

export interface OnboardingProgress extends OnboardingSummary {
  steps: OnboardingStep[];
}

export interface PlatformSetting {
  key: string;
  value: unknown;
  description: string;
  updated_at: string;
}

export interface NotificationTemplate {
  id: UUID;
  school: UUID | null;
  category: string;
  channel: TemplateChannel;
  subject: string;
  body: string;
  is_active: boolean;
  updated_at: string;
}

export interface TemplatePayload {
  category: string;
  channel: TemplateChannel;
  subject: string;
  body: string;
  is_active: boolean;
}

export interface AuditLog {
  id: number;
  action: string;
  actor_email: string;
  target_type: string;
  target_id: string;
  target_repr: string;
  changes: Record<string, unknown>;
  ip_address: string | null;
  /** NOTE: the backend currently serialises the school's name here (not its UUID). */
  school: string | null;
  school_name: string;
  created_at: string;
}

export interface PlatformUserMembership {
  school: string;
  school_id: UUID;
  role: string;
  is_active: boolean;
}

export interface PlatformUser {
  id: UUID;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  is_active: boolean;
  is_platform_admin: boolean;
  last_login: string | null;
  memberships: PlatformUserMembership[];
  created_at: string;
}

export interface GrowthPoint {
  month: string; // "YYYY-MM"
  count: number;
}

export interface StatusCount {
  status: SchoolStatus;
  count: number;
}

export interface PlatformOverview {
  total_schools: number;
  active_schools: number;
  suspended_schools: number;
  pending_applications: number;
  total_vehicles: number;
  total_students: number;
  active_trips: number;
  trips_today: number;
  recent_applications: SchoolApplication[];
  recent_activity: AuditLog[];
  school_growth: GrowthPoint[];
  schools_by_status: StatusCount[];
}

export interface PlatformStats {
  gps_points_today: number;
  trips_completed_today: number;
  notifications_today: number;
  deliveries_failed_today: number;
  users_total: number;
  users_active_last_7_days: number;
}

export interface ApproveResult {
  application: SchoolApplication;
  school: SchoolDetail;
  invitation: Invitation;
}

export interface CreateSchoolResult {
  school: SchoolDetail;
  invitation: Invitation;
}
