import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Card, Col, Row, message } from "antd";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { SelectField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { KeyValue } from "@/components/ui/Misc";
import { fmtDateTime, fmtWeekdays, titleCase } from "@/lib/format";
import { platformApi } from "../../api";
import { timezoneOptions } from "../../lib";
import type { SchoolDetail } from "../../types";

const schema = z.object({
  name: z.string().trim().min(2, "School name is required"),
  email: z.string().email("Enter a valid email").or(z.literal("")),
  phone: z.string(),
  website: z.string().url("Enter a valid URL (https://...)").or(z.literal("")),
  address_line1: z.string(),
  address_line2: z.string(),
  city: z.string(),
  state: z.string(),
  postal_code: z.string(),
  country: z.string(),
  timezone: z.string({ invalid_type_error: "Timezone is required" }).min(1, "Timezone is required"),
  notes: z.string(),
});
type Values = z.input<typeof schema>;

const toValues = (s: SchoolDetail): Values => ({
  name: s.name,
  email: s.email,
  phone: s.phone,
  website: s.website,
  address_line1: s.address_line1,
  address_line2: s.address_line2,
  city: s.city,
  state: s.state,
  postal_code: s.postal_code,
  country: s.country,
  timezone: s.timezone,
  notes: s.notes,
});

export function SchoolOverviewTab({ school, onSaved }: { school: SchoolDetail; onSaved: () => void }) {
  const form = useZodForm(schema, { values: toValues(school) });
  const save = useMutation({
    mutationFn: (d: Values) => platformApi.updateSchool(school.id, d),
    onSuccess: () => {
      message.success("School profile saved");
      onSaved();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const dirty = form.formState.isDirty;
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={14}>
        <Card size="small" title="Profile">
          <form onSubmit={form.handleSubmit((d) => save.mutate(d))} noValidate>
            {save.isError && <Alert type="error" showIcon message={errorMessage(save.error)} style={{ marginBottom: 12 }} />}
            <Row gutter={16}>
              <Col xs={24}>
                <TextField control={form.control} name="name" label="School name" required />
              </Col>
              <Col xs={24} md={12}>
                <TextField control={form.control} name="email" label="Email" type="email" />
              </Col>
              <Col xs={24} md={12}>
                <TextField control={form.control} name="phone" label="Phone" />
              </Col>
              <Col xs={24}>
                <TextField control={form.control} name="website" label="Website" placeholder="https://" />
              </Col>
              <Col xs={24} md={12}>
                <TextField control={form.control} name="address_line1" label="Address line 1" />
              </Col>
              <Col xs={24} md={12}>
                <TextField control={form.control} name="address_line2" label="Address line 2" />
              </Col>
              <Col xs={24} md={8}>
                <TextField control={form.control} name="city" label="City" />
              </Col>
              <Col xs={24} md={8}>
                <TextField control={form.control} name="state" label="State" />
              </Col>
              <Col xs={24} md={8}>
                <TextField control={form.control} name="postal_code" label="Postal code" />
              </Col>
              <Col xs={24} md={12}>
                <TextField control={form.control} name="country" label="Country" />
              </Col>
              <Col xs={24} md={12}>
                <SelectField control={form.control} name="timezone" label="Timezone" options={timezoneOptions(school.timezone)} allowClear={false} required />
              </Col>
              <Col xs={24}>
                <TextAreaField control={form.control} name="notes" label="Internal notes" help="Visible to platform admins only." />
              </Col>
            </Row>
            <div className="sbp-row">
              <Button type="primary" htmlType="submit" loading={save.isPending} disabled={!dirty}>
                Save changes
              </Button>
              <Button onClick={() => form.reset(toValues(school))} disabled={!dirty}>
                Discard
              </Button>
            </div>
          </form>
        </Card>
      </Col>
      <Col xs={24} lg={10}>
        <div className="sbp-stack" style={{ gap: 16 }}>
          <Card size="small" title="Details">
            <KeyValue
              items={[
                { label: "Code", value: <span className="sbp-mono">{school.code}</span> },
                { label: "Slug", value: school.slug },
                { label: "Currency", value: school.currency },
                { label: "Coordinates", value: school.latitude && school.longitude ? `${school.latitude}, ${school.longitude}` : "Not set" },
                { label: "Created", value: fmtDateTime(school.created_at) },
                { label: "Approved", value: fmtDateTime(school.approved_at) },
                { label: "Activated", value: fmtDateTime(school.activated_at) },
                { label: "Suspended", value: fmtDateTime(school.suspended_at) },
                { label: "Last updated", value: fmtDateTime(school.updated_at) },
              ]}
            />
          </Card>
          <Card size="small" title="Operations">
            <KeyValue
              items={[
                { label: "Operating days", value: fmtWeekdays(school.operating_weekdays) },
                { label: "Academic year", value: school.academic_year_label || "-" },
                { label: "Billing cycle", value: titleCase(school.fee_billing_cycle) },
                { label: "Arrival alert", value: `${school.arrival_alert_minutes} min before` },
                { label: "Delay alert", value: `after ${school.delay_alert_minutes} min` },
                { label: "GPS stale after", value: `${school.gps_stale_seconds} s` },
                { label: "Transport office", value: school.transport_office_phone || school.transport_office_email || "-" },
                { label: "Emergency contact", value: school.emergency_contact_phone || "-" },
              ]}
            />
          </Card>
        </div>
      </Col>
    </Row>
  );
}
