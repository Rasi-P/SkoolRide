import { useEffect } from "react";
import { Col, Row, message } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { fieldErrors } from "@/api/client";
import { SelectField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { FormDrawer } from "../components/FormDrawer";
import { invalidate, patch, post } from "../api";
import type { Parent } from "../types";

const schema = z.object({
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().optional(),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().min(6, "Phone is required"),
  alt_phone: z.string().optional(),
  address: z.string().optional(),
  preferred_language: z.string().optional(),
  notes: z.string().optional(),
});
type Input = z.input<typeof schema>;

const LANGUAGES = [{ value: "en", label: "English" }, { value: "hi", label: "Hindi" }, { value: "kn", label: "Kannada" }, { value: "ta", label: "Tamil" }, { value: "te", label: "Telugu" }, { value: "ml", label: "Malayalam" }];

const toDefaults = (p: Parent | null): Input => ({ first_name: p?.first_name ?? "", last_name: p?.last_name ?? "", email: p?.email ?? "", phone: p?.phone ?? "", alt_phone: p?.alt_phone ?? "", address: p?.address ?? "", preferred_language: p?.preferred_language || "en", notes: p?.notes ?? "" });

export function ParentFormDrawer({ open, parent, onClose }: { open: boolean; parent: Parent | null; onClose: () => void }) {
  const qc = useQueryClient();
  const form = useZodForm(schema, { defaultValues: toDefaults(parent) });
  useEffect(() => {
    if (open) form.reset(toDefaults(parent));
  }, [open, parent, form]);
  const save = useMutation({
    mutationFn: (d: Input) => (parent ? patch<Parent>(`/people/parents/${parent.id}/`, d) : post<Parent>("/people/parents/", d)),
    onSuccess: () => {
      invalidate(qc, "parents", "parent", "student", "students", "dashboard", "onboarding");
      message.success(parent ? "Parent updated" : "Parent added");
      onClose();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const c = form.control;
  return (
    <FormDrawer open={open} title={parent ? `Edit ${parent.full_name}` : "Add parent"} onClose={onClose} onSubmit={form.handleSubmit((d) => save.mutate(d))} submitting={save.isPending} error={save.isError ? save.error : undefined} submitLabel={parent ? "Save changes" : "Add parent"}>
      <Row gutter={16}>
        <Col span={12}><TextField control={c} name="first_name" label="First name" required /></Col>
        <Col span={12}><TextField control={c} name="last_name" label="Last name" /></Col>
        <Col span={24}><TextField control={c} name="email" label="Email" type="email" required autoComplete="email" help="Used to sign in to the parent app." /></Col>
        <Col span={12}><TextField control={c} name="phone" label="Phone" required autoComplete="tel" /></Col>
        <Col span={12}><TextField control={c} name="alt_phone" label="Alternate phone" /></Col>
        <Col span={24}><TextAreaField control={c} name="address" label="Address" rows={2} /></Col>
        <Col span={12}><SelectField control={c} name="preferred_language" label="Preferred language" options={LANGUAGES} allowClear={false} /></Col>
        <Col span={24}><TextAreaField control={c} name="notes" label="Notes" rows={2} /></Col>
      </Row>
    </FormDrawer>
  );
}
