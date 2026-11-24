import { useEffect } from "react";
import { Col, Row, message } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { fieldErrors } from "@/api/client";
import { DateField, SelectField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { FormDrawer } from "../components/FormDrawer";
import { GENDER } from "../constants";
import { invalidate, patch, post } from "../api";
import type { Student } from "../types";

const schema = z.object({
  admission_number: z.string().trim().min(1, "Admission number is required"),
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().optional(),
  grade: z.string().trim().min(1, "Grade is required"),
  section: z.string().optional(),
  date_of_birth: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  blood_group: z.string().optional(),
  medical_notes: z.string().optional(),
  pickup_address: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  notes: z.string().optional(),
});
type Input = z.input<typeof schema>;

function toDefaults(s: Student | null): Input {
  return {
    admission_number: s?.admission_number ?? "",
    first_name: s?.first_name ?? "",
    last_name: s?.last_name ?? "",
    grade: s?.grade ?? "",
    section: s?.section ?? "",
    date_of_birth: s?.date_of_birth ?? null,
    gender: s?.gender || null,
    blood_group: s?.blood_group ?? "",
    medical_notes: s?.medical_notes ?? "",
    pickup_address: s?.pickup_address ?? "",
    emergency_contact_name: s?.emergency_contact_name ?? "",
    emergency_contact_phone: s?.emergency_contact_phone ?? "",
    notes: s?.notes ?? "",
  };
}

export function StudentFormDrawer({ open, student, onClose }: { open: boolean; student: Student | null; onClose: () => void }) {
  const qc = useQueryClient();
  const form = useZodForm(schema, { defaultValues: toDefaults(student) });
  useEffect(() => {
    if (open) form.reset(toDefaults(student));
  }, [open, student, form]);
  const save = useMutation({
    mutationFn: (d: Input) => {
      const body = { ...d, gender: d.gender ?? "" };
      return student ? patch<Student>(`/people/students/${student.id}/`, body) : post<Student>("/people/students/", body);
    },
    onSuccess: () => {
      invalidate(qc, "students", "student", "dashboard");
      message.success(student ? "Student updated" : "Student added");
      onClose();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const c = form.control;
  return (
    <FormDrawer open={open} title={student ? `Edit ${student.full_name}` : "Add student"} onClose={onClose} onSubmit={form.handleSubmit((d) => save.mutate(d))} submitting={save.isPending} error={save.isError ? save.error : undefined} width={620} submitLabel={student ? "Save changes" : "Add student"}>
      <Row gutter={16}>
        <Col xs={24} md={12}><TextField control={c} name="admission_number" label="Admission number" required /></Col>
        <Col xs={12} md={6}><TextField control={c} name="grade" label="Grade" required placeholder="5" /></Col>
        <Col xs={12} md={6}><TextField control={c} name="section" label="Section" placeholder="A" /></Col>
        <Col xs={24} md={12}><TextField control={c} name="first_name" label="First name" required /></Col>
        <Col xs={24} md={12}><TextField control={c} name="last_name" label="Last name" /></Col>
        <Col xs={24} md={8}><DateField control={c} name="date_of_birth" label="Date of birth" /></Col>
        <Col xs={24} md={8}><SelectField control={c} name="gender" label="Gender" options={GENDER} /></Col>
        <Col xs={24} md={8}><TextField control={c} name="blood_group" label="Blood group" placeholder="O+" /></Col>
        <Col xs={24}><TextAreaField control={c} name="pickup_address" label="Pickup address" rows={2} /></Col>
        <Col xs={24} md={12}><TextField control={c} name="emergency_contact_name" label="Emergency contact" /></Col>
        <Col xs={24} md={12}><TextField control={c} name="emergency_contact_phone" label="Emergency phone" /></Col>
        <Col xs={24}><TextAreaField control={c} name="medical_notes" label="Medical notes" rows={2} help="Visible to attendants and drivers on the trip sheet." /></Col>
        <Col xs={24}><TextAreaField control={c} name="notes" label="Internal notes" rows={2} /></Col>
      </Row>
    </FormDrawer>
  );
}
