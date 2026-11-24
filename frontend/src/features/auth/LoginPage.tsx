import { Alert, Button, Card, Collapse, Typography } from "antd";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { authApi } from "@/api/auth";
import { errorMessage } from "@/api/client";
import { useAuth, homePathFor, personaFor } from "@/app/auth";
import { TextField, useZodForm } from "@/components/forms/fields";
import { InstallHint } from "@/components/ui/Misc";

const schema = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(1, "Password is required") });

const DEMO_ACCOUNTS = [
  ["Super Admin", "superadmin@schoolbuspro.demo"],
  ["School Admin", "admin@greenfield.demo"],
  ["Transport Manager", "transport@greenfield.demo"],
  ["Driver", "driver1@greenfield.demo"],
  ["Attendant", "attendant1@greenfield.demo"],
  ["Parent", "parent@greenfield.demo"],
];

export default function LoginPage() {
  const { user, login, persona, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const config = useQuery({ queryKey: ["public-config"], queryFn: authApi.publicConfig, staleTime: Infinity });
  const form = useZodForm(schema, { defaultValues: { email: "", password: "" } });
  const m = useMutation({
    mutationFn: ({ email, password }: z.input<typeof schema>) => login(email, password),
    onSuccess: (u) => {
      const from = (location.state as { from?: string } | null)?.from;
      const target = from && from !== "/login" ? from : homePathFor(personaFor(u, u.memberships.find((x) => x.is_primary) ?? u.memberships[0] ?? null), u);
      navigate(target, { replace: true });
    },
  });
  if (!loading && user) return <Navigate to={homePathFor(persona, user)} replace />;
  return (
    <div className="sbp-page" style={{ maxWidth: 440, paddingTop: 40 }}>
      <Card>
        <Typography.Title level={3} style={{ marginTop: 0 }}>Sign in</Typography.Title>
        <Typography.Text type="secondary">Use the account your school or the platform provided.</Typography.Text>
        {m.isError && <Alert type="error" showIcon message={errorMessage(m.error)} style={{ marginTop: 16 }} />}
        <form onSubmit={form.handleSubmit((d) => m.mutate(d))} noValidate style={{ marginTop: 16 }}>
          <TextField control={form.control} name="email" label="Email" type="email" required autoComplete="email" />
          <TextField control={form.control} name="password" label="Password" type="password" required autoComplete="current-password" />
          <Button type="primary" htmlType="submit" block size="large" loading={m.isPending}>Sign in</Button>
        </form>
        <div className="sbp-between" style={{ marginTop: 12 }}>
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to="/register">Register a school</Link>
        </div>
        <div style={{ marginTop: 12 }}><InstallHint /></div>
      </Card>
      {config.data?.demo_mode && (
        <Collapse
          style={{ marginTop: 16 }}
          items={[{
            key: "demo",
            label: "Demo accounts (development only)",
            children: (
              <div className="sbp-stack">
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>All demo passwords are <code>Demo@12345</code>. These credentials are insecure and only exist in seeded demo environments.</Typography.Text>
                {DEMO_ACCOUNTS.map(([role, email]) => (
                  <Button key={email} size="small" onClick={() => { form.setValue("email", email); form.setValue("password", "Demo@12345"); m.mutate({ email, password: "Demo@12345" }); }} style={{ justifyContent: "space-between", display: "flex" }}>
                    <span>{role}</span><span className="sbp-muted">{email}</span>
                  </Button>
                ))}
              </div>
            ),
          }]}
        />
      )}
    </div>
  );
}
