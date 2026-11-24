/** Typed wrappers for /api/driver/... and the demo simulator. Query keys are centralised here. */
import { api, buildQuery } from "@/api/client";
import type { Trip, TripDetail, TripEvent, TripStatus, TripStudent } from "@/types";
import type {
  BoardingEvent,
  DriverHome,
  DriverIncident,
  EmergencyInput,
  IncidentInput,
  MarkStudentInput,
  SimulationInput,
  SimulationResponse,
  StopAction,
  StudentAction,
  TripEventInput,
  TripLifecycleAction,
} from "./types";

export const driverKeys = {
  home: ["driver", "home"] as const,
  trips: (params: Record<string, unknown>) => ["driver", "trips", params] as const,
  trip: (id: string) => ["driver", "trip", id] as const,
  boardingEvents: (id: string) => ["driver", "boarding-events", id] as const,
  incidents: ["driver", "incidents"] as const,
  simulation: (id: string) => ["driver", "simulation", id] as const,
};

export const driverApi = {
  home: () => api.get<DriverHome>("/driver/home/").then((r) => r.data),
  trips: (params: { status?: TripStatus; days?: number } = {}) => api.get<Trip[]>(`/driver/trips/${buildQuery(params)}`).then((r) => r.data),
  trip: (id: string) => api.get<TripDetail>(`/driver/trips/${id}/`).then((r) => r.data),
  tripAction: (id: string, action: TripLifecycleAction, body: Record<string, unknown> = {}) =>
    api.post<TripDetail>(`/driver/trips/${id}/${action}/`, body).then((r) => r.data),
  stopAction: (id: string, stopId: string, action: StopAction) =>
    api.post<TripDetail>(`/driver/trips/${id}/stops/${stopId}/${action}/`).then((r) => r.data),
  studentAction: (id: string, studentId: string, action: StudentAction, body: MarkStudentInput = {}) =>
    api.post<TripStudent>(`/driver/trips/${id}/students/${studentId}/${action}/`, body).then((r) => r.data),
  addEvent: (id: string, body: TripEventInput) => api.post<TripEvent>(`/driver/trips/${id}/events/`, body).then((r) => r.data),
  emergency: (id: string, body: EmergencyInput) => api.post<DriverIncident>(`/driver/trips/${id}/emergency/`, body).then((r) => r.data),
  boardingEvents: (id: string) => api.get<BoardingEvent[]>(`/driver/trips/${id}/boarding-events/`).then((r) => r.data),
  incidents: () => api.get<DriverIncident[]>("/driver/incidents/").then((r) => r.data),
  reportIncident: (body: IncidentInput) => api.post<DriverIncident>("/driver/incidents/", body).then((r) => r.data),
  simulation: (tripId: string) => api.get<SimulationResponse>(`/demo/simulations/${tripId}/`).then((r) => r.data),
  simulate: (tripId: string, body: SimulationInput) => api.post<SimulationResponse>(`/demo/simulations/${tripId}/`, body).then((r) => r.data),
};
