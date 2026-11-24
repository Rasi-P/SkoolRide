import { useEffect } from "react";
import { Col, Row, message } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { fieldErrors } from "@/api/client";
import { DateField, SelectField, TextAreaField, TimeField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { dayjs } from "@/lib/format";
import type { Trip, TripDetail } from "@/types";
import { invalidate, patch, post } from "../api";
import { FormDrawer } from "../components/FormDrawer";
import { DIRECTION } from "../constants";
import { routeLabel, staffLabel, useRouteOptions, useStaffOptions, useVehicleOptions, vehicleLabel } from "../hooks";

const schema = z.object({
  route: z.string({ invalid_type_error: "Select a route" }).min(1, "Select a route"),
  direction: z.enum(["PICKUP", "DROPOFF"]),
  scheduled_date: z.string({ invalid_type_error: "Date is required" }).min(1, "Date is required"),
  scheduled_start_time: z.string({ invalid_type_error: "Start time is required" }).min(1, "Start time is required"),
  vehicle: z.string().nullable().optional(),
  driver: z.string().nullable().optional(),
  attendant: z.string().nullable().optional(),
  notes: z.string().optional(),
});
type Input = z.input<typeof schema>;

const toDefaults = (t: Trip | null): Input => ({ route: t?.route ?? "", direction: t?.direction ?? "PICKUP", scheduled_date: t?.scheduled_date ?? dayjs().format("YYYY-MM-DD"), scheduled_start_time: t?.scheduled_start_time ?? "", vehicle: t?.vehicle ?? null, driver: t?.driver ?? null, attendant: t?.attendant ?? null, notes: t?.notes ?? "" });

/** Create an ad-hoc trip, or edit a scheduled one. Crew defaults follow the selected route. */
export function TripFormDrawer({ open, trip, onClose, onSaved }: { open: boolean; trip: Trip | null; onClose: () => void; onSaved?: (t: TripDetail) => void }) {
  const qc = useQueryClient();
  const routes = useRouteOptions();
  const vehicles = useVehicleOptions();
  const drivers = useStaffOptions("DRIVER");
  const attendants = useStaffOptions("ATTENDANT");
  const form = useZodForm(schema, { defaultValues: toDefaults(trip) });
  useEffect(() => {
    if (open) form.reset(toDefaults(trip));
  }, [open, trip, form]);
  const routeId = form.watch("route");
  // When creating a trip, selecting a route prefills its default vehicle and crew (still editable).
  useEffect(() => {
    if (trip || !routeId) return;
    const r = routes.data?.find((x) => x.id === routeId);
    if (!r) return;
    form.setValue("vehicle", r.vehicle);
    form.setValue("driver", r.driver);
    form.setValue("attendant", r.attendant);
  }, [routeId, routes.data, trip, form]);
  const save = useMutation({
    mutationFn: (d: Input) => (trip ? patch<TripDetail>(`/trips/trips/${trip.id}/`, d) : post<TripDetail>("/trips/trips/", d)),
    onSuccess: (t) => {
      invalidate(qc, "trips", "trip", "live", "dashboard", "sim-candidates");
      message.success(trip ? "Trip updated" : "Trip created");
      onSaved?.(t);
      onClose();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const c = form.control;
  return (
    <FormDrawer open={open} title={trip ? `Edit trip ${trip.route_code}` : "Create trip"} onClose={onClose} onSubmit={form.handleSubmit((d) => save.mutate(d))} submitting={save.isPending} error={save.isError ? save.error : undefined} submitLabel={trip ? "Save changes" : "Create trip"}>
      <SelectField control={c} name="route" label="Route" required loading={routes.isLoading} options={(routes.data ?? []).map((r) => ({ value: r.id, label: routeLabel(r) }))} allowClear={false} disabled={!!trip} />
      <Row gutter={16}>
        <Col span={24}><SelectField control={c} name="direction" label="Direction" required options={DIRECTION} allowClear={false} /></Col>
        <Col span={12}><DateField control={c} name="scheduled_date" label="Date" required /></Col>
        <Col span={12}><TimeField control={c} name="scheduled_start_time" label="Start time" required /></Col>
        <Col span={24}><SelectField control={c} name="vehicle" label="Vehicle" loading={vehicles.isLoading} options={(vehicles.data ?? []).filter((v) => v.status !== "INACTIVE").map((v) => ({ value: v.id, label: vehicleLabel(v) }))} help={!trip ? "Prefilled from the route; change it for a one-off substitution." : undefined} /></Col>
        <Col span={12}><SelectField control={c} name="driver" label="Driver" loading={drivers.isLoading} options={(drivers.data ?? []).map((s) => ({ value: s.id, label: staffLabel(s) }))} /></Col>
        <Col span={12}><SelectField control={c} name="attendant" label="Attendant" loading={attendants.isLoading} options={(attendants.data ?? []).map((s) => ({ value: s.id, label: staffLabel(s) }))} /></Col>
        <Col span={24}><TextAreaField control={c} name="notes" label="Notes" rows={2} /></Col>
      </Row>
    </FormDrawer>
  );
}
