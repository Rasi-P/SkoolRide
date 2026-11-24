import { Alert, Button, Modal, Typography } from "antd";
import { MailOutlined, PhoneOutlined } from "@ant-design/icons";
import { QueryState } from "@/components/ui/States";
import { useSchoolInfo } from "../context";
import { telHref } from "../lib";
import type { SchoolInfo } from "../types";

export function ContactSchoolBody({ school }: { school: SchoolInfo }) {
  return (
    <div className="sbp-stack">
      {school.parent_help_text && <Alert type="info" showIcon message={school.parent_help_text} />}
      {school.transport_office_phone && (
        <Button size="large" block className="sbp-touch-btn" type="primary" icon={<PhoneOutlined />} href={telHref(school.transport_office_phone)}>
          Transport office · {school.transport_office_phone}
        </Button>
      )}
      {school.emergency_contact_phone && (
        <Button size="large" block className="sbp-touch-btn" danger icon={<PhoneOutlined />} href={telHref(school.emergency_contact_phone)}>
          Emergency · {school.emergency_contact_phone}
        </Button>
      )}
      {school.transport_office_email && (
        <Button size="large" block className="sbp-touch-btn" icon={<MailOutlined />} href={`mailto:${school.transport_office_email}`}>
          {school.transport_office_email}
        </Button>
      )}
      {school.address && (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {school.name} · {school.address}
        </Typography.Text>
      )}
    </div>
  );
}

export function ContactSchoolCard() {
  const school = useSchoolInfo();
  return (
    <QueryState query={school} rows={3}>
      {(s) => <ContactSchoolBody school={s} />}
    </QueryState>
  );
}

export function ContactSchoolModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} title="Contact the school" centered>
      <ContactSchoolCard />
    </Modal>
  );
}
