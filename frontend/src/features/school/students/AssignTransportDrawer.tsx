import { useEffect } from "react";
import { Alert, Col, Row, message } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { fieldErrors } from "@/api/client";
import { DateField, SelectField, SwitchField, TextAreaField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { fmtTime } from "@/lib/format";
import { invalidate, post } from "../api";
import { FormDrawer } from "../components/FormDrawer";
import { RemoteSelectField } from "../components/RemoteSelect";
import { routeLabel, useRouteOptions, useRouteStops } from "../hooks";
import type { Student, TransportAssignment } from "../types";

const schema = z.object({
  student: z.string({ invalid_type_error: "Select a student" }).min(1, "Select a student"),
  route: z.string({ invalid_type_error: "Select a route" }).min(1, "Select a route"),
  pickup_stop: z.string().nullable().optional(),
  dropoff_stop: z.string().nullable().optional(),
  uses_pickup: z.boolean(),
  uses_dropoff: z.boolean(),
  start_date: z.string().nullable().optional(),
  notes: z.string().optional(),
}).superRefine((d, ctx) => {
  if (d.uses_pickup && !d.pickup_stop) ctx.addIssue({ code: "custom", path: ["pickup_stop"], message: "Pickup stop is required when the student uses the morning pickup" });
  if (!d.uses_pickup && !d.uses_dropoff) ctx.addIssue({ code: "custom", path: ["uses_dropoff"], message: "Select at least one direction" });
});
type Input = z.input<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Preselected student (students page); when omitted a searchable student select is shown. */
  student?: Pick<Student, "id" | "full_name" | "transport"> | null;
  /** Prefill from an existing assignment (reassign). */
  current?: TransportAssignment | null;
  presetRoute?: string | null;
}

/** Assign (or reassign) a student to a route with pickup / drop-off stops. */
export function AssignTransportDrawer({ open, onClose, student, current, presetRoute }: Props) {
  const qc = useQueryClient();
  const routes = useRouteOptions();
  const defaults = (): Input => ({
    student: student?.id ?? current?.student ?? "",
    route: current?.route ?? student?.transport?.route_id ?? presetRoute ?? "",
    pickup_stop: current?.pickup_stop ?? student?.transport?.pickup_stop_id ?? null,
    dropoff_stop: current?.dropoff_stop ?? student?.transport?.dropoff_stop_id ?? null,
    uses_pickup: current?.uses_pickup ?? true,
    uses_dropoff: current?.uses_dropoff ?? true,
    start_date: null,
    notes: "",
  });
  const form = useZodForm(schema, { defaultValues: defaults() });
  useEffect(() => {
    if (open) form.reset(defaults());
  }, [open, student?.id, current?.id, presetRoute]);
  const routeId = form.watch("route");
  const stops = useRouteStops(routeId || null);
  const route = routes.data?.find((r) => r.id === routeId);
  const stopOptions = (stops.data ?? []).map((s) => ({ value: s.id, label: `${s.sequence}. ${s.name}${s.is_school_stop ? " (school)" : ""}${s.planned_pickup_time ? ` · ${fmtTime(s.planned_pickup_time)}` : ""}` }));
  const save = useMutation({
    mutationFn: (d: Input) => post<TransportAssignment>("/routing/assignments/", { ...d, dropoff_stop: d.uses_dropoff ? d.dropoff_stop || d.pickup_stop : null }),
    onSuccess: () => {
      invalidate(qc, "students", "student", "assignments", "routes", "route", "route-students", "route-stops", "student-history", "dashboard", "opts-routes");
      message.success("Transport assignment saved");
      onClose();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const existing = student?.transport ?? null;
  return (
    <FormDrawer open={open} title={student ? `Assign transport · ${student.full_name}` : current ? `Reassign ${current.student_name}` : "Assign student to a route"} onClose={onClose} onSubmit={form.handleSubmit((d) => save.mutate(d))} submitting={save.isPending} error={save.isError ? save.error : undefined} submitLabel="Save assignment">
      {existing && existing.is_active && <Alert type="info" showIcon style={{ marginBottom: 16 }} message={`Currently on ${existing.route_code} ${existing.route_name} · ${existing.pickup_stop_name ?? "no stop"}`} description="Saving replaces the current assignment; the old one is kept in history." />}
      {!student && !current && <RemoteSelectField<Input, Student> control={form.control} name="student" label="Student" required path="/people/students/" queryKey="students" params={{ status: "ACTIVE" }} toOption={(s) => ({ value: s.id, label: `${s.full_name} · ${s.class_label} · ${s.admission_number}` })} placeholder="Search by name or admission number" />}
      <SelectField control={form.control} name="route" label="Route" required loading={routes.isLoading} options={(routes.data ?? []).map((r) => ({ value: r.id, label: `${routeLabel(r)}${r.vehicle_registration ? ` · ${r.vehicle_registration}` : ""}` }))} />
      {route?.capacity_warning && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={route.capacity_warning} />}
      {route && route.vehicle_capacity !== null && route.student_count >= route.vehicle_capacity && !route.capacity_warning && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={`This route is at capacity (${route.student_count}/${route.vehicle_capacity}).`} />}
      <Row gutter={16}>
        <Col span={12}><SwitchField control={form.control} name="uses_pickup" label="Morning pickup" /></Col>
        <Col span={12}><SwitchField control={form.control} name="uses_dropoff" label="Afternoon drop-off" /></Col>
      </Row>
      <SelectField control={form.control} name="pickup_stop" label="Pickup stop" required={form.watch("uses_pickup")} options={stopOptions} loading={stops.isLoading} disabled={!routeId} placeholder={routeId ? "Select a stop" : "Select a route first"} />
      <SelectField control={form.control} name="dropoff_stop" label="Drop-off stop" options={stopOptions} loading={stops.isLoading} disabled={!routeId || !form.watch("uses_dropoff")} help="Defaults to the pickup stop" />
      <DateField control={form.control} name="start_date" label="Start date" help="Defaults to today" />
      <TextAreaField control={form.control} name="notes" label="Notes" rows={2} />
    </FormDrawer>
  );
}
