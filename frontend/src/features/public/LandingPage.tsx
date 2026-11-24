import { Button, Card, Col, Row, Typography } from "antd";
import { BellOutlined, CarOutlined, DollarOutlined, EnvironmentOutlined, SafetyOutlined, TeamOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

interface Plan { id: string; code: string; name: string; description: string; price_monthly: string; currency: string; max_vehicles: number; max_students: number; features: string[] }

const FEATURES = [
  { icon: <EnvironmentOutlined />, title: "Live bus tracking", text: "Parents see the bus on a map with an ETA to their own stop, not just to the school." },
  { icon: <BellOutlined />, title: "10-minute arrival alerts", text: "Server-side ETA alerts, boarding and drop-off confirmations, delays and cancellations." },
  { icon: <SafetyOutlined />, title: "Attendance & safety", text: "Boarding records per stop, incident reports, emergency alerts, document expiry reminders." },
  { icon: <CarOutlined />, title: "Fleet & routes", text: "Vehicles, drivers, attendants, ordered stops with coordinates, weekday schedules and capacity checks." },
  { icon: <DollarOutlined />, title: "Transport fees", text: "Fee plans, invoices, partial payments, receipts, reversals with an immutable audit trail." },
  { icon: <TeamOutlined />, title: "Multi-tenant SaaS", text: "One platform, many schools: approvals, subscriptions, suspensions and audit logs." },
];

export default function LandingPage() {
  const plans = useQuery({ queryKey: ["public-plans"], queryFn: () => api.get<Plan[]>("/public/plans/").then((r) => r.data) });
  return (
    <div>
      <section style={{ background: "linear-gradient(135deg,#0f1f4d 0%,#1e3a8a 100%)", color: "#fff" }}>
        <div className="sbp-page" style={{ paddingTop: 72, paddingBottom: 72 }}>
          <Row gutter={[32, 32]} align="middle">
            <Col xs={24} md={14}>
              <Typography.Title style={{ color: "#fff", fontSize: 44, lineHeight: 1.1, margin: 0, letterSpacing: "-0.02em" }}>
                Every school bus, every stop, every parent informed.
              </Typography.Title>
              <Typography.Paragraph style={{ color: "rgba(255,255,255,.8)", fontSize: 18, marginTop: 16, maxWidth: 560 }}>
                SchoolBus Pro gives schools a complete transport operations platform and gives parents a calm, reliable
                picture of where their child's bus is.
              </Typography.Paragraph>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
                <Link to="/register"><Button type="primary" size="large" style={{ background: "#fbbf24", color: "#0f172a", border: 0, fontWeight: 600 }}>Register your school</Button></Link>
                <Link to="/login"><Button size="large" ghost>Sign in</Button></Link>
              </div>
            </Col>
            <Col xs={24} md={10}>
              <div style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em", opacity: .7 }}>Parent view</div>
                <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>Bus 1 is 9 minutes away</div>
                <div style={{ opacity: .8, marginTop: 4 }}>Kadugodi Bus Stand · Route R1 Whitefield Loop</div>
                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[["Boarded", "6/7"], ["Delay", "+2 min"], ["GPS", "live"]].map(([k, v]) => (
                    <div key={k} style={{ background: "rgba(255,255,255,.1)", borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 11, opacity: .7 }}>{k}</div>
                      <div style={{ fontSize: 18, fontWeight: 600 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Col>
          </Row>
        </div>
      </section>
      <section className="sbp-page" style={{ paddingTop: 48 }}>
        <Typography.Title level={3} style={{ textAlign: "center" }}>Built for transport managers, drivers and parents</Typography.Title>
        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          {FEATURES.map((f) => (
            <Col xs={24} sm={12} lg={8} key={f.title}>
              <Card style={{ height: "100%" }}>
                <div style={{ fontSize: 22, color: "var(--sbp-primary)" }}>{f.icon}</div>
                <Typography.Title level={5} style={{ marginTop: 10 }}>{f.title}</Typography.Title>
                <Typography.Text type="secondary">{f.text}</Typography.Text>
              </Card>
            </Col>
          ))}
        </Row>
      </section>
      <section className="sbp-page" style={{ paddingBottom: 64 }}>
        <Typography.Title level={3} style={{ textAlign: "center" }}>Plans</Typography.Title>
        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          {(plans.data ?? []).map((p) => (
            <Col xs={24} md={8} key={p.id}>
              <Card title={p.name} extra={<span style={{ fontWeight: 700 }}>{p.currency} {Number(p.price_monthly).toLocaleString("en-IN")}/mo</span>} style={{ height: "100%" }}>
                <Typography.Text type="secondary">{p.description || `Up to ${p.max_vehicles} vehicles and ${p.max_students} students.`}</Typography.Text>
                <ul style={{ paddingLeft: 18, marginTop: 12 }}>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
              </Card>
            </Col>
          ))}
        </Row>
      </section>
    </div>
  );
}
