import { useEffect } from "react";
import { Alert, App, Button } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { SelectField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { fmtTime } from "@/lib/format";
import type { Trip } from "@/types";
import { driverApi, driverKeys } from "../api";
import { useGps } from "../gps/GpsContext";
import type { DriverIncident, IncidentCategory, IncidentSeverity } from "../types";

export const INCIDENT_CATEGORIES: { value: IncidentCategory; label: string }[] = [
  { value: "BREAKDOWN", label: "Breakdown" },
  { value: "ACCIDENT", label: "Accident" },
  { value: "MEDICAL", label: "Medical" },
  { value: "BEHAVIOUR", label: "Student behaviour" },
  { value: "DELAY", label: "Delay" },
  { value: "EMERGENCY", label: "Emergency" },
  { value: "SAFETY", label: "Safety concern" },
  { value: "OTHER", label: "Other" },
];
export const INCIDENT_SEVERITIES: { value: IncidentSeverity; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

const schema = z.object({
  category: z.enum(["BREAKDOWN", "ACCIDENT", "MEDICAL", "BEHAVIOUR", "DELAY", "EMERGENCY", "SAFETY", "OTHER"], { message: "Choose a category" }),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"], { message: "Choose a severity" }),
  title: z.string().trim().min(3, "Give the incident a short title").max(160, "At most 160 characters"),
  description: z.string().trim().min(10, "Describe what happened (at least 10 characters)"),
  trip: z.string().nullable().optional(),
});
type FormValues = z.input<typeof schema>;

interface Props {
  trips: Trip[];
  vehicleId?: string | null;
  initialTrip?: string | null;
  onDone: (incident: DriverIncident) => void;
  onCancel?: () => void;
}

/** Incident report form; attaches the current GPS fix when one is available. */
export function IncidentForm({ trips, vehicleId, initialTrip, onDone, onCancel }: Props) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const gps = useGps();
  const form = useZodForm(schema, { defaultValues: { category: undefined, severity: "MEDIUM", title: "", description: "", trip: initialTrip ?? null } });
  useEffect(() => {
    if (initialTrip) form.setValue("trip", initialTrip);
  }, [initialTrip, form]);

  const m = useMutation({
    mutationFn: (d: FormValues) => {
      const trip = d.trip ? trips.find((t) => t.id === d.trip) : null;
      const fix = gps.lastSample;
      return driverApi.reportIncident({
        category: d.category,
        severity: d.severity,
        title: d.title.trim(),
        description: d.description.trim(),
        trip: d.trip || null,
        vehicle: trip?.vehicle ?? vehicleId ?? null,
        latitude: fix?.latitude ?? null,
        longitude: fix?.longitude ?? null,
      });
    },
    onSuccess: (incident) => {
      qc.invalidateQueries({ queryKey: driverKeys.incidents });
      if (incident.trip) qc.invalidateQueries({ queryKey: driverKeys.trip(incident.trip) });
      message.success("Incident reported. The transport office has been notified.");
      form.reset();
      onDone(incident);
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });

  return (
    <form onSubmit={form.handleSubmit((d) => m.mutate(d))} noValidate aria-label="Report incident">
      {m.isError && <Alert type="error" showIcon message={errorMessage(m.error)} style={{ marginBottom: 12 }} />}
      <SelectField control={form.control} name="category" label="Category" required options={INCIDENT_CATEGORIES} allowClear={false} placeholder="What kind of incident?" />
      <SelectField control={form.control} name="severity" label="Severity" required options={INCIDENT_SEVERITIES} allowClear={false} />
      <TextField control={form.control} name="title" label="Title" required placeholder="e.g. Flat tyre near Varthur Kodi" />
      <TextAreaField control={form.control} name="description" label="What happened?" required rows={4} placeholder="Describe the situation, who is affected and what help you need." />
      <SelectField
        control={form.control}
        name="trip"
        label="Related trip (optional)"
        placeholder="Not related to a trip"
        options={trips.map((t) => ({ value: t.id, label: `${t.route_code} ${t.direction === "PICKUP" ? "pickup" : "drop-off"} · ${fmtTime(t.scheduled_start_time)}` }))}
        help={gps.lastSample ? "Your current GPS position will be attached." : "No GPS fix available; the report is sent without a location."}
      />
      <div className="sbp-stack">
        <Button type="primary" htmlType="submit" block className="sbp-touch-btn" loading={m.isPending}>
          Send report
        </Button>
        {onCancel && (
          <Button block className="sbp-touch-btn" onClick={onCancel} disabled={m.isPending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
