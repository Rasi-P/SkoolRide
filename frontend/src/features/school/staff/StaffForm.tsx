import { useEffect } from "react";
import { Col, Divider, Row, message } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { fieldErrors } from "@/api/client";
import { DateField, SelectField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { FormDrawer } from "../components/FormDrawer";
import { GENDER, STAFF_STATUS, STAFF_TYPE } from "../constants";
import { invalidate, patch, post } from "../api";
import type { Staff } from "../types";

const schema = z.object({
  staff_type: z.enum(["DRIVER", "ATTENDANT", "TRANSPORT_MANAGER", "SCHOOL_ADMIN"]),
  employee_id: z.string().trim().min(1, "Employee ID is required"),
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().optional(),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().trim().min(6, "Phone is required"),
  date_of_birth: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  address: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  joining_date: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "ON_LEAVE", "INACTIVE"]).optional(),
  licence_number: z.string().optional(),
  licence_class: z.string().optional(),
  licence_expiry: z.string().nullable().optional(),
  notes: z.string().optional(),
}).superRefine((d, ctx) => {
  if (d.staff_type === "DRIVER" && !d.licence_number?.trim()) ctx.addIssue({ code: "custom", path: ["licence_number"], message: "Licence number is required for drivers" });
  if (d.staff_type === "DRIVER" && !d.licence_expiry) ctx.addIssue({ code: "custom", path: ["licence_expiry"], message: "Licence expiry is required for drivers" });
});
type Input = z.input<typeof schema>;

function toDefaults(s: Staff | null, presetType?: Staff["staff_type"]): Input {
  return {
    staff_type: s?.staff_type ?? presetType ?? "DRIVER",
    employee_id: s?.employee_id ?? "",
    first_name: s?.first_name ?? "",
    last_name: s?.last_name ?? "",
    email: s?.email ?? "",
    phone: s?.phone ?? "",
    date_of_birth: s?.date_of_birth ?? null,
    gender: s?.gender || null,
    address: s?.address ?? "",
    emergency_contact_name: s?.emergency_contact_name ?? "",
    emergency_contact_phone: s?.emergency_contact_phone ?? "",
    joining_date: s?.joining_date ?? null,
    status: s?.status ?? "ACTIVE",
    licence_number: s?.licence_number ?? "",
    licence_class: s?.licence_class ?? "",
    licence_expiry: s?.licence_expiry ?? null,
    notes: s?.notes ?? "",
  };
}

interface Props {
  open: boolean;
  staff: Staff | null;
  onClose: () => void;
  presetType?: Staff["staff_type"];
}

export function StaffFormDrawer({ open, staff, onClose, presetType }: Props) {
  const qc = useQueryClient();
  const form = useZodForm(schema, { defaultValues: toDefaults(staff, presetType) });
  useEffect(() => {
    if (open) form.reset(toDefaults(staff, presetType));
  }, [open, staff, presetType, form]);
  const type = form.watch("staff_type");
  const save = useMutation({
    mutationFn: (d: Input) => {
      const body = { ...d, gender: d.gender ?? "" };
      return staff ? patch<Staff>(`/people/staff/${staff.id}/`, body) : post<Staff>("/people/staff/", body);
    },
    onSuccess: () => {
      invalidate(qc, "staff", "opts-staff", "staff-detail", "dashboard");
      message.success(staff ? "Staff profile updated" : "Staff member added");
      onClose();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const c = form.control;
  return (
    <FormDrawer open={open} title={staff ? `Edit ${staff.full_name}` : "Add staff member"} onClose={onClose} onSubmit={form.handleSubmit((d) => save.mutate(d))} submitting={save.isPending} error={save.isError ? save.error : undefined} width={640} submitLabel={staff ? "Save changes" : "Add staff"}>
      <Row gutter={16}>
        <Col xs={24} md={12}><SelectField control={c} name="staff_type" label="Role" required options={STAFF_TYPE} allowClear={false} disabled={!!staff} /></Col>
        <Col xs={24} md={12}><TextField control={c} name="employee_id" label="Employee ID" required /></Col>
        <Col xs={24} md={12}><TextField control={c} name="first_name" label="First name" required /></Col>
        <Col xs={24} md={12}><TextField control={c} name="last_name" label="Last name" /></Col>
        <Col xs={24} md={12}><TextField control={c} name="phone" label="Phone" required autoComplete="tel" /></Col>
        <Col xs={24} md={12}><TextField control={c} name="email" label="Email" type="email" help="Needed to invite them to the app" /></Col>
        <Col xs={24} md={8}><DateField control={c} name="date_of_birth" label="Date of birth" /></Col>
        <Col xs={24} md={8}><SelectField control={c} name="gender" label="Gender" options={GENDER} /></Col>
        <Col xs={24} md={8}><DateField control={c} name="joining_date" label="Joining date" /></Col>
        {staff && <Col xs={24} md={8}><SelectField control={c} name="status" label="Status" options={STAFF_STATUS} allowClear={false} /></Col>}
        <Col xs={24}><TextAreaField control={c} name="address" label="Address" rows={2} /></Col>
        <Col xs={24} md={12}><TextField control={c} name="emergency_contact_name" label="Emergency contact" /></Col>
        <Col xs={24} md={12}><TextField control={c} name="emergency_contact_phone" label="Emergency phone" /></Col>
      </Row>
      {type === "DRIVER" && (
        <>
          <Divider orientation="left" plain>Driving licence</Divider>
          <Row gutter={16}>
            <Col xs={24} md={10}><TextField control={c} name="licence_number" label="Licence number" required /></Col>
            <Col xs={24} md={6}><TextField control={c} name="licence_class" label="Class" placeholder="HPMV" /></Col>
            <Col xs={24} md={8}><DateField control={c} name="licence_expiry" label="Expiry" required /></Col>
          </Row>
        </>
      )}
      <TextAreaField control={c} name="notes" label="Notes" rows={2} />
    </FormDrawer>
  );
}
