import { Alert, Button, Card, Descriptions, Typography } from "antd";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { authApi } from "@/api/auth";
import { errorMessage } from "@/api/client";
import { useAuth, homePathFor, personaFor } from "@/app/auth";
import { TextField, useZodForm } from "@/components/forms/fields";
import { ErrorState, LoadingSkeleton } from "@/components/ui/States";
import { titleCase, fmtDate } from "@/lib/format";

const schema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  password: z.string().optional(),
  current_password: z.string().optional(),
  confirm: z.string().optional(),
}).refine((d) => !d.password || d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match" });

export default function InviteAcceptPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { acceptSession } = useAuth();
  const inv = useQuery({ queryKey: ["invitation", token], queryFn: () => authApi.invitation(token), retry: false });
  const form = useZodForm(schema, { values: inv.data ? { first_name: inv.data.first_name, last_name: inv.data.last_name, phone: "", password: "", confirm: "" } : undefined });
  const m = useMutation({
    mutationFn: (d: z.input<typeof schema>) => authApi.acceptInvitation({ token, first_name: d.first_name, last_name: d.last_name, phone: d.phone, password: d.password || undefined, current_password: d.current_password }),
    onSuccess: (res) => {
      acceptSession(res.user, res.access);
      const mem = res.user.memberships.find((x) => x.is_primary) ?? res.user.memberships[0] ?? null;
      navigate(homePathFor(personaFor(res.user, mem), res.user), { replace: true });
    },
  });
  if (inv.isLoading) return <div className="sbp-page" style={{ maxWidth: 520 }}><LoadingSkeleton /></div>;
  if (inv.isError || !inv.data) return <div className="sbp-page" style={{ maxWidth: 520 }}><ErrorState error={inv.error} title="Invitation invalid or expired" /></div>;
  const needsPassword = !inv.data.existing_account;
  return (
    <div className="sbp-page" style={{ maxWidth: 520, paddingTop: 32 }}>
      <Card>
        <Typography.Title level={3} style={{ marginTop: 0 }}>Join {inv.data.school_name}</Typography.Title>
        <Descriptions size="small" column={1} items={[{ key: "r", label: "Role", children: titleCase(inv.data.role) }, { key: "e", label: "Email", children: inv.data.email }, { key: "x", label: "Expires", children: fmtDate(inv.data.expires_at) }]} />
        {m.isError && <Alert type="error" showIcon message={errorMessage(m.error)} style={{ margin: "12px 0" }} />}
        <form onSubmit={form.handleSubmit((d) => { if (needsPassword && !d.password) { form.setError("password", { message: "Choose a password" }); return; } m.mutate(d); })} noValidate style={{ marginTop: 16 }}>
          <TextField control={form.control} name="first_name" label="First name" required />
          <TextField control={form.control} name="last_name" label="Last name" />
          <TextField control={form.control} name="phone" label="Phone" autoComplete="tel" />
          {needsPassword ? (
            <>
              <TextField control={form.control} name="password" label="Password" type="password" required autoComplete="new-password" help="At least 8 characters, not entirely numeric." />
              <TextField control={form.control} name="confirm" label="Confirm password" type="password" required autoComplete="new-password" />
            </>
          ) : (
            <>
              <Alert type="info" showIcon message="Confirm your existing password to add this school to your account." style={{ marginBottom: 12 }} />
              <TextField control={form.control} name="current_password" label="Current password" type="password" required autoComplete="current-password" />
            </>
          )}
          <Button type="primary" htmlType="submit" block size="large" loading={m.isPending}>Accept invitation</Button>
        </form>
      </Card>
    </div>
  );
}
