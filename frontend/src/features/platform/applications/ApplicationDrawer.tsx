import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Drawer, Space, Typography, message } from "antd";
import { CheckOutlined, CloseOutlined, EyeOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { errorMessage } from "@/api/client";
import { KeyValue } from "@/components/ui/Misc";
import { QueryState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDateTime, fromNow } from "@/lib/format";
import { platformApi, platformKeys } from "../api";
import type { SchoolApplication } from "../types";
import { ApproveModal, RejectModal } from "./DecisionModals";

export function ApplicationDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const key = id ?? "";
  const query = useQuery({ queryKey: platformKeys.application(key), queryFn: () => platformApi.application(key), enabled: !!id });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [platformKeys.applications] });
    qc.invalidateQueries({ queryKey: platformKeys.application(key) });
    qc.invalidateQueries({ queryKey: platformKeys.overview });
    qc.invalidateQueries({ queryKey: [platformKeys.schools] });
  };
  const review = useMutation({
    mutationFn: () => platformApi.reviewApplication(key),
    onSuccess: () => {
      message.success("Marked as under review");
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const app = query.data;
  const decidable = !!app && (app.status === "PENDING" || app.status === "UNDER_REVIEW");

  return (
    <>
      <Drawer
        open={!!id}
        onClose={onClose}
        width={600}
        title={app ? app.school_name : "Application"}
        footer={
          decidable ? (
            <div className="sbp-between">
              <Space>
                {app.status === "PENDING" && (
                  <Button icon={<EyeOutlined />} onClick={() => review.mutate()} loading={review.isPending}>
                    Mark under review
                  </Button>
                )}
              </Space>
              <Space>
                <Button danger icon={<CloseOutlined />} onClick={() => setDecision("reject")}>
                  Reject
                </Button>
                <Button type="primary" icon={<CheckOutlined />} onClick={() => setDecision("approve")}>
                  Approve
                </Button>
              </Space>
            </div>
          ) : null
        }
      >
        {id && (
          <QueryState query={query}>
            {(a: SchoolApplication) => (
              <div className="sbp-stack">
                <div className="sbp-between">
                  <StatusBadge status={a.status} />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    <span className="sbp-mono">{a.tracking_code}</span> · submitted {fromNow(a.created_at)}
                  </Typography.Text>
                </div>
                {a.status === "APPROVED" && (
                  <Alert
                    type="success"
                    showIcon
                    message="Approved"
                    description={
                      a.school_id ? (
                        <>
                          The school was created. <Link to={`/platform/schools/${a.school_id}`}>Open school</Link>
                        </>
                      ) : (
                        "The school record for this application is no longer available."
                      )
                    }
                  />
                )}
                {a.status === "REJECTED" && <Alert type="error" showIcon message="Rejected" description={a.review_notes || "No reason recorded."} />}
                <Card size="small" title="Contact">
                  <KeyValue
                    items={[
                      { label: "Name", value: a.contact_name },
                      { label: "Designation", value: a.designation || "-" },
                      { label: "Email", value: <a href={`mailto:${a.contact_email}`}>{a.contact_email}</a> },
                      { label: "Phone", value: <a href={`tel:${a.contact_phone}`}>{a.contact_phone}</a> },
                    ]}
                  />
                </Card>
                <Card size="small" title="School">
                  <KeyValue
                    items={[
                      { label: "Address", value: a.address },
                      { label: "City", value: [a.city, a.state].filter(Boolean).join(", ") },
                      { label: "Country", value: `${a.country}${a.postal_code ? ` · ${a.postal_code}` : ""}` },
                      {
                        label: "Website",
                        value: a.website ? (
                          <a href={a.website} target="_blank" rel="noreferrer">
                            {a.website}
                          </a>
                        ) : (
                          "-"
                        ),
                      },
                      { label: "Students (est.)", value: a.estimated_students },
                      { label: "Vehicles (est.)", value: a.estimated_vehicles },
                      { label: "Requested plan", value: a.requested_plan_name || "No preference" },
                    ]}
                  />
                </Card>
                {a.message && (
                  <Card size="small" title="Message from applicant">
                    <Typography.Paragraph style={{ whiteSpace: "pre-wrap", margin: 0 }}>{a.message}</Typography.Paragraph>
                  </Card>
                )}
                {(a.reviewed_at || a.review_notes) && (
                  <Card size="small" title="Review">
                    <KeyValue
                      items={[
                        { label: "Reviewed by", value: a.reviewed_by_name || "-" },
                        { label: "Reviewed at", value: fmtDateTime(a.reviewed_at) },
                        { label: "Notes", value: a.review_notes || "-" },
                      ]}
                    />
                  </Card>
                )}
              </div>
            )}
          </QueryState>
        )}
      </Drawer>
      {app && <ApproveModal application={app} open={decision === "approve"} onClose={() => setDecision(null)} onDone={invalidate} />}
      {app && <RejectModal application={app} open={decision === "reject"} onClose={() => setDecision(null)} onDone={invalidate} />}
    </>
  );
}
