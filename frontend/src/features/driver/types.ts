/** Driver / attendant API types (mirrors backend/apps/trips/driver_views.py + serializers). */
import type { Trip, TripDetail, TripStatus, UUID } from "@/types";

export type StaffType = "DRIVER" | "ATTENDANT" | "TRANSPORT_MANAGER" | "SCHOOL_ADMIN";

export interface DriverStaff {
  id: UUID;
  name: string;
  type: StaffType;
  employee_id: string;
  licence_expired: boolean;
}

export interface DriverSchool {
  id: UUID;
  name: string;
  timezone: string;
  transport_office_phone: string;
  emergency_contact_phone: string;
  transport_office_email: string;
}

export interface VehicleDocumentAlert {
  document: string;
  expires_on: string;
  level: "expired" | "expiring";
}

export interface VehicleStaffRef {
  assignment_id: UUID;
  id: UUID;
  name: string;
  phone: string;
  licence_expired?: boolean;
}

export type VehicleStatus = "AVAILABLE" | "IN_SERVICE" | "MAINTENANCE" | "INACTIVE" | string;

/** VehicleListSerializer (fleet) as returned by /driver/home/. */
export interface DriverVehicle {
  id: UUID;
  registration_number: string;
  fleet_number: string;
  display_name: string;
  vehicle_type: string;
  make: string;
  model: string;
  year: number | null;
  colour: string;
  capacity: number;
  status: VehicleStatus;
  insurance_expiry: string | null;
  permit_expiry: string | null;
  fitness_expiry: string | null;
  pollution_expiry: string | null;
  next_service_due: string | null;
  document_alerts: VehicleDocumentAlert[];
  has_expired_documents: boolean;
  driver: VehicleStaffRef | null;
  attendant: VehicleStaffRef | null;
  routes: { id: UUID; name: string; code: string }[];
}

export interface DriverHome {
  staff: DriverStaff;
  school: DriverSchool;
  vehicle: DriverVehicle | null;
  routes: { id: UUID; code: string; name: string }[];
  today: string;
  trips: Trip[];
  active_trip: TripDetail | null;
  location_interval_seconds: number;
}

export type TripLifecycleAction = "start" | "pause" | "resume" | "end" | "cancel";
export type StopAction = "arrive" | "depart";
export type StudentAction = "board" | "drop" | "absent";

export type DriverEventType = "DELAY" | "BREAKDOWN" | "NOTE";

export interface TripEventInput {
  event_type: DriverEventType;
  description: string;
  minutes?: number;
}

export interface MarkStudentInput {
  note?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface EmergencyInput {
  confirm: true;
  title?: string;
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export type IncidentCategory = "BREAKDOWN" | "ACCIDENT" | "MEDICAL" | "BEHAVIOUR" | "DELAY" | "EMERGENCY" | "SAFETY" | "OTHER";
export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED";

export interface DriverIncident {
  id: UUID;
  trip: UUID | null;
  route_code: string | null;
  vehicle: UUID | null;
  vehicle_registration: string | null;
  reported_by_name: string | null;
  category: IncidentCategory;
  severity: IncidentSeverity;
  title: string;
  description: string;
  occurred_at: string;
  latitude: number | null;
  longitude: number | null;
  status: IncidentStatus;
  is_emergency: boolean;
  resolution_notes: string;
  resolved_at: string | null;
  resolved_by_name: string | null;
  students: UUID[];
  student_names: string[];
  created_at: string;
}

export interface IncidentInput {
  trip?: UUID | null;
  vehicle?: UUID | null;
  category: IncidentCategory;
  severity: IncidentSeverity;
  title: string;
  description: string;
  occurred_at?: string;
  latitude?: number | null;
  longitude?: number | null;
  students?: UUID[];
}

export interface BoardingEvent {
  id: UUID;
  trip: UUID;
  trip_direction: "PICKUP" | "DROPOFF";
  trip_date: string;
  route_code: string;
  vehicle_registration: string | null;
  student: UUID;
  student_name: string;
  admission_number: string;
  class_label: string;
  trip_stop: UUID | null;
  stop_name: string | null;
  event_type: "BOARDED" | "DROPPED" | "ABSENT" | "NO_SHOW";
  occurred_at: string;
  recorded_by_name: string | null;
  latitude: number | null;
  longitude: number | null;
  note: string;
}

export interface LocationAck {
  accepted: boolean;
  recorded_at: string;
  trip_status: TripStatus;
  is_simulated: boolean;
}

/** Development GPS simulator (DEMO_MODE only). */
export interface SimulationState {
  is_running: boolean;
  progress_m: number;
  speed_mps: number;
  auto_board: boolean;
  auto_complete: boolean;
  last_tick_at: string | null;
}

export interface SimulationResponse {
  simulated: boolean;
  label: string;
  simulation: SimulationState | null;
  trip: TripDetail;
  celery_beat_required: boolean;
}

export interface SimulationStartInput {
  action: "start";
  speed_mps?: number;
  auto_board?: boolean;
  auto_complete?: boolean;
}

export type SimulationInput = SimulationStartInput | { action: "stop" } | { action: "tick" };
