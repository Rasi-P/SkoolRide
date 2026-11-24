import { Alert, Card, Typography } from "antd";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate } from "@/lib/format";
import type { DriverVehicle } from "../types";

export function VehicleCard({ vehicle }: { vehicle: DriverVehicle | null }) {
  if (!vehicle) {
    return (
      <Card size="small" title="Assigned vehicle">
        <Typography.Text type="secondary">No vehicle is assigned to you. Contact the transport office before your next trip.</Typography.Text>
      </Card>
    );
  }
  const expired = vehicle.document_alerts.filter((a) => a.level === "expired");
  const expiring = vehicle.document_alerts.filter((a) => a.level === "expiring");
  return (
    <Card size="small" title="Assigned vehicle" extra={<StatusBadge status={vehicle.status} />}>
      <div className="sbp-between">
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{vehicle.display_name}</div>
          <Typography.Text type="secondary">
            {vehicle.registration_number}
            {vehicle.fleet_number ? ` · Fleet #${vehicle.fleet_number}` : ""} · {vehicle.make} {vehicle.model}
          </Typography.Text>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="sbp-kicker">Capacity</div>
          <div style={{ fontWeight: 700, fontSize: 20 }} className="sbp-mono">{vehicle.capacity}</div>
        </div>
      </div>
      {vehicle.attendant && (
        <Typography.Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 13 }}>
          Attendant: {vehicle.attendant.name}{vehicle.attendant.phone && <> · <a href={`tel:${vehicle.attendant.phone}`}>{vehicle.attendant.phone}</a></>}
        </Typography.Text>
      )}
      {vehicle.driver && (
        <Typography.Text type="secondary" style={{ display: "block", marginTop: 4, fontSize: 13 }}>
          Driver: {vehicle.driver.name}{vehicle.driver.phone && <> · <a href={`tel:${vehicle.driver.phone}`}>{vehicle.driver.phone}</a></>}
        </Typography.Text>
      )}
      {expired.length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          message="Vehicle documents expired"
          description={<ul style={{ margin: 0, paddingInlineStart: 18 }}>{expired.map((a) => <li key={a.document}>{a.document} expired on {fmtDate(a.expires_on)}</li>)}</ul>}
        />
      )}
      {expiring.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message="Documents expiring soon"
          description={<ul style={{ margin: 0, paddingInlineStart: 18 }}>{expiring.map((a) => <li key={a.document}>{a.document} expires on {fmtDate(a.expires_on)}</li>)}</ul>}
        />
      )}
    </Card>
  );
}
