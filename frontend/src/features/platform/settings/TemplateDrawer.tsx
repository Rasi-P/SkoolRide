import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Drawer, Tag, Typography, message } from "antd";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { SelectField, SwitchField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { platformApi } from "../api";
import { NOTIFICATION_CATEGORIES, TEMPLATE_CHANNEL_OPTIONS, TEMPLATE_PLACEHOLDERS } from "../constants";
import type { NotificationTemplate, TemplateChannel, TemplatePayload } from "../types";

const schema = z.object({
  category: z.string({ invalid_type_error: "Select a category" }).min(1, "Select a category"),
  channel: z.enum(["IN_APP", "PUSH", "EMAIL", "SMS"], { invalid_type_error: "Select a channel", required_error: "Select a channel" }),
  subject: z.string().trim().min(1, "Subject is required").max(160, "Max 160 characters"),
  body: z.string().trim().min(1, "Body is required"),
  is_active: z.boolean().optional(),
});
type Values = z.input<typeof schema>;

const toValues = (t: NotificationTemplate | null): Values =>
  t ? { category: t.category, channel: t.channel, subject: t.subject, body: t.body, is_active: t.is_active } : { category: "", channel: "PUSH", subject: "", body: "", is_active: true };

export function TemplateDrawer({ template, open, onClose, onSaved }: { template: NotificationTemplate | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const form = useZodForm(schema, { values: toValues(template) });
  const save = useMutation({
    mutationFn: (d: Values) => {
      const payload: TemplatePayload = { category: d.category, channel: d.channel as TemplateChannel, subject: d.subject.trim(), body: d.body.trim(), is_active: d.is_active ?? true };
      return template ? platformApi.updateTemplate(template.id, payload) : platformApi.createTemplate(payload);
    },
    onSuccess: () => {
      message.success(template ? "Template updated" : "Template created");
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
    <Drawer open={open} onClose={close} width={560} title={template ? "Edit template" : "New template"}>
      <form onSubmit={form.handleSubmit((d) => save.mutate(d))} noValidate>
        {save.isError && <Alert type="error" showIcon message={errorMessage(save.error)} style={{ marginBottom: 16 }} />}
        <SelectField control={form.control} name="category" label="Category" options={NOTIFICATION_CATEGORIES} required allowClear={false} placeholder="Select a category" />
        <SelectField control={form.control} name="channel" label="Channel" options={TEMPLATE_CHANNEL_OPTIONS} required allowClear={false} help="One template per category and channel." />
        <TextField control={form.control} name="subject" label="Subject / title" required placeholder="e.g. Bus arriving soon" />
        <TextAreaField control={form.control} name="body" label="Body" required rows={5} placeholder="e.g. Your child's bus is {minutes} minutes from {stop_name}." />
        <div style={{ marginTop: -8, marginBottom: 16 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
            Placeholders are replaced when the notification is sent. Unknown placeholders are left as-is.
          </Typography.Text>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {TEMPLATE_PLACEHOLDERS.map((p) => (
              <Tag key={p} style={{ marginInlineEnd: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{`{${p}}`}</Tag>
            ))}
          </div>
        </div>
        <SwitchField control={form.control} name="is_active" label="Active" help="Inactive templates fall back to the built-in wording." />
        <div className="sbp-between" style={{ justifyContent: "flex-end" }}>
          <Button onClick={close}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            {template ? "Save changes" : "Create template"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
