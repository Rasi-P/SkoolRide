import { useMemo } from "react";
import { App, Button, Col, Modal, Row, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fieldErrors } from "@/api/client";
import { DateField, SelectField, TextAreaField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { InlineError } from "@/components/ui/States";
import { fmtTime } from "@/lib/format";
import { parentApi, qk } from "../api";
import { useParent } from "../context";
import { ABSENCE_DIRECTION_LABELS, CHANGE_TYPE_LABELS } from "../labels";
import { absenceSchema, pickupChangeSchema, type AbsenceFormValues, type PickupChangeFormValues } from "../schemas";
import type { AbsenceDirection, AbsenceInput, PickupChangeInput, PickupChangeType } from "../types";

/** Mount only while open: the form initialises from the currently selected child each time it opens. */
export function AbsenceFormModal({ onClose }: { onClose: () => void }) {
  const { children, selectedId } = useParent();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const form = useZodForm(absenceSchema, { defaultValues: { student: selectedId ?? "", date_from: "", date_to: "", direction: "BOTH", reason: "" } });
  const create = useMutation({
    mutationFn: (d: AbsenceFormValues) => parentApi.createAbsence(d as AbsenceInput),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.absences });
      qc.invalidateQueries({ queryKey: ["parent", "home"] });
      qc.invalidateQueries({ queryKey: ["parent", "trips"] });
      message.success("Absence reported. The school has been notified.");
      onClose();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  return (
    <Modal open onCancel={onClose} footer={null} title="Report an absence" centered>
      <form onSubmit={form.handleSubmit((d) => create.mutate(d))} noValidate>
        {create.isError && <InlineError error={create.error} />}
        <SelectField control={form.control} name="student" label="Child" required allowClear={false} options={children.map((c) => ({ value: c.id, label: `${c.name} · ${c.class_label}` }))} />
        <Row gutter={12}>
          <Col span={12}>
            <DateField control={form.control} name="date_from" label="From" required />
          </Col>
          <Col span={12}>
            <DateField control={form.control} name="date_to" label="To" required />
          </Col>
        </Row>
        <SelectField
          control={form.control}
          name="direction"
          label="Which trips"
          required
          allowClear={false}
          options={(Object.keys(ABSENCE_DIRECTION_LABELS) as AbsenceDirection[]).map((k) => ({ value: k, label: ABSENCE_DIRECTION_LABELS[k] }))}
        />
        <TextAreaField control={form.control} name="reason" label="Reason" required placeholder="e.g. Unwell, family travel" rows={2} />
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
          The bus will not wait for your child on these days. You can cancel the report until its last day.
        </Typography.Text>
        <Button type="primary" htmlType="submit" size="large" block className="sbp-touch-btn" loading={create.isPending}>
          Submit absence
        </Button>
      </form>
    </Modal>
  );
}

const CHANGE_HINTS: Record<PickupChangeType, string> = {
  STOP_CHANGE: "Pick the new stop on your child's current route.",
  ROUTE_CHANGE: "Describe the route or area you need. The transport office will choose the stop and confirm any fee change.",
  TEMPORARY: "A different stop for a limited period, for example while you are travelling.",
  WITHDRAW: "Your child will stop using school transport from the effective date.",
  OTHER: "Anything else about pickup or drop-off arrangements.",
};

export function PickupChangeFormModal({ onClose }: { onClose: () => void }) {
  const { children, selectedId } = useParent();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const form = useZodForm(pickupChangeSchema, {
    defaultValues: { student: selectedId ?? "", change_type: "STOP_CHANGE", effective_date: "", end_date: null, requested_pickup_stop: null, requested_dropoff_stop: null, details: "" },
  });
  const studentId = form.watch("student");
  const changeType = form.watch("change_type") as PickupChangeType;
  const needsStops = changeType === "STOP_CHANGE" || changeType === "TEMPORARY";
  // Parents cannot browse the route catalogue, so stop choices come from the child's own route schedule.
  const schedule = useQuery({ queryKey: qk.schedule(studentId || null), queryFn: () => parentApi.schedule(studentId), enabled: !!studentId && needsStops });
  const stopOptions = useMemo(
    () =>
      (schedule.data?.stops ?? [])
        .filter((s) => !s.is_school_stop)
        .map((s) => ({ value: s.id, label: `${s.sequence}. ${s.name}${s.planned_pickup_time ? ` · ${fmtTime(s.planned_pickup_time)}` : ""}` })),
    [schedule.data],
  );
  const create = useMutation({
    mutationFn: (d: PickupChangeFormValues) => {
      const routeId = schedule.data?.assignment?.route.id ?? null;
      const body: PickupChangeInput = {
        student: d.student,
        change_type: d.change_type,
        effective_date: d.effective_date,
        end_date: d.end_date || null,
        details: d.details,
        requested_pickup_stop: needsStops ? d.requested_pickup_stop || null : null,
        requested_dropoff_stop: needsStops ? d.requested_dropoff_stop || null : null,
        requested_route: needsStops && d.requested_pickup_stop ? routeId : null,
      };
      return parentApi.createPickupChange(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.pickupChanges });
      message.success("Request submitted. The transport office will review it.");
      onClose();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  return (
    <Modal open onCancel={onClose} footer={null} title="Request a pickup change" centered>
      <form onSubmit={form.handleSubmit((d) => create.mutate(d))} noValidate>
        {create.isError && <InlineError error={create.error} />}
        <SelectField control={form.control} name="student" label="Child" required allowClear={false} options={children.map((c) => ({ value: c.id, label: `${c.name} · ${c.class_label}` }))} />
        <SelectField
          control={form.control}
          name="change_type"
          label="Type of change"
          required
          allowClear={false}
          options={(Object.keys(CHANGE_TYPE_LABELS) as PickupChangeType[]).map((k) => ({ value: k, label: CHANGE_TYPE_LABELS[k] }))}
          help={CHANGE_HINTS[changeType]}
        />
        <Row gutter={12}>
          <Col span={changeType === "TEMPORARY" ? 12 : 24}>
            <DateField control={form.control} name="effective_date" label="Effective from" required />
          </Col>
          {changeType === "TEMPORARY" && (
            <Col span={12}>
              <DateField control={form.control} name="end_date" label="Until" required />
            </Col>
          )}
        </Row>
        {needsStops && (
          <>
            <SelectField
              control={form.control}
              name="requested_pickup_stop"
              label="New pickup stop"
              required={changeType === "STOP_CHANGE"}
              options={stopOptions}
              loading={schedule.isLoading}
              placeholder={schedule.data && stopOptions.length === 0 ? "No stops available" : "Choose a stop"}
              help={schedule.data && !schedule.data.assignment ? "Your child has no transport assignment yet; describe what you need in the details." : undefined}
            />
            <SelectField control={form.control} name="requested_dropoff_stop" label="New drop-off stop" options={stopOptions} loading={schedule.isLoading} placeholder="Same as pickup" />
          </>
        )}
        <TextAreaField control={form.control} name="details" label="Details" required rows={3} placeholder="Tell the transport office what you need and why" />
        <Button type="primary" htmlType="submit" size="large" block className="sbp-touch-btn" loading={create.isPending}>
          Submit request
        </Button>
      </form>
    </Modal>
  );
}
