/** zod schemas for the parent forms (shared with tests). */
import { z } from "zod";

export const absenceSchema = z
  .object({
    student: z.string().min(1, "Select a child"),
    date_from: z.string().min(1, "Start date is required"),
    date_to: z.string().min(1, "End date is required"),
    direction: z.enum(["PICKUP", "DROPOFF", "BOTH"]),
    reason: z.string().trim().min(2, "Please give a short reason").max(255, "Keep the reason under 255 characters"),
  })
  .refine((d) => !d.date_from || !d.date_to || d.date_to >= d.date_from, { path: ["date_to"], message: "End date must be on or after start date." });
export type AbsenceFormValues = z.input<typeof absenceSchema>;

export const pickupChangeSchema = z
  .object({
    student: z.string().min(1, "Select a child"),
    change_type: z.enum(["STOP_CHANGE", "ROUTE_CHANGE", "TEMPORARY", "WITHDRAW", "OTHER"]),
    effective_date: z.string().min(1, "Effective date is required"),
    end_date: z.string().nullable().optional(),
    requested_pickup_stop: z.string().nullable().optional(),
    requested_dropoff_stop: z.string().nullable().optional(),
    details: z.string().trim().min(5, "Please describe the change (at least 5 characters)"),
  })
  .superRefine((d, ctx) => {
    if (d.change_type === "STOP_CHANGE" && !d.requested_pickup_stop) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["requested_pickup_stop"], message: "Select the requested pickup stop" });
    }
    if (d.change_type === "TEMPORARY" && !d.end_date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end_date"], message: "Give the last day of the temporary change" });
    }
    if (d.end_date && d.effective_date && d.end_date < d.effective_date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end_date"], message: "End date must be on or after the effective date" });
    }
  });
export type PickupChangeFormValues = z.input<typeof pickupChangeSchema>;

export const complaintSchema = z.object({
  student: z.string().nullable().optional(),
  category: z.enum(["DRIVER_BEHAVIOUR", "DELAY", "SAFETY", "VEHICLE", "BILLING", "APP", "OTHER"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]),
  subject: z.string().trim().min(3, "Give a short subject").max(160, "Keep the subject under 160 characters"),
  description: z.string().trim().min(10, "Describe what happened (at least 10 characters)"),
});
export type ComplaintFormValues = z.input<typeof complaintSchema>;

export const replySchema = z.object({ body: z.string().trim().min(1, "Write a reply first") });
export type ReplyFormValues = z.input<typeof replySchema>;

export const profileSchema = z.object({
  first_name: z.string().trim().min(1, "Required").max(80),
  last_name: z.string().trim().max(80).optional(),
  phone: z.string().trim().min(6, "Enter a valid phone number").max(32),
  alt_phone: z.string().trim().max(32).optional(),
  address: z.string().trim().optional(),
  preferred_language: z.string().optional(),
});
export type ProfileFormValues = z.input<typeof profileSchema>;

export const prefsSchema = z.object({
  push_enabled: z.boolean(),
  email_enabled: z.boolean(),
  sms_enabled: z.boolean(),
  muted_categories: z.array(z.string()),
  quiet_hours_start: z.string().nullable().optional(),
  quiet_hours_end: z.string().nullable().optional(),
});
export type PrefsFormValues = z.input<typeof prefsSchema>;
