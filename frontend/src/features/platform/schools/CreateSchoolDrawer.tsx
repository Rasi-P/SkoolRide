import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Col, Divider, Drawer, Result, Row, Typography, message } from "antd";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { SelectField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { fmtMoney } from "@/lib/format";
import { platformApi, platformKeys } from "../api";
import { InvitationCard } from "../components/InvitationCard";
import { timezoneOptions } from "../lib";

const schema = z.object({
  name: z.string().trim().min(2, "School name is required"),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  address_line1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postal_code: z.string().optional(),
  timezone: z.string({ invalid_type_error: "Timezone is required" }).min(1, "Timezone is required"),
  plan: z.string().nullable().optional(),
  admin_first_name: z.string().trim().min(1, "First name is required"),
  admin_last_name: z.string().optional(),
  admin_email: z.string().email("Enter a valid email"),
});

type Values = z.input<typeof schema>;

const DEFAULTS: Values = {
  name: "",
  email: "",
  phone: "",
  address_line1: "",
  city: "",
  state: "",
  country: "India",
  postal_code: "",
  timezone: "Asia/Kolkata",
  plan: null,
  admin_first_name: "",
  admin_last_name: "",
  admin_email: "",
};

export function CreateSchoolDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const plans = useQuery({ queryKey: platformKeys.activePlans, queryFn: platformApi.activePlans, enabled: open });
  const planOptions = useMemo(
    () => (plans.data ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${fmtMoney(p.price_monthly, p.currency)}/month` })),
    [plans.data],
  );
  const form = useZodForm(schema, { defaultValues: DEFAULTS });
  const create = useMutation({
    mutationFn: (d: Values) =>
      platformApi.createSchool({
        name: d.name,
        email: d.email || "",
        phone: d.phone || "",
        address_line1: d.address_line1 || "",
        city: d.city || "",
        state: d.state || "",
        country: d.country || "India",
        postal_code: d.postal_code || "",
        timezone: d.timezone,
        plan: d.plan || undefined,
        admin_email: d.admin_email,
        admin_first_name: d.admin_first_name,
        admin_last_name: d.admin_last_name || "",
      }),
    onSuccess: (res) => {
      message.success(`${res.school.name} created`);
      qc.invalidateQueries({ queryKey: [platformKeys.schools] });
      qc.invalidateQueries({ queryKey: platformKeys.overview });
      qc.invalidateQueries({ queryKey: platformKeys.schoolOptions });
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const reset = () => {
    create.reset();
    form.reset(DEFAULTS);
  };
  const close = () => {
    onClose();
    reset();
  };
  const result = create.data;

  return (
    <Drawer open={open} onClose={close} width={640} title={result ? "School created" : "Create school"}>
      {result ? (
        <div className="sbp-stack">
          <Result
            status="success"
            style={{ padding: "8px 0" }}
            title={`${result.school.name} is ready`}
            subTitle={`Status: ${result.school.status.toLowerCase().replace("_", " ")}. The school becomes active once the invited admin accepts and signs in.`}
          />
          <InvitationCard invitation={result.invitation} />
          <div className="sbp-between" style={{ justifyContent: "flex-end" }}>
            <Button onClick={reset}>Create another</Button>
            <Button
              type="primary"
              onClick={() => {
                const id = result.school.id;
                close();
                navigate(`/platform/schools/${id}`);
              }}
            >
              Open school
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit((d) => create.mutate(d))} noValidate>
          {create.isError && <Alert type="error" showIcon message={errorMessage(create.error)} style={{ marginBottom: 16 }} />}
          <Typography.Text strong>School</Typography.Text>
          <Row gutter={16} style={{ marginTop: 8 }}>
            <Col xs={24}>
              <TextField control={form.control} name="name" label="School name" required />
            </Col>
            <Col xs={24} md={12}>
              <TextField control={form.control} name="email" label="School email" type="email" />
            </Col>
            <Col xs={24} md={12}>
              <TextField control={form.control} name="phone" label="Phone" autoComplete="off" />
            </Col>
            <Col xs={24}>
              <TextField control={form.control} name="address_line1" label="Address" />
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
              <SelectField control={form.control} name="timezone" label="Timezone" options={timezoneOptions()} allowClear={false} required />
            </Col>
            <Col xs={24}>
              <SelectField
                control={form.control}
                name="plan"
                label="Subscription plan"
                options={planOptions}
                loading={plans.isLoading}
                placeholder="Optional - assign later from the school page"
                help="Selecting a plan creates an active subscription for the school."
              />
            </Col>
          </Row>
          <Divider style={{ margin: "4px 0 16px" }} />
          <Typography.Text strong>Initial administrator</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
            An invitation to become School Admin is emailed to this person.
          </Typography.Paragraph>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <TextField control={form.control} name="admin_first_name" label="First name" required />
            </Col>
            <Col xs={24} md={12}>
              <TextField control={form.control} name="admin_last_name" label="Last name" />
            </Col>
            <Col xs={24}>
              <TextField control={form.control} name="admin_email" label="Admin email" type="email" required autoComplete="off" />
            </Col>
          </Row>
          <div className="sbp-between" style={{ justifyContent: "flex-end" }}>
            <Button onClick={close}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={create.isPending}>
              Create school
            </Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
