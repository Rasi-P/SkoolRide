import { Card, Tag, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { CalendarOutlined, FormOutlined, HistoryOutlined, LockOutlined, LogoutOutlined, MessageOutlined, UserOutlined } from "@ant-design/icons";
import { useAuth } from "@/app/auth";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { InstallHint, NameAvatar } from "@/components/ui/Misc";
import { ContactSchoolCard } from "../components/ContactSchool";
import { MenuList } from "../components/MenuList";
import { useSchoolInfo } from "../context";

export default function ParentMorePage() {
  const { user, membership, logout } = useAuth();
  const navigate = useNavigate();
  const school = useSchoolInfo();
  const signOut = () =>
    confirmAction({
      title: "Sign out of SchoolBus Pro?",
      content: "You will need your email and password to sign in again.",
      okText: "Sign out",
      danger: true,
      onOk: async () => {
        await logout();
        navigate("/login");
      },
    });
  return (
    <div className="sbp-stack">
      <div className="sbp-surface sbp-row" style={{ padding: 16 }}>
        <NameAvatar name={user?.full_name} src={user?.avatar} size={48} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{user?.full_name}</div>
          <div className="sbp-muted" style={{ fontSize: 13 }}>
            {user?.email}
          </div>
          <div className="sbp-muted sbp-row" style={{ fontSize: 12, marginTop: 2 }}>
            {membership?.school_name}
            {school.data?.demo_mode && (
              <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                Demo mode
              </Tag>
            )}
          </div>
        </div>
      </div>
      <MenuList
        items={[
          { key: "schedule", icon: <CalendarOutlined />, label: "Schedule", description: "Route, stops and weekly timetable", to: "/parent/more/schedule" },
          { key: "trips", icon: <HistoryOutlined />, label: "Trip history", description: "Past trips and attendance", to: "/parent/more/trips" },
          { key: "requests", icon: <FormOutlined />, label: "Requests", description: "Report absences, change pickup", to: "/parent/more/requests" },
          { key: "complaints", icon: <MessageOutlined />, label: "Complaints", description: "Raise and follow up issues", to: "/parent/more/complaints" },
          { key: "profile", icon: <UserOutlined />, label: "Profile & settings", description: "Contact details and notification preferences", to: "/parent/more/profile" },
          { key: "account", icon: <LockOutlined />, label: "Account & password", description: "Change your password", to: "/parent/more/account" },
        ]}
      />
      <Card size="small" title="Contact school" id="contact">
        <ContactSchoolCard />
      </Card>
      <Card size="small" title="Install the app">
        <div className="sbp-stack" style={{ gap: 8 }}>
          <InstallHint />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Add SchoolBus Pro to your home screen for faster access and push alerts. In most browsers, open the browser menu and choose "Install app" or "Add to Home screen".
          </Typography.Text>
        </div>
      </Card>
      <MenuList items={[{ key: "logout", icon: <LogoutOutlined />, label: "Sign out", onClick: signOut, danger: true }]} />
      <div className="sbp-muted" style={{ textAlign: "center", fontSize: 12 }}>
        SchoolBus Pro · Parent app
      </div>
    </div>
  );
}
