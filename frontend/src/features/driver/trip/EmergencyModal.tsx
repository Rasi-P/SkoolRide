import { useState } from "react";
import { Alert, Button, Input, Modal, Typography } from "antd";
import { AlertOutlined } from "@ant-design/icons";

interface Props {
  open: boolean;
  sending: boolean;
  hasLocation: boolean;
  onCancel: () => void;
  onConfirm: (description: string) => void;
}

/** Two-step emergency confirmation so a stray tap cannot trigger an alert. */
export function EmergencyModal({ open, sending, hasLocation, onCancel, onConfirm }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [description, setDescription] = useState("");
  const close = () => {
    if (sending) return;
    setStep(1);
    setDescription("");
    onCancel();
  };
  return (
    <Modal open={open} onCancel={close} footer={null} centered closable={!sending} title={step === 1 ? "Send emergency alert?" : "Confirm emergency alert"} destroyOnHidden afterClose={() => setStep(1)}>
      {step === 1 ? (
        <div className="sbp-stack">
          <Typography.Paragraph style={{ margin: 0 }}>
            This immediately alerts the transport office and school administrators{hasLocation ? " with your current location" : ""}. Use it for accidents, medical emergencies, fire or threats to students.
          </Typography.Paragraph>
          <div>
            <label htmlFor="emergency-description" style={{ display: "block", fontWeight: 500, marginBottom: 4 }}>What is happening? (optional)</label>
            <Input.TextArea id="emergency-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Collision at Varthur Kodi, two students injured" />
          </div>
          <Button danger type="primary" block className="sbp-touch-btn" icon={<AlertOutlined />} onClick={() => setStep(2)}>
            Continue
          </Button>
          <Button block className="sbp-touch-btn" onClick={close}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="sbp-stack">
          <Alert type="error" showIcon message="Are you sure?" description="An emergency incident will be created and staff will be notified right away. This cannot be undone." />
          <Button danger type="primary" block className="sbp-touch-btn" icon={<AlertOutlined />} loading={sending} onClick={() => onConfirm(description.trim())}>
            Yes, send emergency alert
          </Button>
          <Button block className="sbp-touch-btn" disabled={sending} onClick={() => setStep(1)}>
            Back
          </Button>
        </div>
      )}
    </Modal>
  );
}
