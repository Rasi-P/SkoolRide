import { Button, Card } from "antd";
import { MailOutlined, PhoneOutlined } from "@ant-design/icons";
import type { DriverSchool } from "../types";

/** Big tel:/mailto: buttons: one tap to reach the transport office or the emergency contact. */
export function ContactSchool({ school, compact }: { school: DriverSchool; compact?: boolean }) {
  const buttons = (
    <div className="sbp-stack">
      {school.transport_office_phone && (
        <Button className="sbp-touch-btn" block icon={<PhoneOutlined />} href={`tel:${school.transport_office_phone}`}>
          Transport office · {school.transport_office_phone}
        </Button>
      )}
      {school.emergency_contact_phone && (
        <Button className="sbp-touch-btn" block danger icon={<PhoneOutlined />} href={`tel:${school.emergency_contact_phone}`}>
          Emergency contact · {school.emergency_contact_phone}
        </Button>
      )}
      {!compact && school.transport_office_email && (
        <Button className="sbp-touch-btn" block icon={<MailOutlined />} href={`mailto:${school.transport_office_email}`}>
          {school.transport_office_email}
        </Button>
      )}
      {!school.transport_office_phone && !school.emergency_contact_phone && <span className="sbp-muted">The school has not added contact numbers yet.</span>}
    </div>
  );
  if (compact) return buttons;
  return (
    <Card size="small" title="Contact school">
      {buttons}
    </Card>
  );
}
