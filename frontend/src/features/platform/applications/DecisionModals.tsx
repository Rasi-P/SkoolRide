import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Button, Modal, Result, Typography, message } from "antd";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { SelectField, TextAreaField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { fmtMoney } from "@/lib/format";
import { platformApi, platformKeys } from "../api";
import { InvitationCard } from "../components/InvitationCard";
import type { SchoolApplication } from "../types";

interface Props {
  application: SchoolApplication;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

const approveSchema = z.object({ plan: z.string().nullable().optional(), notes: z.string().optional() });

export function ApproveModal({ application, open, onClose, onDone }: Props) {
  const navigate = useNavigate();
  const plans = useQuery({ queryKey: platformKeys.activePlans, queryFn: platformApi.activePlans, enabled: open });
  const planOptions = useMemo(
    () => (plans.data ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${fmtMoney(p.price_monthly, p.currency)}/month` })),
    [plans.data],
  );
  const defaultPlan = application.requested_plan && planOptions.some((o) => o.value === application.requested_plan) ? application.requested_plan : null;
  const form = useZodForm(approveSchema, { values: { plan: defaultPlan, notes: "" } });
  const approve = useMutation({
    mutationFn: (d: z.input<typeof approveSchema>) => platformApi.approveApplication(application.id, { plan: d.plan || undefined, notes: d.notes || "" }),
    onSuccess: () => {
      message.success("Application approved");
      onDone();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const close = () => {
    onClose();
    approve.reset();
    form.reset({ plan: defaultPlan, notes: "" });
  };
  const result = approve.data;

  return (
    <Modal open={open} onCancel={close} footer={null} maskClosable={false} title={result ? "School created" : `Approve ${application.school_name}`}>
      {result ? (
        <div className="sbp-stack">
          <Result
            status="success"
            style={{ padding: "8px 0" }}
            title="Application approved"
            subTitle={`${result.school.name} was created and an admin invitation was issued to ${result.invitation.email}.`}
          />
          <InvitationCard invitation={result.invitation} />
          <div className="sbp-between" style={{ justifyContent: "flex-end" }}>
            <Button onClick={close}>Done</Button>
            <Button
              type="primary"
              onClick={() => {
                close();
                navigate(`/platform/schools/${result.school.id}`);
              }}
            >
              Open school
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit((d) => approve.mutate(d))} noValidate>
          <Typography.Paragraph type="secondary">
            Approving creates the school, assigns the selected plan and emails an invitation to {application.contact_name} ({application.contact_email}) to set
            up the School Admin account.
          </Typography.Paragraph>
          {approve.isError && <Alert type="error" showIcon message={errorMessage(approve.error)} style={{ marginBottom: 12 }} />}
          <SelectField
            control={form.control}
            name="plan"
            label="Subscription plan"
            options={planOptions}
            loading={plans.isLoading}
            placeholder="Select a plan"
            help={application.requested_plan_name ? `Requested by the school: ${application.requested_plan_name}` : "Optional. Can be assigned later from the school page."}
          />
          <TextAreaField control={form.control} name="notes" label="Review notes" placeholder="Internal notes for the platform team" />
          <div className="sbp-between" style={{ justifyContent: "flex-end" }}>
            <Button onClick={close}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={approve.isPending}>
              Confirm approval
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

const rejectSchema = z.object({ notes: z.string().trim().min(3, "Please give a reason for the applicant") });

export function RejectModal({ application, open, onClose, onDone }: Props) {
  const form = useZodForm(rejectSchema, { defaultValues: { notes: "" } });
  const reject = useMutation({
    mutationFn: (d: z.input<typeof rejectSchema>) => platformApi.rejectApplication(application.id, { notes: d.notes }),
    onSuccess: () => {
      message.success("Application rejected");
      onDone();
      onClose();
      form.reset();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  return (
    <Modal open={open} onCancel={onClose} footer={null} title={`Reject ${application.school_name}`}>
      <form onSubmit={form.handleSubmit((d) => reject.mutate(d))} noValidate>
        {reject.isError && <Alert type="error" showIcon message={errorMessage(reject.error)} style={{ marginBottom: 12 }} />}
        <TextAreaField control={form.control} name="notes" label="Reason" required rows={4} placeholder="Explain why the application cannot be approved" />
        <div className="sbp-between" style={{ justifyContent: "flex-end" }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button danger type="primary" htmlType="submit" loading={reject.isPending}>
            Confirm rejection
          </Button>
        </div>
      </form>
    </Modal>
  );
}
