import { useEffect } from "react";
import { Col, Divider, Row, message } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { fieldErrors } from "@/api/client";
import { DateField, NumberField, SelectField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { FormDrawer } from "../components/FormDrawer";
import { VEHICLE_TYPE } from "../constants";
import { invalidate, patch, post } from "../api";
import type { Vehicle } from "../types";

const optionalDate = z.string().nullable().optional();

export const vehicleSchema = z.object({
  registration_number: z.string().trim().min(4, "Registration number is required"),
  fleet_number: z.string().optional(),
  vehicle_type: z.enum(["BUS", "MINI_BUS", "VAN", "OTHER"]),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number({ invalid_type_error: "Enter a year" }).int().min(1980, "Enter a valid year").max(2100, "Enter a valid year").nullable().optional(),
  colour: z.string().optional(),
  capacity: z.number({ invalid_type_error: "Capacity is required" }).int().min(1, "Capacity must be at least 1").max(200, "Capacity looks too large"),
  gps_device_id: z.string().optional(),
  insurance_number: z.string().optional(),
  insurance_expiry: optionalDate,
  permit_number: z.string().optional(),
  permit_expiry: optionalDate,
  fitness_certificate_number: z.string().optional(),
  fitness_expiry: optionalDate,
  pollution_expiry: optionalDate,
  last_service_date: optionalDate,
  next_service_due: optionalDate,
  odometer_km: z.number({ invalid_type_error: "Enter a number" }).min(0).nullable().optional(),
  notes: z.string().optional(),
});
type VehicleInput = z.input<typeof vehicleSchema>;

function toDefaults(v: Vehicle | null): VehicleInput {
  return {
    registration_number: v?.registration_number ?? "",
    fleet_number: v?.fleet_number ?? "",
    vehicle_type: v?.vehicle_type ?? "BUS",
    make: v?.make ?? "",
    model: v?.model ?? "",
    year: v?.year ?? null,
    colour: v?.colour ?? "",
    capacity: v?.capacity ?? (null as unknown as number),
    gps_device_id: v?.gps_device_id ?? "",
    insurance_number: v?.insurance_number ?? "",
    insurance_expiry: v?.insurance_expiry ?? null,
    permit_number: v?.permit_number ?? "",
    permit_expiry: v?.permit_expiry ?? null,
    fitness_certificate_number: v?.fitness_certificate_number ?? "",
    fitness_expiry: v?.fitness_expiry ?? null,
    pollution_expiry: v?.pollution_expiry ?? null,
    last_service_date: v?.last_service_date ?? null,
    next_service_due: v?.next_service_due ?? null,
    odometer_km: v?.odometer_km ?? 0,
    notes: v?.notes ?? "",
  };
}

interface Props {
  open: boolean;
  vehicle: Vehicle | null;
  onClose: () => void;
  onSaved?: (v: Vehicle) => void;
}

/** Create / edit vehicle drawer with all registration, document-expiry and service fields. */
export function VehicleFormDrawer({ open, vehicle, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const form = useZodForm(vehicleSchema, { defaultValues: toDefaults(vehicle) });
  useEffect(() => {
    if (open) form.reset(toDefaults(vehicle));
  }, [open, vehicle, form]);
  const save = useMutation({
    mutationFn: (d: VehicleInput) => (vehicle ? patch<Vehicle>(`/fleet/vehicles/${vehicle.id}/`, d) : post<Vehicle>("/fleet/vehicles/", d)),
    onSuccess: (v) => {
      invalidate(qc, "vehicles", "opts-vehicles", "vehicle", "dashboard");
      message.success(vehicle ? "Vehicle updated" : "Vehicle added");
      onSaved?.(v);
      onClose();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const c = form.control;
  return (
    <FormDrawer open={open} title={vehicle ? `Edit ${vehicle.registration_number}` : "Add vehicle"} onClose={onClose} onSubmit={form.handleSubmit((d) => save.mutate(d))} submitting={save.isPending} error={save.isError ? save.error : undefined} width={640} submitLabel={vehicle ? "Save changes" : "Add vehicle"}>
      <Row gutter={16}>
        <Col xs={24} md={12}><TextField control={c} name="registration_number" label="Registration number" required placeholder="KA01AB1234" /></Col>
        <Col xs={24} md={12}><TextField control={c} name="fleet_number" label="Fleet number" placeholder="1" /></Col>
        <Col xs={24} md={12}><SelectField control={c} name="vehicle_type" label="Type" required options={VEHICLE_TYPE} allowClear={false} /></Col>
        <Col xs={24} md={12}><NumberField control={c} name="capacity" label="Seating capacity" required min={1} /></Col>
        <Col xs={24} md={8}><TextField control={c} name="make" label="Make" /></Col>
        <Col xs={24} md={8}><TextField control={c} name="model" label="Model" /></Col>
        <Col xs={24} md={8}><NumberField control={c} name="year" label="Year" min={1980} max={2100} /></Col>
        <Col xs={24} md={12}><TextField control={c} name="colour" label="Colour" /></Col>
        <Col xs={24} md={12}><TextField control={c} name="gps_device_id" label="GPS device ID" help="Optional hardware tracker identifier" /></Col>
      </Row>
      <Divider orientation="left" plain>Documents and expiry dates</Divider>
      <Row gutter={16}>
        <Col xs={24} md={12}><TextField control={c} name="insurance_number" label="Insurance number" /></Col>
        <Col xs={24} md={12}><DateField control={c} name="insurance_expiry" label="Insurance expiry" /></Col>
        <Col xs={24} md={12}><TextField control={c} name="permit_number" label="Permit number" /></Col>
        <Col xs={24} md={12}><DateField control={c} name="permit_expiry" label="Permit expiry" /></Col>
        <Col xs={24} md={12}><TextField control={c} name="fitness_certificate_number" label="Fitness certificate number" /></Col>
        <Col xs={24} md={12}><DateField control={c} name="fitness_expiry" label="Fitness expiry" /></Col>
        <Col xs={24} md={12}><DateField control={c} name="pollution_expiry" label="Pollution certificate expiry" /></Col>
      </Row>
      <Divider orientation="left" plain>Service</Divider>
      <Row gutter={16}>
        <Col xs={24} md={8}><DateField control={c} name="last_service_date" label="Last service" /></Col>
        <Col xs={24} md={8}><DateField control={c} name="next_service_due" label="Next service due" /></Col>
        <Col xs={24} md={8}><NumberField control={c} name="odometer_km" label="Odometer (km)" min={0} /></Col>
        <Col xs={24}><TextAreaField control={c} name="notes" label="Notes" rows={2} /></Col>
      </Row>
    </FormDrawer>
  );
}
