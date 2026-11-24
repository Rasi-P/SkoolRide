import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Col, Drawer, Row, message } from "antd";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { NumberField, SelectField, SwitchField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { platformApi } from "../api";
import type { PlanPayload, SubscriptionPlan } from "../types";

const limit = (label: string) => z.number({ invalid_type_error: `${label} is required` }).int(`${label} must be a whole number`).min(0, `${label} must be 0 or more`);

const schema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(40, "Max 40 characters")
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "Letters, numbers, hyphens and underscores only"),
  name: z.string().trim().min(1, "Name is required").max(80, "Max 80 characters"),
  description: z.string().optional(),
  price_monthly: z.number({ invalid_type_error: "Enter a monthly price" }).min(0, "Price must be 0 or more"),
  currency: z.string().trim().length(3, "Use a 3-letter currency code"),
  max_vehicles: limit("Vehicle limit"),
  max_students: limit("Student limit"),
  max_staff: limit("Staff limit"),
  max_routes: limit("Route limit"),
  features: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  sort_order: limit("Sort order").optional(),
});
type Values = z.input<typeof schema>;

const toValues = (p: SubscriptionPlan | null): Values =>
  p
    ? {
        code: p.code,
        name: p.name,
        description: p.description,
        price_monthly: Number(p.price_monthly),
        currency: p.currency,
        max_vehicles: p.max_vehicles,
        max_students: p.max_students,
        max_staff: p.max_staff,
        max_routes: p.max_routes,
        features: p.features,
        is_active: p.is_active,
        sort_order: p.sort_order,
      }
    : { code: "", name: "", description: "", price_monthly: 0, currency: "INR", max_vehicles: 10, max_students: 500, max_staff: 50, max_routes: 20, features: [], is_active: true, sort_order: 0 };

export function PlanDrawer({ plan, open, onClose, onSaved }: { plan: SubscriptionPlan | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const form = useZodForm(schema, { values: toValues(plan) });
  const save = useMutation({
    mutationFn: (d: Values) => {
      const payload: PlanPayload = {
        code: d.code.trim().toLowerCase(),
        name: d.name.trim(),
        description: d.description ?? "",
        price_monthly: d.price_monthly.toFixed(2),
        currency: d.currency.trim().toUpperCase(),
        max_vehicles: d.max_vehicles,
        max_students: d.max_students,
        max_staff: d.max_staff,
        max_routes: d.max_routes,
        features: d.features ?? [],
        is_active: d.is_active ?? true,
        sort_order: d.sort_order ?? 0,
      };
      return plan ? platformApi.updatePlan(plan.id, payload) : platformApi.createPlan(payload);
    },
    onSuccess: (p) => {
      message.success(plan ? `${p.name} updated` : `${p.name} created`);
      onSaved();
      onClose();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const close = () => {
    onClose();
    save.reset();
  };
  return (
    <Drawer open={open} onClose={close} width={560} title={plan ? `Edit ${plan.name}` : "New plan"}>
      <form onSubmit={form.handleSubmit((d) => save.mutate(d))} noValidate>
        {save.isError && <Alert type="error" showIcon message={errorMessage(save.error)} style={{ marginBottom: 16 }} />}
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <TextField control={form.control} name="name" label="Name" required />
          </Col>
          <Col xs={24} md={12}>
            <TextField control={form.control} name="code" label="Code" required help="Short identifier, e.g. starter" />
          </Col>
          <Col xs={24}>
            <TextAreaField control={form.control} name="description" label="Description" rows={2} />
          </Col>
          <Col xs={24} md={12}>
            <NumberField control={form.control} name="price_monthly" label="Monthly price" required min={0} step={100} />
          </Col>
          <Col xs={24} md={12}>
            <TextField control={form.control} name="currency" label="Currency" required placeholder="INR" />
          </Col>
          <Col xs={12} md={6}>
            <NumberField control={form.control} name="max_vehicles" label="Max vehicles" required min={0} />
          </Col>
          <Col xs={12} md={6}>
            <NumberField control={form.control} name="max_students" label="Max students" required min={0} />
          </Col>
          <Col xs={12} md={6}>
            <NumberField control={form.control} name="max_staff" label="Max staff" required min={0} />
          </Col>
          <Col xs={12} md={6}>
            <NumberField control={form.control} name="max_routes" label="Max routes" required min={0} />
          </Col>
          <Col xs={24}>
            <SelectField control={form.control} name="features" label="Features" mode="tags" options={[]} placeholder="Type a feature and press Enter" help="Shown to schools when choosing a plan." />
          </Col>
          <Col xs={12}>
            <NumberField control={form.control} name="sort_order" label="Sort order" min={0} help="Lower numbers appear first" />
          </Col>
          <Col xs={12}>
            <SwitchField control={form.control} name="is_active" label="Available for new subscriptions" />
          </Col>
        </Row>
        <div className="sbp-between" style={{ justifyContent: "flex-end" }}>
          <Button onClick={close}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            {plan ? "Save changes" : "Create plan"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
