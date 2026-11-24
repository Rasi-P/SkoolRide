import { Alert, Button, Card, Typography } from "antd";
import { LogoutOutlined, SettingOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { InstallHint, KeyValue, NameAvatar } from "@/components/ui/Misc";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { titleCase } from "@/lib/format";
import { ContactSchool } from "../components/ContactSchool";
import { useConfirm } from "../confirm";
import { useDriverHome } from "../hooks";

export default function DriverMorePage() {
  const { user, membership, logout } = useAuth();
  const navigate = useNavigate();
  const home = useDriverHome();
  const confirm = useConfirm();
  const staff = home.data?.staff;
  const vehicle = home.data?.vehicle;
  return (
    <div className="sbp-stack" style={{ gap: 16 }}>
      <Card size="small">
        <div className="sbp-row" style={{ gap: 12 }}>
          <NameAvatar name={user?.full_name} src={user?.avatar} size={48} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{user?.full_name}</div>
            <Typography.Text type="secondary">
              {staff ? `${titleCase(staff.type)} · ${staff.employee_id}` : titleCase(membership?.role)} · {membership?.school_name}
            </Typography.Text>
          </div>
        </div>
        {staff?.licence_expired && <Alert type="error" showIcon style={{ marginTop: 12 }} message="Your driving licence has expired. Contact the transport office." />}
        <div style={{ marginTop: 12 }}>
          <KeyValue items={[{ label: "Email", value: user?.email }, { label: "Phone", value: user?.phone || "-" }, { label: "School", value: membership?.school_name }, { label: "Timezone", value: home.data?.school.timezone }]} />
        </div>
        <Button block className="sbp-touch-btn" icon={<SettingOutlined />} style={{ marginTop: 12 }} onClick={() => navigate("/driver/more/account")}>
          Account settings and notifications
        </Button>
      </Card>

      <Card size="small" title="Vehicle" extra={vehicle && <StatusBadge status={vehicle.status} />}>
        {vehicle ? (
          <KeyValue items={[{ label: "Vehicle", value: vehicle.display_name }, { label: "Registration", value: vehicle.registration_number }, { label: "Capacity", value: vehicle.capacity }, { label: "Routes", value: vehicle.routes.map((r) => `${r.code} ${r.name}`).join(", ") || "-" }]} />
        ) : (
          <Typography.Text type="secondary">No vehicle assigned.</Typography.Text>
        )}
      </Card>

      {home.data && <ContactSchool school={home.data.school} />}

      <Card size="small" title="GPS tracking: what to expect">
        <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13, lineHeight: 1.6 }}>
          <li>Location sharing starts when you start a trip and stops when it ends. You can pause it with the switch on the trip page.</li>
          <li>Allow the Location permission when the browser asks. If you blocked it earlier, allow it again in the browser's site settings.</li>
          <li>Keep the app in the foreground with the screen on. Mobile browsers pause GPS and timers for background tabs and locked screens; the school sees a "GPS stale" warning when that happens.</li>
          <li>Positions with poor accuracy (over 250 m) are not sent. Open sky improves the fix.</li>
          <li>Updates are sent every {home.data?.location_interval_seconds ?? 10} seconds while the trip is in progress. Nothing is sent when the trip is paused.</li>
          <li>Installing the app to your home screen keeps it full-screen and easier to reopen.</li>
        </ul>
        <div style={{ marginTop: 12 }}>
          <InstallHint />
        </div>
      </Card>

      <Button
        danger
        block
        className="sbp-touch-btn"
        icon={<LogoutOutlined />}
        onClick={() =>
          confirm({
            title: "Sign out?",
            content: "Location sharing stops when you sign out.",
            okText: "Sign out",
            danger: true,
            onOk: () => logout().then(() => navigate("/login")),
          })
        }
      >
        Sign out
      </Button>
    </div>
  );
}
