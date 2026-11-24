import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Col, Row, Typography, message } from "antd";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { DateField, SelectField, TextAreaField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { KeyValue } from "@/components/ui/Misc";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { dayjs, fmtDate, fmtMoney } from "@/lib/format";
import { platformApi, platformKeys } from "../../api";
import { SUBSCRIPTION_STATUS_OPTIONS } from "../../constants";
import type { SchoolDetail, SubscriptionStatus } from "../../types";

const STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"] as const;
const schema = z.object({
  plan: z.string({ invalid_type_error: "Select a plan" }).min(1, "Select a plan"),
  status: z.enum(STATUSES, { invalid_type_error: "Select a status", required_error: "Select a status" }),
  starts_at: z.string({ invalid_type_error: "Start date is required" }).min(1, "Start date is required"),
  ends_at: z.string().nullable().optional(),
  notes: z.string().optional(),
});
type Values = z.input<typeof schema>;

export function SchoolSubscriptionTab({ school, onSaved }: { school: SchoolDetail; onSaved: () => void }) {
  const sub = school.subscription;
  const plans = useQuery({ queryKey: platformKeys.allPlans, queryFn: platformApi.allPlans });
  const planOptions = useMemo(
    () =>
      (plans.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.name}${p.is_active ? "" : " (inactive)"} · ${fmtMoney(p.price_monthly, p.currency)}/month`,
      })),
    [plans.data],
  );
  const values: Values = {
    plan: sub?.plan ?? "",
    status: sub?.status ?? "TRIAL",
    starts_at: sub?.starts_at ?? dayjs().format("YYYY-MM-DD"),
    ends_at: sub?.ends_at ?? null,
    notes: sub?.notes ?? "",
  };
  const form = useZodForm(schema, { values });
  const save = useMutation({
    mutationFn: (d: Values) =>
      platformApi.updateSubscription(school.id, {
        plan: d.plan,
        status: d.status as SubscriptionStatus,
        starts_at: d.starts_at,
        ends_at: d.ends_at || null,
        notes: d.notes ?? "",
      }),
    onSuccess: () => {
      message.success("Subscription updated");
      onSaved();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const currentPlan = plans.data?.find((p) => p.id === sub?.plan);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card size="small" title="Current subscription">
          {sub ? (
            <div className="sbp-stack">
              <KeyValue
                items={[
                  {
                    label: "Plan",
                    value: (
                      <>
                        {sub.plan_name} <span className="sbp-muted sbp-mono">({sub.plan_code})</span>
                        {currentPlan && <span className="sbp-muted"> · {fmtMoney(currentPlan.price_monthly, currentPlan.currency)}/month</span>}
                      </>
                    ),
                  },
                  { label: "Status", value: <StatusBadge status={sub.status} /> },
                  { label: "Usable", value: sub.is_usable ? "Yes" : "No - the school is not operational" },
                  { label: "Starts", value: fmtDate(sub.starts_at) },
                  { label: "Ends", value: sub.ends_at ? fmtDate(sub.ends_at) : "Open-ended" },
                  { label: "Notes", value: sub.notes || "-" },
                ]}
              />
              <div>
                <div className="sbp-kicker" style={{ marginBottom: 8 }}>Plan limits</div>
                <KeyValue
                  items={[
                    { label: "Vehicles", value: sub.limits.max_vehicles },
                    { label: "Students", value: sub.limits.max_students },
                    { label: "Staff", value: sub.limits.max_staff },
                    { label: "Routes", value: sub.limits.max_routes },
                  ]}
                />
              </div>
            </div>
          ) : (
            <Typography.Text type="secondary">No subscription has been assigned to this school yet. Assign a plan using the form.</Typography.Text>
          )}
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card size="small" title={sub ? "Change subscription" : "Assign subscription"}>
          <form onSubmit={form.handleSubmit((d) => save.mutate(d))} noValidate>
            {save.isError && <Alert type="error" showIcon message={errorMessage(save.error)} style={{ marginBottom: 12 }} />}
            <SelectField control={form.control} name="plan" label="Plan" options={planOptions} loading={plans.isLoading} allowClear={false} required />
            <SelectField control={form.control} name="status" label="Status" options={SUBSCRIPTION_STATUS_OPTIONS} allowClear={false} required />
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <DateField control={form.control} name="starts_at" label="Starts on" required />
              </Col>
              <Col xs={24} md={12}>
                <DateField control={form.control} name="ends_at" label="Ends on" help="Leave empty for open-ended" />
              </Col>
            </Row>
            <TextAreaField control={form.control} name="notes" label="Notes" rows={2} />
            <Button type="primary" htmlType="submit" loading={save.isPending}>
              {sub ? "Update subscription" : "Assign plan"}
            </Button>
          </form>
        </Card>
      </Col>
    </Row>
  );
}
