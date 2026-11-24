import { useState } from "react";
import { Alert, Button, Card, Result, Space, Steps, Table, Tag, Typography, Upload, message } from "antd";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { downloadFile, errorMessage } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { InlineError } from "@/components/ui/States";
import { invalidate, post } from "../api";
import type { ImportPreview, ImportResult, ImportRow } from "../types";

const STATUS_LABEL: Record<ImportRow["status"], { label: string; color: string }> = {
  ok: { label: "Ready", color: "green" },
  error: { label: "Error", color: "red" },
  duplicate_in_file: { label: "Duplicate in file", color: "orange" },
  duplicate_existing: { label: "Already exists", color: "default" },
};

export default function StudentImportPage() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const upload = (commit: boolean) => {
    const fd = new FormData();
    if (file) fd.append("file", file);
    return post<ImportPreview | ImportResult>(`/people/students/import/?commit=${commit}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
  };
  const validate = useMutation({ mutationFn: () => upload(false), onSuccess: (d) => setPreview(d as ImportPreview), onError: (e) => message.error(errorMessage(e)) });
  const commit = useMutation({
    mutationFn: () => upload(true),
    onSuccess: (d) => {
      setResult(d as ImportResult);
      invalidate(qc, "students", "parents", "dashboard", "onboarding");
      message.success("Import complete");
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<ImportRow> = [
    { title: "Line", dataIndex: "line", width: 70 },
    { title: "Status", dataIndex: "status", width: 150, render: (v: ImportRow["status"]) => <Tag color={STATUS_LABEL[v].color}>{STATUS_LABEL[v].label}</Tag> },
    { title: "Admission no", key: "adm", render: (_, r) => r.data.admission_number },
    { title: "Name", key: "name", render: (_, r) => `${r.data.first_name ?? ""} ${r.data.last_name ?? ""}`.trim() },
    { title: "Grade", key: "grade", width: 90, render: (_, r) => `${r.data.grade ?? ""}${r.data.section ? `-${r.data.section}` : ""}` },
    { title: "Parent", key: "parent", render: (_, r) => (r.data.parent_email ? <span>{`${r.data.parent_first_name ?? ""} ${r.data.parent_last_name ?? ""}`.trim()}<div className="sbp-muted" style={{ fontSize: 12 }}>{r.data.parent_email}</div></span> : <span className="sbp-muted">-</span>) },
    { title: "Problems", key: "errors", render: (_, r) => (Object.keys(r.errors).length ? <ul style={{ margin: 0, paddingLeft: 16, color: "var(--sbp-danger)", fontSize: 12 }}>{Object.entries(r.errors).map(([k, v]) => <li key={k}><strong>{k}</strong>: {v.join(" ")}</li>)}</ul> : r.status === "duplicate_existing" ? <span className="sbp-muted">Skipped: admission number already in the register</span> : r.status === "duplicate_in_file" ? <span className="sbp-muted">Skipped: repeated admission number in this file</span> : null) },
  ];

  const step = result ? 2 : preview ? 1 : 0;
  const resultCounts = result ? Object.entries(result).filter(([, v]) => typeof v === "number") as [string, number][] : [];

  return (
    <div>
      <PageHeader crumbs={[{ label: "Students", to: "/school/students" }, { label: "Import" }]} title="Import students" subtitle="Upload a CSV, review every row, then commit only the valid ones. Parents in the file are created and linked automatically." />
      <Steps current={step} size="small" style={{ marginBottom: 20 }} items={[{ title: "Upload CSV" }, { title: "Review rows" }, { title: "Done" }]} />
      {step === 0 && (
        <Card>
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Columns: admission_number, first_name, last_name, grade, section, gender, date_of_birth, pickup_address, parent_first_name, parent_last_name, parent_email, parent_phone, parent_relationship. Only admission number, first name and grade are required.
            </Typography.Paragraph>
            <Button icon={<DownloadOutlined />} onClick={() => downloadFile("/people/students/import-template/", "student_import_template.csv")}>Download template</Button>
            <Upload.Dragger maxCount={1} accept=".csv,text/csv" beforeUpload={(f) => { setFile(f); return false; }} onRemove={() => setFile(null)}>
              <p><UploadOutlined style={{ fontSize: 28, color: "var(--sbp-primary)" }} /></p>
              <p>Click or drag a CSV file here</p>
            </Upload.Dragger>
            <InlineError error={validate.isError ? validate.error : undefined} />
            <Button type="primary" disabled={!file} loading={validate.isPending} onClick={() => validate.mutate()}>Preview rows</Button>
          </Space>
        </Card>
      )}
      {step === 1 && preview && (
        <div className="sbp-stack">
          <Alert
            type={preview.summary.valid > 0 ? "info" : "warning"}
            showIcon
            message={`${preview.summary.total} rows read: ${preview.summary.valid} ready, ${preview.summary.errors} with errors, ${preview.summary.duplicates} duplicates`}
            description={preview.summary.valid > 0 ? "Rows with errors or duplicates are skipped; fix them in the file and re-upload if needed." : "Nothing can be imported yet. Fix the file and upload it again."}
          />
          <div className="sbp-surface"><Table rowKey={(r) => String(r.line)} size="small" columns={columns} dataSource={preview.rows} pagination={{ pageSize: 50 }} scroll={{ x: 900 }} /></div>
          <Space>
            <Button type="primary" disabled={preview.summary.valid === 0} loading={commit.isPending} onClick={() => commit.mutate()}>Import {preview.summary.valid} student{preview.summary.valid === 1 ? "" : "s"}</Button>
            <Button onClick={() => { setPreview(null); setFile(null); }}>Choose another file</Button>
          </Space>
          <InlineError error={commit.isError ? commit.error : undefined} />
        </div>
      )}
      {step === 2 && result && (
        <Result
          status="success"
          title="Import finished"
          subTitle={resultCounts.map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}
          extra={[
            <Link key="students" to="/school/students"><Button type="primary">Go to students</Button></Link>,
            <Button key="again" onClick={() => { setResult(null); setPreview(null); setFile(null); }}>Import another file</Button>,
          ]}
        />
      )}
    </div>
  );
}
