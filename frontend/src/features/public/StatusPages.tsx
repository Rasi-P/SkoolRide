import { Button, Result } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, homePathFor } from "@/app/auth";

export default function StatusPages({ kind }: { kind: "unauthorized" | "not-found" | "suspended" | "no-access" }) {
  const { user, persona, logout, membership } = useAuth();
  const navigate = useNavigate();
  const home = homePathFor(persona, user);
  if (kind === "not-found") return <Result status="404" title="Page not found" subTitle="The page you are looking for does not exist." extra={<Link to={home}><Button type="primary">Go home</Button></Link>} />;
  if (kind === "unauthorized") return <Result status="403" title="Not authorised" subTitle="Your role does not allow access to this page." extra={<Link to={home}><Button type="primary">Go to my dashboard</Button></Link>} />;
  if (kind === "suspended")
    return (
      <Result status="warning" title={`${membership?.school_name ?? "This school"} is not active`} subTitle="Operational features are disabled while the school is suspended or awaiting activation. Please contact the SchoolBus Pro platform team."
        extra={<Button onClick={() => logout().then(() => navigate("/login"))}>Sign out</Button>} />
    );
  return <Result status="info" title="No school linked to your account" subTitle="Your account exists but is not a member of any active school. Ask your school to send you an invitation." extra={<Button onClick={() => logout().then(() => navigate("/login"))}>Sign out</Button>} />;
}
