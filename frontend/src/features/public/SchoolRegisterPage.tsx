import { Alert, Button, Card, Col, Result, Row, Typography } from "antd";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { z } from "zod";
import { api, errorMessage, fieldErrors } from "@/api/client";
import { NumberField, SelectField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";

const schema = z.object({
  school_name: z.string().min(3, "School name is required"),
  contact_name: z.string().min(2, "Contact name is required"),
  contact_email: z.string().email("Enter a valid email"),
  contact_phone: z.string().min(6, "Phone is required"),
  designation: z.string().optional(),
  address: z.string().min(5, "Address is required"),
  city: z.string().min(2, "City is required"),
  state: z.string().optional(),
  postal_code: z.string().optional(),
  website: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  estimated_students: z.number().min(0).optional().nullable(),
  estimated_vehicles: z.number().min(0).optional().nullable(),
  requested_plan: z.string().optional().nullable(),
  message: z.string().optional(),
});

export default function SchoolRegisterPage() {
  const plans = useQuery({ queryKey: ["public-plans"], queryFn: () => api.get<{ id: string; name: string }[]>("/public/plans/").then((r) => r.data) });
  const form = useZodForm(schema, {
    defaultValues: {
      school_name: "", contact_name: "", contact_email: "", contact_phone: "", designation: "", address: "", city: "", state: "",
      postal_code: "", website: "", estimated_students: 0, estimated_vehicles: 0, requested_plan: null, message: "",
    },
  });
  const submit = useMutation({
    mutationFn: (data: z.input<typeof schema>) => api.post<{ tracking_code: string }>("/public/register-school/", data).then((r) => r.data),
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  if (submit.isSuccess)
    return (
      <div className="sbp-page">
        <Result status="success" title="Application submitted" subTitle={<>Your tracking code is <strong>{submit.data.tracking_code}</strong>. We emailed it to you. The platform team will review your application and send the admin invitation once approved.</>}
          extra={<Link to={`/register/status/${submit.data.tracking_code}`}><Button type="primary">Track application</Button></Link>} />
      </div>
    );
  return (
    <div className="sbp-page" style={{ maxWidth: 860 }}>
      <Typography.Title level={2}>Register your school</Typography.Title>
      <Typography.Paragraph type="secondary">Tell us about your school and transport operation. Applications are reviewed by the SchoolBus Pro team; access is granted only after approval.</Typography.Paragraph>
      <Card>
        {submit.isError && <Alert type="error" showIcon message={errorMessage(submit.error)} style={{ marginBottom: 16 }} />}
        <form onSubmit={form.handleSubmit((d) => submit.mutate(d))} noValidate>
          <Row gutter={16}>
            <Col xs={24} md={12}><TextField control={form.control} name="school_name" label="School name" required /></Col>
            <Col xs={24} md={12}><TextField control={form.control} name="website" label="Website" placeholder="https://" /></Col>
            <Col xs={24} md={12}><TextField control={form.control} name="contact_name" label="Contact person" required /></Col>
            <Col xs={24} md={12}><TextField control={form.control} name="designation" label="Designation" placeholder="Principal, Transport head..." /></Col>
            <Col xs={24} md={12}><TextField control={form.control} name="contact_email" label="Email" type="email" required autoComplete="email" /></Col>
            <Col xs={24} md={12}><TextField control={form.control} name="contact_phone" label="Phone" required autoComplete="tel" /></Col>
            <Col xs={24}><TextAreaField control={form.control} name="address" label="Address" required rows={2} /></Col>
            <Col xs={24} md={8}><TextField control={form.control} name="city" label="City" required /></Col>
            <Col xs={24} md={8}><TextField control={form.control} name="state" label="State" /></Col>
            <Col xs={24} md={8}><TextField control={form.control} name="postal_code" label="Postal code" /></Col>
            <Col xs={24} md={8}><NumberField control={form.control} name="estimated_students" label="Students using transport" min={0} /></Col>
            <Col xs={24} md={8}><NumberField control={form.control} name="estimated_vehicles" label="Vehicles" min={0} /></Col>
            <Col xs={24} md={8}><SelectField control={form.control} name="requested_plan" label="Preferred plan" options={(plans.data ?? []).map((p) => ({ value: p.id, label: p.name }))} loading={plans.isLoading} /></Col>
            <Col xs={24}><TextAreaField control={form.control} name="message" label="Anything else we should know?" /></Col>
          </Row>
          <Button type="primary" size="large" htmlType="submit" loading={submit.isPending}>Submit application</Button>
        </form>
      </Card>
    </div>
  );
}
