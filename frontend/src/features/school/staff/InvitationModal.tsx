import { Modal, Typography } from "antd";
import { fmtDateTime } from "@/lib/format";
import type { Invitation } from "../types";

/** Shows the outcome of an invitation (and the accept link in demo mode). */
export function InvitationModal({ invitation, onClose }: { invitation: Invitation | null; onClose: () => void }) {
  return (
    <Modal open={!!invitation} onCancel={onClose} onOk={onClose} title="Invitation sent" cancelButtonProps={{ style: { display: "none" } }} centered>
      {invitation && (
        <div className="sbp-stack">
          <Typography.Text>An invitation email was sent to <strong>{invitation.email}</strong>. It expires {fmtDateTime(invitation.expires_at)}.</Typography.Text>
          {invitation.accept_url && (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Demo mode: the accept link is shown here because outgoing email is disabled in this environment.<br />
              <Typography.Text code copyable style={{ wordBreak: "break-all" }}>{invitation.accept_url}</Typography.Text>
            </Typography.Paragraph>
          )}
        </div>
      )}
    </Modal>
  );
}
