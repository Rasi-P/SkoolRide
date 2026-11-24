import { useState } from "react";
import { Input, Modal, Typography } from "antd";

interface Props {
  open: boolean;
  title: string;
  label?: string;
  description?: string;
  okText?: string;
  danger?: boolean;
  required?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}

/** Modal prompting for a free-text reason (cancellations, reversals, withdrawals). */
export function ReasonModal({ open, title, label = "Reason", description, okText = "Confirm", danger, required = true, loading, onCancel, onSubmit }: Props) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const invalid = required && reason.trim().length === 0;
  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      okButtonProps={{ danger, disabled: invalid }}
      confirmLoading={loading}
      onCancel={onCancel}
      afterClose={() => {
        setReason("");
        setTouched(false);
      }}
      onOk={() => {
        setTouched(true);
        if (!invalid) onSubmit(reason.trim());
      }}
      centered
      destroyOnHidden
    >
      {description && <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>}
      <label htmlFor="reason-input" style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>
        {label}
      </label>
      <Input.TextArea id="reason-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={touched && invalid} status={touched && invalid ? "error" : undefined} autoFocus />
      {touched && invalid && <Typography.Text type="danger" style={{ fontSize: 12 }}>Required</Typography.Text>}
    </Modal>
  );
}
