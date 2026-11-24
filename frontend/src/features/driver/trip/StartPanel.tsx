import { useState } from "react";
import { Alert, Button, Card, Input, Modal, Typography } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";
import { KeyValue } from "@/components/ui/Misc";
import { fmtDate, fmtTime } from "@/lib/format";
import type { TripDetail } from "@/types";
import { useConfirm } from "../confirm";

interface Props {
  trip: TripDetail;
  busy: boolean;
  onStart: () => Promise<unknown> | void;
  onCancel: (reason: string) => void;
}

/** Pre-start confirmation: what the driver is about to run, then one big button. */
export function StartPanel({ trip, busy, onStart, onCancel }: Props) {
  const confirm = useConfirm();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const stops = [...trip.stops].sort((a, b) => a.sequence - b.sequence);
  return (
    <Card size="small" title="Ready to start?">
      {!trip.vehicle && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="No vehicle is assigned to this trip. Ask the transport office to assign one before starting." />}
      <KeyValue
        items={[
          { label: "Vehicle", value: trip.vehicle_display_name ? `${trip.vehicle_display_name} · ${trip.vehicle_registration}` : "Not assigned" },
          { label: "Route", value: `${trip.route_code} · ${trip.route_name}` },
          { label: "Direction", value: trip.direction === "PICKUP" ? "Morning pickup (home to school)" : "Afternoon drop-off (school to home)" },
          { label: "Scheduled", value: `${fmtDate(trip.scheduled_date, "ddd, DD MMM")} at ${fmtTime(trip.scheduled_start_time)}` },
          { label: "Stops", value: stops.length ? `${stops.length} · first: ${stops[0].name}` : "-" },
          { label: "Expected students", value: trip.expected_students },
          { label: "Driver", value: trip.driver_name ?? "-" },
          { label: "Attendant", value: trip.attendant_name ?? "-" },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ margin: "12px 0", fontSize: 13 }}>
        Starting the trip turns on location sharing (your browser will ask for permission), notifies parents that the bus has left and marks the vehicle in service.
      </Typography.Paragraph>
      <Button
        type="primary"
        block
        size="large"
        className="sbp-touch-btn"
        icon={<PlayCircleOutlined />}
        loading={busy}
        onClick={() =>
          confirm({
            title: "Start this trip?",
            content: `${trip.route_code} ${trip.direction === "PICKUP" ? "pickup" : "drop-off"} with ${trip.expected_students} expected students. Location sharing will start now.`,
            okText: "Yes, start trip",
            onOk: onStart,
          })
        }
      >
        Start trip
      </Button>
      <Button type="link" block style={{ marginTop: 8 }} onClick={() => setCancelOpen(true)}>
        Cannot run this trip? Cancel it
      </Button>
      <Modal
        open={cancelOpen}
        title="Cancel this trip?"
        okText="Cancel trip"
        okButtonProps={{ danger: true, disabled: reason.trim().length < 3 }}
        cancelText="Keep trip"
        centered
        onCancel={() => setCancelOpen(false)}
        onOk={() => {
          onCancel(reason.trim());
          setCancelOpen(false);
        }}
      >
        <Typography.Paragraph type="secondary">Parents of every student on this trip are notified of the cancellation and the reason.</Typography.Paragraph>
        <label htmlFor="cancel-reason" style={{ display: "block", fontWeight: 500, marginBottom: 4 }}>Reason</label>
        <Input.TextArea id="cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Vehicle breakdown before departure" />
      </Modal>
    </Card>
  );
}
