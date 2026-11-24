import { useState } from "react";
import { Button, Card, Input, Steps, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ErrorState } from "@/components/ui/States";
import { fmtDateTime } from "@/lib/format";

interface Status { tracking_code: string; school_name: string; status: string; created_at: string; reviewed_at: string | null }

export default function ApplicationStatusPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(code ?? "");
  const q = useQuery({ queryKey: ["application-status", code], queryFn: () => api.get<Status>(`/public/applications/${code}/`).then((r) => r.data), enabled: !!code });
  const step = q.data ? { PENDING: 0, UNDER_REVIEW: 1, APPROVED: 2, REJECTED: 2 }[q.data.status] ?? 0 : 0;
  return (
    <div className="sbp-page" style={{ maxWidth: 640 }}>
      <Typography.Title level={2}>Application status</Typography.Title>
      <Card style={{ marginBottom: 16 }}>
        <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) navigate(`/register/status/${input.trim().toUpperCase()}`); }}>
          <label htmlFor="code" className="sbp-kicker">Tracking code</label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <Input id="code" value={input} onChange={(e) => setInput(e.target.value)} placeholder="APP-XXXXXXXX" />
            <Button type="primary" htmlType="submit">Check</Button>
          </div>
        </form>
      </Card>
      {code && q.isError && <ErrorState error={q.error} title="Application not found" />}
      {q.data && (
        <Card title={q.data.school_name} extra={<StatusBadge status={q.data.status} />}>
          <Steps current={step} status={q.data.status === "REJECTED" ? "error" : step === 2 ? "finish" : "process"} items={[{ title: "Submitted", description: fmtDateTime(q.data.created_at) }, { title: "Under review" }, { title: q.data.status === "REJECTED" ? "Rejected" : "Approved", description: q.data.reviewed_at ? fmtDateTime(q.data.reviewed_at) : undefined }]} />
          <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
            {q.data.status === "APPROVED" ? "Your school has been approved. The contact person has received an email invitation to set up the School Admin account." : q.data.status === "REJECTED" ? "This application was not approved. Contact support for details." : "We will email you once the review is complete."}
          </Typography.Paragraph>
        </Card>
      )}
    </div>
  );
}
