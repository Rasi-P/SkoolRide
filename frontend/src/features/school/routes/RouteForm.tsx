import { useEffect } from "react";
import { Col, Row, message } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { fieldErrors } from "@/api/client";
import { NumberField, SelectField, SwitchField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { ColourField } from "../components/ExtraFields";
import { FormDrawer } from "../components/FormDrawer";
import { invalidate, patch, post } from "../api";
import { staffLabel, useStaffOptions, useVehicleOptions, vehicleLabel } from "../hooks";
import type { RouteDetail, RouteListItem } from "../types";

const schema = z.object({
  name: z.string().trim().min(2, "Route name is required"),
  code: z.string().trim().min(1, "Route code is required").max(16, "Keep the code short"),
  colour: z.string().optional(),
  description: z.string().optional(),
  vehicle: z.string().nullable().optional(),
  driver: z.string().nullable().optional(),
  attendant: z.string().nullable().optional(),
  estimated_duration_minutes: z.number().int().min(0).nullable().optional(),
  is_active: z.boolean().optional(),
});
type Input = z.input<typeof schema>;

const toDefaults = (r: RouteListItem | null): Input => ({
  name: r?.name ?? "",
  code: r?.code ?? "",
  colour: r?.colour || "#1d4ed8",
  description: r?.description ?? "",
  vehicle: r?.vehicle ?? null,
  driver: r?.driver ?? null,
  attendant: r?.attendant ?? null,
  estimated_duration_minutes: r?.estimated_duration_minutes ?? null,
  is_active: r?.is_active ?? true,
});

export function RouteFormDrawer({ open, route, onClose, onSaved }: { open: boolean; route: RouteListItem | null; onClose: () => void; onSaved?: (r: RouteDetail) => void }) {
  const qc = useQueryClient();
  const vehicles = useVehicleOptions();
  const drivers = useStaffOptions("DRIVER");
  const attendants = useStaffOptions("ATTENDANT");
  const form = useZodForm(schema, { defaultValues: toDefaults(route) });
  useEffect(() => {
    if (open) form.reset(toDefaults(route));
  }, [open, route, form]);
  const save = useMutation({
    mutationFn: (d: Input) => (route ? patch<RouteDetail>(`/routing/routes/${route.id}/`, d) : post<RouteDetail>("/routing/routes/", d)),
    onSuccess: (r) => {
      invalidate(qc, "routes", "route", "opts-routes", "dashboard", "onboarding");
      message.success(route ? "Route updated" : "Route created");
      onSaved?.(r);
      onClose();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const c = form.control;
  return (
    <FormDrawer open={open} title={route ? `Edit ${route.code}` : "New route"} onClose={onClose} onSubmit={form.handleSubmit((d) => save.mutate(d))} submitting={save.isPending} error={save.isError ? save.error : undefined} submitLabel={route ? "Save changes" : "Create route"}>
      <Row gutter={16}>
        <Col span={8}><TextField control={c} name="code" label="Code" required placeholder="R1" /></Col>
        <Col span={16}><TextField control={c} name="name" label="Name" required placeholder="Whitefield Loop" /></Col>
        <Col span={24}><TextAreaField control={c} name="description" label="Description" rows={2} /></Col>
        <Col span={12}><ColourField control={c} name="colour" label="Map colour" /></Col>
        <Col span={12}><NumberField control={c} name="estimated_duration_minutes" label="Estimated duration (min)" min={0} /></Col>
        <Col span={24}><SelectField control={c} name="vehicle" label="Vehicle" loading={vehicles.isLoading} options={(vehicles.data ?? []).filter((v) => v.status !== "INACTIVE").map((v) => ({ value: v.id, label: `${vehicleLabel(v)} · ${v.capacity} seats` }))} /></Col>
        <Col span={12}><SelectField control={c} name="driver" label="Driver" loading={drivers.isLoading} options={(drivers.data ?? []).map((s) => ({ value: s.id, label: staffLabel(s) }))} /></Col>
        <Col span={12}><SelectField control={c} name="attendant" label="Attendant" loading={attendants.isLoading} options={(attendants.data ?? []).map((s) => ({ value: s.id, label: staffLabel(s) }))} /></Col>
        {route && <Col span={24}><SwitchField control={c} name="is_active" label="Active" help="Inactive routes are hidden from assignments and trip generation." /></Col>}
      </Row>
    </FormDrawer>
  );
}
