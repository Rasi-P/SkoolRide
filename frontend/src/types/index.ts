// Shared API types (mirrors backend serializers). Keep in sync with /api/schema/.
export type UUID = string;

export type Role = "SCHOOL_ADMIN" | "TRANSPORT_MANAGER" | "ATTENDANT" | "DRIVER" | "PARENT";

export interface Membership {
  id: UUID;
  role: Role;
  is_primary: boolean;
  school_id: UUID;
  school_name: string;
  school_slug: string;
  school_status: "APPROVED" | "ACTIVE" | "SUSPENDED" | "INACTIVE";
  school_is_operational: boolean;
  school_timezone: string;
  school_logo: string | null;
  onboarding_completed: boolean;
  permissions: string[];
}

export interface User {
  id: UUID;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  avatar: string | null;
  is_platform_admin: boolean;
  must_change_password: boolean;
  memberships: Membership[];
  created_at: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ApiError {
  detail: string;
  code: string;
  errors?: Record<string, string[] | string>;
}

export interface PublicConfig {
  demo_mode: boolean;
  vapid_public_key: string | null;
  driver_location_interval_seconds: number;
  payment_gateway: string;
}

export type TripStatus = "SCHEDULED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type Direction = "PICKUP" | "DROPOFF";

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface VehicleLocation extends LatLng {
  speed_mps: number | null;
  heading: number | null;
  accuracy_m: number | null;
  recorded_at: string;
  is_simulated: boolean;
  is_stale?: boolean;
  vehicle_id?: UUID;
  registration_number?: string;
  fleet_number?: string;
  trip_id?: UUID | null;
}

export interface TripStop {
  id: UUID;
  route_stop: UUID;
  sequence: number;
  name: string;
  latitude: string | number;
  longitude: string | number;
  address: string;
  is_school_stop: boolean;
  planned_time: string | null;
  eta: string | null;
  distance_remaining_m: number | null;
  arrived_at: string | null;
  departed_at: string | null;
  status: "PENDING" | "ARRIVED" | "DEPARTED" | "SKIPPED";
  expected_count?: number;
  boarded_count?: number;
}

export type TripStudentStatus = "EXPECTED" | "BOARDED" | "DROPPED" | "ABSENT" | "NO_SHOW";

export interface TripStudent {
  id: UUID;
  student: UUID;
  student_name: string;
  admission_number: string;
  class_label: string;
  photo: string | null;
  trip_stop: UUID | null;
  stop_name: string | null;
  stop_sequence: number | null;
  status: TripStudentStatus;
  boarded_at: string | null;
  dropped_at: string | null;
  absence_reason: string;
  guardian_phone: string | null;
}

export interface TripEvent {
  id: UUID;
  event_type: string;
  description: string;
  data: Record<string, unknown>;
  occurred_at: string;
  created_by_name: string | null;
}

export interface NextStop {
  id: UUID;
  name: string;
  sequence?: number;
  eta: string | null;
  planned_time?: string | null;
  distance_remaining_m?: number | null;
}

export interface Trip {
  id: UUID;
  route: UUID;
  route_name: string;
  route_code: string;
  route_colour: string;
  schedule: UUID | null;
  direction: Direction;
  scheduled_date: string;
  scheduled_start_time: string;
  vehicle: UUID | null;
  vehicle_registration: string | null;
  vehicle_display_name: string | null;
  driver: UUID | null;
  driver_name: string | null;
  driver_phone: string | null;
  attendant: UUID | null;
  attendant_name: string | null;
  status: TripStatus;
  started_at: string | null;
  paused_at: string | null;
  ended_at: string | null;
  cancelled_reason: string;
  replacement_of_id: UUID | null;
  expected_students: number;
  boarded_count: number;
  dropped_count: number;
  absent_count: number;
  delay_minutes: number;
  last_location_at: string | null;
  is_simulated: boolean;
  is_active: boolean;
  gps_stale: boolean | null;
  current_location: VehicleLocation | null;
  next_stop: NextStop | null;
  notes: string;
  created_at: string;
}

export interface TripDetail extends Trip {
  stops: TripStop[];
  students: TripStudent[];
  events: TripEvent[];
  route_path: [number, number][];
}

export interface Notification {
  id: UUID;
  category: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  trip: UUID | null;
  student: UUID | null;
  student_name: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  deliveries?: { channel: string; status: string; attempts: number; last_error: string; sent_at: string | null }[];
  recipient_email?: string;
  recipient_name?: string;
}

/** Live websocket message envelope */
export interface WsMessage {
  event: "snapshot" | "location" | "status" | "stop" | "student" | "event" | "stale" | "emergency" | "notification" | "connected" | "pong";
  trip_id?: string;
  payload?: Record<string, unknown> & {
    location?: VehicleLocation;
    etas?: { trip_stop_id: string; sequence: number; distance_m: number | null; seconds: number | null; eta_at: string | null; passed: boolean }[];
    delay_minutes?: number;
    stale?: boolean;
    status?: string;
  };
}
