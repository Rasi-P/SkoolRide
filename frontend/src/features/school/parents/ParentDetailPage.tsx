import { useState } from "react";
import { Button, Card, Col, Dropdown, List, Row, Space, Table, Tag } from "antd";
import { DownOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { KeyValue, NameAvatar } from "@/components/ui/Misc";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDateTime, fmtMoney, titleCase } from "@/lib/format";
import type { Notification } from "@/types";
import { get } from "../api";
import { InvitationModal } from "../staff/InvitationModal";
import type { Parent } from "../types";
import { ParentFormDrawer } from "./ParentForm";
import { useParentActions } from "./ParentsPage";

const DELIVERY_COLOUR: Record<string, string> = { SENT: "green", PENDING: "gold", FAILED: "red", SKIPPED: "default" };

export default function ParentDetailPage() {
  const { id = "" } = useParams();
  const { hasPerm } = useAuth();
  const canManage = hasPerm("parents.manage");
  const parent = useQuery({ queryKey: ["parent", id], queryFn: () => get<Parent>(`/people/parents/${id}/`), enabled: !!id });
  const comms = useQuery({ queryKey: ["parent-comms", id], queryFn: () => get<Notification[]>(`/people/parents/${id}/communications/`), enabled: !!id });
  const [editing, setEditing] = useState(false);
  const actions = useParentActions();
  type Child = Parent["children"][number];
  const childColumns: ColumnsType<Child> = [
    { title: "Student", dataIndex: "name", render: (v: string, r) => <Link to={`/school/students/${r.student_id}`}>{v}</Link> },
    { title: "Admission no", dataIndex: "admission_number", width: 140 },
    { title: "Class", dataIndex: "class_label", width: 90 },
    { title: "Relationship", dataIndex: "relationship", width: 130, render: (v: string) => titleCase(v) },
    { title: "Primary", dataIndex: "is_primary", width: 90, render: (v: boolean) => (v ? <Tag color="blue">Primary</Tag> : "-") },
    { title: "Transport", dataIndex: "transport_status", width: 150, render: (v: string) => <StatusBadge status={v} label={v === "ACTIVE" ? "Using transport" : titleCase(v)} /> },
  ];
  return (
    <QueryState query={parent}>
      {(p) => (
        <div>
          <PageHeader
            crumbs={[{ label: "Parents", to: "/school/parents" }, { label: p.full_name }]}
            title={<span className="sbp-row"><NameAvatar name={p.full_name} /> {p.full_name} <StatusBadge status={p.status} /></span>}
            subtitle={`${p.email} · ${p.phone}`}
            extra={canManage && (
              <>
                <Dropdown menu={{ items: actions.items(p), onClick: ({ key }) => actions.run(key, p) }} disabled={actions.items(p).length === 0}>
                  <Button loading={actions.pending}>Account <DownOutlined /></Button>
                </Dropdown>
                <Button type="primary" onClick={() => setEditing(true)}>Edit</Button>
              </>
            )}
          />
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={10}>
              <Card size="small" title="Profile">
                <KeyValue items={[
                  { label: "Alternate phone", value: p.alt_phone || "-" },
                  { label: "Address", value: p.address || "-" },
                  { label: "Language", value: p.preferred_language || "-" },
                  { label: "Verified", value: <Space size={4}>{p.email_verified ? <Tag color="green">Email</Tag> : <Tag>Email unverified</Tag>}{p.phone_verified ? <Tag color="green">Phone</Tag> : <Tag>Phone unverified</Tag>}</Space> },
                  { label: "App account", value: !p.has_account ? "Not invited" : p.account_active ? "Active" : "Suspended" },
                  { label: "Last login", value: fmtDateTime(p.last_login) },
                  { label: "Outstanding fees", value: <span style={{ fontWeight: 600 }}>{fmtMoney(p.fee_summary.outstanding)} <span className="sbp-muted">({p.fee_summary.invoice_count} invoices)</span></span> },
                  { label: "Notes", value: p.notes || "-" },
                ]} />
              </Card>
            </Col>
            <Col xs={24} lg={14}>
              <Card size="small" title="Children">
                <Table rowKey="link_id" size="small" columns={childColumns} dataSource={p.children} pagination={false} locale={{ emptyText: "No children linked. Link this parent from a student's page." }} />
              </Card>
            </Col>
            <Col xs={24}>
              <Card size="small" title="Communications" extra={<span className="sbp-muted">Last 50 notifications sent to this parent</span>}>
                <QueryState query={comms} rows={3} isEmpty={(d) => d.length === 0} emptyTitle="No notifications sent yet" emptyDescription={p.has_account ? "Trip, fee and announcement alerts will appear here." : "The parent has no app account yet, so nothing has been delivered."}>
                  {(rows) => (
                    <List
                      size="small"
                      dataSource={rows}
                      pagination={rows.length > 10 ? { pageSize: 10, size: "small" } : false}
                      renderItem={(n) => (
                        <List.Item>
                          <List.Item.Meta
                            title={<span><Tag>{titleCase(n.category)}</Tag> {n.title} <span className="sbp-muted" style={{ fontWeight: 400, fontSize: 12 }}>· {fmtDateTime(n.created_at)}</span></span>}
                            description={<span>{n.body}<div style={{ marginTop: 4 }}>{(n.deliveries ?? []).map((d) => <Tag key={d.channel} color={DELIVERY_COLOUR[d.status] ?? "default"} style={{ fontSize: 11 }}>{titleCase(d.channel)}: {titleCase(d.status).toLowerCase()}</Tag>)}{n.is_read && <Tag style={{ fontSize: 11 }}>Read</Tag>}</div></span>}
                          />
                        </List.Item>
                      )}
                    />
                  )}
                </QueryState>
              </Card>
            </Col>
          </Row>
          <ParentFormDrawer open={editing} parent={p} onClose={() => setEditing(false)} />
          <InvitationModal invitation={actions.invitation} onClose={() => actions.setInvitation(null)} />
        </div>
      )}
    </QueryState>
  );
}
