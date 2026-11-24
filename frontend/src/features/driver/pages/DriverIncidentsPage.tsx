import { useEffect, useState } from "react";
import { Button, Drawer, Tag, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { QueryState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDateTime, titleCase } from "@/lib/format";
import { driverApi, driverKeys } from "../api";
import { IncidentForm } from "../components/IncidentForm";
import { useDriverHome } from "../hooks";
import type { DriverIncident } from "../types";

const SEVERITY_COLOUR: Record<string, string> = { LOW: "default", MEDIUM: "gold", HIGH: "orange", CRITICAL: "red" };

function IncidentRow({ incident }: { incident: DriverIncident }) {
  return (
    <article className="sbp-list-card" aria-label={incident.title} style={{ alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sbp-row" style={{ flexWrap: "wrap", marginBottom: 4 }}>
          <StatusBadge status={incident.status} />
          <Tag color={SEVERITY_COLOUR[incident.severity]} style={{ marginInlineEnd: 0 }}>{titleCase(incident.severity)}</Tag>
          <Tag style={{ marginInlineEnd: 0 }}>{titleCase(incident.category)}</Tag>
          {incident.is_emergency && <Tag color="red" style={{ marginInlineEnd: 0, fontWeight: 600 }}>EMERGENCY</Tag>}
        </div>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{incident.title}</div>
        <Typography.Paragraph type="secondary" style={{ margin: "2px 0 4px", fontSize: 13 }} ellipsis={{ rows: 2, expandable: true, symbol: "more" }}>
          {incident.description}
        </Typography.Paragraph>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {fmtDateTime(incident.occurred_at)}
          {incident.route_code && ` · Route ${incident.route_code}`}
          {incident.vehicle_registration && ` · ${incident.vehicle_registration}`}
          {incident.trip && <> · <Link to={`/driver/trips/${incident.trip}`}>Open trip</Link></>}
        </Typography.Text>
        {incident.resolution_notes && (
          <Typography.Text style={{ display: "block", fontSize: 13, marginTop: 6 }}>
            <strong>Resolution:</strong> {incident.resolution_notes}
          </Typography.Text>
        )}
      </div>
    </article>
  );
}

export default function DriverIncidentsPage() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");
  const prefillTrip = params.get("trip");
  const incidents = useQuery({ queryKey: driverKeys.incidents, queryFn: driverApi.incidents });
  const home = useDriverHome();
  useEffect(() => {
    if (params.get("new") === "1") setOpen(true);
  }, [params]);

  const close = () => {
    setOpen(false);
    if (params.has("new") || params.has("trip")) setParams({}, { replace: true });
  };

  return (
    <div className="sbp-stack" style={{ gap: 16 }}>
      <div className="sbp-between">
        <div>
          <h1 className="sbp-section-title" style={{ fontSize: 20, marginBottom: 4 }}>Incidents</h1>
          <Typography.Text type="secondary">Reports you have sent to the transport office.</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} className="sbp-touch-btn" onClick={() => setOpen(true)}>
          Report incident
        </Button>
      </div>
      <QueryState query={incidents} rows={6} isEmpty={(d: DriverIncident[]) => d.length === 0} emptyTitle="No incidents reported" emptyDescription="Use “Report incident” for breakdowns, accidents, medical or behaviour issues.">
        {(items) => <div>{items.map((i) => <IncidentRow key={i.id} incident={i} />)}</div>}
      </QueryState>
      <Drawer title="Report incident" placement="bottom" height="auto" styles={{ body: { maxHeight: "80vh", overflow: "auto" } }} open={open} onClose={close} destroyOnHidden>
        <IncidentForm trips={home.data?.trips ?? []} vehicleId={home.data?.vehicle?.id ?? null} initialTrip={prefillTrip} onDone={close} onCancel={close} />
      </Drawer>
    </div>
  );
}
