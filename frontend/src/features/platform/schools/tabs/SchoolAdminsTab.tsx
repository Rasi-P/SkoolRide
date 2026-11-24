import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Col, Row, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { SelectField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { ErrorState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate, fmtDateTime, fromNow, titleCase } from "@/lib/format";
import { platformApi, platformKeys } from "../../api";
import { CopyButton } from "../../components/CopyLink";
import { InvitationCard } from "../../components/InvitationCard";
import { ADMIN_ROLE_OPTIONS } from "../../constants";
import { fullName } from "../../lib";
import type { AdminRole, Invitation, SchoolDetail, SchoolMember } from "../../types";

const schema = z.object({
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().optional(),
  email: z.string().email("Enter a valid email"),
  role: z.enum(["SCHOOL_ADMIN", "TRANSPORT_MANAGER"], { invalid_type_error: "Select a role", required_error: "Select a role" }),
});
type Values = z.input<typeof schema>;
const DEFAULTS: Values = { first_name: "", last_name: "", email: "", role: "SCHOOL_ADMIN" };

export function SchoolAdminsTab({ school }: { school: SchoolDetail }) {
  const qc = useQueryClient();
  const members = useQuery({ queryKey: platformKeys.schoolMembers(school.id), queryFn: () => platformApi.schoolMembers(school.id) });
  const invitations = useQuery({ queryKey: platformKeys.schoolInvitations(school.id), queryFn: () => platformApi.schoolInvitations(school.id) });
  const [issued, setIssued] = useState<Invitation | null>(null);
  const form = useZodForm(schema, { defaultValues: DEFAULTS });
  const invite = useMutation({
    mutationFn: (d: Values) => platformApi.inviteAdmin(school.id, { email: d.email, first_name: d.first_name, last_name: d.last_name || "", role: d.role as AdminRole }),
    onSuccess: (inv) => {
      message.success(`Invitation sent to ${inv.email}`);
      setIssued(inv);
      form.reset(DEFAULTS);
      qc.invalidateQueries({ queryKey: platformKeys.schoolInvitations(school.id) });
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });

  const memberColumns: ColumnsType<SchoolMember> = [
    {
      title: "Member",
      dataIndex: "full_name",
      render: (v: string, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v || "-"}</div>
          <div className="sbp-muted" style={{ fontSize: 12 }}>{r.email}</div>
        </div>
      ),
    },
    { title: "Role", dataIndex: "role", render: (v: string, r) => (<>{titleCase(v)}{r.is_primary && <Tag style={{ marginInlineStart: 6 }}>Primary</Tag>}</>) },
    { title: "Phone", dataIndex: "phone", render: (v: string) => v || "-" },
    { title: "Access", key: "access", render: (_: unknown, r) => <StatusBadge status={r.is_active && r.user_is_active ? "ACTIVE" : "INACTIVE"} label={r.is_active && r.user_is_active ? "Active" : r.user_is_active ? "Membership inactive" : "Account inactive"} /> },
    { title: "Last login", dataIndex: "last_login", render: (v: string | null) => (v ? fromNow(v) : "Never") },
    { title: "Since", dataIndex: "created_at", render: (v: string) => fmtDate(v) },
  ];
  const invitationColumns: ColumnsType<Invitation> = [
    {
      title: "Invitee",
      dataIndex: "email",
      render: (v: string, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{fullName(r.first_name, r.last_name, v)}</div>
          <div className="sbp-muted" style={{ fontSize: 12 }}>{v}</div>
        </div>
      ),
    },
    { title: "Role", dataIndex: "role", render: (v: string) => titleCase(v) },
    { title: "Status", dataIndex: "status", render: (v: string) => <StatusBadge status={v} /> },
    { title: "Expires", dataIndex: "expires_at", render: (v: string, r) => (r.status === "ACCEPTED" ? `Accepted ${fmtDateTime(r.accepted_at)}` : fmtDateTime(v)) },
    { title: "Invited by", dataIndex: "invited_by_name", render: (v: string) => v || "-" },
    {
      title: "Link",
      key: "link",
      width: 120,
      render: (_: unknown, r) =>
        r.accept_url && r.status === "PENDING" ? (
          <CopyButton text={r.accept_url} label={`Copy invitation link for ${r.email}`}>
            Copy link
          </CopyButton>
        ) : (
          <span className="sbp-muted">-</span>
        ),
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={16}>
        <div className="sbp-stack" style={{ gap: 16 }}>
          <Card size="small" title="Members" styles={{ body: { padding: 0 } }}>
            {members.isError ? (
              <ErrorState error={members.error} onRetry={() => members.refetch()} />
            ) : (
              <Table<SchoolMember>
                rowKey="id"
                size="small"
                columns={memberColumns}
                dataSource={members.data ?? []}
                loading={members.isLoading}
                pagination={false}
                scroll={{ x: 700 }}
                locale={{ emptyText: "No staff members yet" }}
              />
            )}
          </Card>
          <Card size="small" title="Invitations" styles={{ body: { padding: 0 } }}>
            {invitations.isError ? (
              <ErrorState error={invitations.error} onRetry={() => invitations.refetch()} />
            ) : (
              <Table<Invitation>
                rowKey="id"
                size="small"
                columns={invitationColumns}
                dataSource={invitations.data ?? []}
                loading={invitations.isLoading}
                pagination={false}
                scroll={{ x: 700 }}
                locale={{ emptyText: "No invitations issued" }}
              />
            )}
          </Card>
        </div>
      </Col>
      <Col xs={24} lg={8}>
        <div className="sbp-stack" style={{ gap: 16 }}>
          <Card size="small" title="Invite an admin">
            <form onSubmit={form.handleSubmit((d) => invite.mutate(d))} noValidate>
              {invite.isError && <Alert type="error" showIcon message={errorMessage(invite.error)} style={{ marginBottom: 12 }} />}
              <TextField control={form.control} name="first_name" label="First name" required />
              <TextField control={form.control} name="last_name" label="Last name" />
              <TextField control={form.control} name="email" label="Email" type="email" required autoComplete="off" />
              <SelectField control={form.control} name="role" label="Role" options={ADMIN_ROLE_OPTIONS} allowClear={false} required />
              <Button type="primary" htmlType="submit" loading={invite.isPending} block>
                Send invitation
              </Button>
            </form>
          </Card>
          {issued && <InvitationCard invitation={issued} title="Invitation issued" />}
        </div>
      </Col>
    </Row>
  );
}
