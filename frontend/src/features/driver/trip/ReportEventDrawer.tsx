import { Button, Drawer, Segmented } from "antd";
import { Controller } from "react-hook-form";
import { z } from "zod";
import { NumberField, TextAreaField, useZodForm } from "@/components/forms/fields";
import type { TripEventInput } from "../types";

const schema = z
  .object({
    event_type: z.enum(["DELAY", "BREAKDOWN", "NOTE"]),
    minutes: z.number().int().min(0).max(600).nullable().optional(),
    description: z.string().trim().min(3, "Add a short description"),
  })
  .refine((d) => d.event_type !== "DELAY" || (d.minutes !== null && d.minutes !== undefined), { path: ["minutes"], message: "Estimate the delay in minutes" });

interface Props {
  open: boolean;
  sending: boolean;
  onClose: () => void;
  onSubmit: (body: TripEventInput) => void;
}

const OPTIONS = [
  { value: "DELAY", label: "Delay" },
  { value: "BREAKDOWN", label: "Breakdown" },
  { value: "NOTE", label: "Note" },
];

/** Bottom sheet for reporting a delay (notifies parents), a breakdown or a free-text note. */
export function ReportEventDrawer({ open, sending, onClose, onSubmit }: Props) {
  const form = useZodForm(schema, { defaultValues: { event_type: "DELAY", minutes: 10, description: "" } });
  const type = form.watch("event_type");
  return (
    <Drawer title="Report delay, breakdown or note" placement="bottom" height="auto" open={open} onClose={onClose} destroyOnHidden afterOpenChange={(o) => !o && form.reset()}>
      <form
        noValidate
        onSubmit={form.handleSubmit((d) => onSubmit({ event_type: d.event_type, description: d.description.trim(), ...(d.event_type === "DELAY" && d.minutes != null ? { minutes: d.minutes } : {}) }))}
        aria-label="Report trip event"
      >
        <Controller
          control={form.control}
          name="event_type"
          render={({ field }) => <Segmented block size="large" options={OPTIONS} value={field.value} onChange={(v) => field.onChange(v)} style={{ marginBottom: 16 }} aria-label="Event type" />}
        />
        {type === "DELAY" && <NumberField control={form.control} name="minutes" label="Estimated delay (minutes)" required min={0} max={600} step={5} help="Parents of students still waiting are notified." />}
        <TextAreaField control={form.control} name="description" label={type === "NOTE" ? "Note" : "What happened?"} required rows={3} placeholder={type === "DELAY" ? "e.g. Heavy traffic on Whitefield Main Road" : type === "BREAKDOWN" ? "e.g. Engine overheating, pulled over safely" : "Anything the office should know"} />
        <div className="sbp-stack">
          <Button type="primary" htmlType="submit" block className="sbp-touch-btn" loading={sending}>
            {type === "DELAY" ? "Report delay" : type === "BREAKDOWN" ? "Report breakdown" : "Add note"}
          </Button>
          <Button block className="sbp-touch-btn" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
