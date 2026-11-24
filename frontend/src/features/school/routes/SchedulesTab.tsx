import { useEffect, useState } from "react";
import { Button, Col, Row, Space, Table, Typography, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { DateField, SelectField, SwitchField, TextField, TimeField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { QueryState } from "@/components/ui/States";
import { DirectionTag, StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate, fmtTime, fmtWeekdays } from "@/lib/format";
import { del, invalidate, listAll, patch, post } from "../api";
import { WeekdaysField } from "../components/ExtraFields";
import { FormDrawer } from "../components/FormDrawer";
import { DIRECTION } from "../constants";
import type { RouteSchedule } from "../types";

const schema = z.object({
  direction: z.enum(["PICKUP", "DROPOFF"]),
  label: z.string().optional(),
  weekdays: z.array(z.number()).min(1, "Pick at least one weekday"),
  start_time: z.string({ invalid_type_error: "Start time is required" }).min(1, "Start time is required"),
  is_active: z.boolean(),
  effective_from: z.string().nullable().optional(),
  effective_to: z.string().nullable().optional(),
});
type Input = z.input<typeof schema>;
const toDefaults = (s: RouteSchedule | null): Input => ({ direction: s?.direction ?? "PICKUP", label: s?.label ?? "", weekdays: s?.weekdays ?? [0, 1, 2, 3, 4], start_time: s?.start_time ?? "", is_active: s?.is_active ?? true, effective_from: s?.effective_from ?? null, effective_to: s?.effective_to ?? null });

export function SchedulesTab({ routeId, canManage }: { routeId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const schedules = useQuery({ queryKey: ["route-schedules", routeId], queryFn: () => listAll<RouteSchedule>("/routing/schedules/", { route: routeId }) });
  const [editing, setEditing] = useState<RouteSchedule | "new" | null>(null);
  const form = useZodForm(schema, { defaultValues: toDefaults(null) });
  useEffect(() => {
    if (editing !== null) form.reset(toDefaults(editing === "new" ? null : editing));
  }, [editing, form]);
  const save = useMutation({
    mutationFn: (d: Input) => (editing && editing !== "new" ? patch<RouteSchedule>(`/routing/schedules/${editing.id}/`, d) : post<RouteSchedule>("/routing/schedules/", { ...d, route: routeId })),
    onSuccess: () => {
      invalidate(qc, "route-schedules", "route", "routes");
      message.success("Schedule saved");
      setEditing(null);
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/routing/schedules/${id}/`),
    onSuccess: () => { invalidate(qc, "route-schedules", "route"); message.success("Schedule deleted"); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const columns: ColumnsType<RouteSchedule> = [
    { title: "Direction", dataIndex: "direction", width: 170, render: (v: string) => <DirectionTag direction={v} /> },
    { title: "Label", dataIndex: "label" },
    { title: "Days", dataIndex: "weekdays", width: 160, render: (v: number[]) => fmtWeekdays(v) },
    { title: "Start", dataIndex: "start_time", width: 100, render: (v: string) => fmtTime(v) },
    { title: "Effective", key: "eff", width: 220, render: (_, r) => (r.effective_from || r.effective_to ? `${fmtDate(r.effective_from)} - ${fmtDate(r.effective_to)}` : "Always") },
    { title: "Status", dataIndex: "is_active", width: 100, render: (v: boolean) => <StatusBadge status={v ? "ACTIVE" : "INACTIVE"} /> },
    ...(canManage ? [{ title: "", key: "actions", width: 150, render: (_: unknown, r: RouteSchedule) => <Space><Button size="small" onClick={() => setEditing(r)}>Edit</Button><Button size="small" danger onClick={() => confirmAction({ title: "Delete this schedule?", content: "Future trips will no longer be generated from it. Existing trips are kept.", okText: "Delete", danger: true, onOk: () => remove.mutateAsync(r.id) })}>Delete</Button></Space> }] : []),
  ];
  return (
    <div className="sbp-stack">
      <div className="sbp-between">
        <Typography.Text type="secondary">Schedules define when trips are generated: one per direction, with weekdays and a start time.</Typography.Text>
        {canManage && <Button icon={<PlusOutlined />} onClick={() => setEditing("new")}>Add schedule</Button>}
      </div>
      <QueryState query={schedules} isEmpty={(d) => d.length === 0} emptyTitle="No schedules yet" emptyDescription="Without a schedule this route produces no daily trips.">
        {(rows) => <div className="sbp-surface"><Table rowKey="id" size="small" columns={columns} dataSource={rows} pagination={false} /></div>}
      </QueryState>
      <FormDrawer open={editing !== null} title={editing === "new" ? "Add schedule" : "Edit schedule"} onClose={() => setEditing(null)} onSubmit={form.handleSubmit((d) => save.mutate(d))} submitting={save.isPending} error={save.isError ? save.error : undefined}>
        <SelectField control={form.control} name="direction" label="Direction" required options={DIRECTION} allowClear={false} />
        <TextField control={form.control} name="label" label="Label" placeholder="Morning pickup" />
        <WeekdaysField control={form.control} name="weekdays" label="Weekdays" required />
        <Row gutter={16}>
          <Col span={8}><TimeField control={form.control} name="start_time" label="Start time" required /></Col>
          <Col span={8}><DateField control={form.control} name="effective_from" label="Effective from" /></Col>
          <Col span={8}><DateField control={form.control} name="effective_to" label="Effective to" /></Col>
        </Row>
        <SwitchField control={form.control} name="is_active" label="Active" />
      </FormDrawer>
    </div>
  );
}
