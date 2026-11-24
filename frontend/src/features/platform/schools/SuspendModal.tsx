import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Modal, message } from "antd";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { TextAreaField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { platformApi } from "../api";
import type { SchoolDetail } from "../types";

const schema = z.object({ reason: z.string().trim().min(3, "Please state the reason for the suspension") });

export function SuspendModal({ school, open, onClose, onDone }: { school: SchoolDetail; open: boolean; onClose: () => void; onDone: () => void }) {
  const form = useZodForm(schema, { defaultValues: { reason: "" } });
  const suspend = useMutation({
    mutationFn: (d: z.input<typeof schema>) => platformApi.suspendSchool(school.id, d.reason),
    onSuccess: () => {
      message.success(`${school.name} suspended`);
      onDone();
      onClose();
      form.reset();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  return (
    <Modal open={open} onCancel={onClose} footer={null} title={`Suspend ${school.name}`}>
      <Alert
        type="warning"
        showIcon
        message="All users of this school lose access immediately and parents stop receiving bus alerts until it is reactivated."
        style={{ marginBottom: 16 }}
      />
      <form onSubmit={form.handleSubmit((d) => suspend.mutate(d))} noValidate>
        {suspend.isError && <Alert type="error" showIcon message={errorMessage(suspend.error)} style={{ marginBottom: 12 }} />}
        <TextAreaField control={form.control} name="reason" label="Reason" required rows={3} placeholder="e.g. Subscription payment overdue by 45 days" />
        <div className="sbp-between" style={{ justifyContent: "flex-end" }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button danger type="primary" htmlType="submit" loading={suspend.isPending}>
            Suspend school
          </Button>
        </div>
      </form>
    </Modal>
  );
}
