import { Card, Typography } from "antd";
import { KeyValue } from "@/components/ui/Misc";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDateTime, titleCase } from "@/lib/format";
import { fullName } from "../lib";
import type { Invitation } from "../types";
import { CopyLink } from "./CopyLink";

/** Shows an issued invitation, including the accept link when the backend exposes it (demo mode). */
export function InvitationCard({ invitation, title = "Admin invitation" }: { invitation: Invitation; title?: string }) {
  return (
    <Card size="small" title={title}>
      <KeyValue
        items={[
          { label: "Invitee", value: `${fullName(invitation.first_name, invitation.last_name, "")} <${invitation.email}>`.trim() },
          { label: "Role", value: titleCase(invitation.role) },
          { label: "Status", value: <StatusBadge status={invitation.status} /> },
          { label: "Expires", value: fmtDateTime(invitation.expires_at) },
        ]}
      />
      <div style={{ marginTop: 12 }}>
        {invitation.accept_url ? (
          <>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
              Demo mode: the invitation email was sent, and you can also share this link directly.
            </Typography.Text>
            <CopyLink url={invitation.accept_url} />
          </>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            An invitation email was sent to {invitation.email}. Accept links are only displayed in demo mode.
          </Typography.Text>
        )}
      </div>
    </Card>
  );
}
