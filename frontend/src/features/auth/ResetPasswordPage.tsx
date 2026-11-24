import { Alert, Button, Card, Typography } from "antd";
import { useMutation } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { authApi } from "@/api/auth";
import { errorMessage } from "@/api/client";
import { TextField, useZodForm } from "@/components/forms/fields";

const schema = z.object({ new_password: z.string().min(8, "At least 8 characters"), confirm: z.string() }).refine((d) => d.new_password === d.confirm, { path: ["confirm"], message: "Passwords do not match" });

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const uid = params.get("uid") || "";
  const token = params.get("token") || "";
  const form = useZodForm(schema, { defaultValues: { new_password: "", confirm: "" } });
  const m = useMutation({ mutationFn: (d: z.input<typeof schema>) => authApi.confirmReset(uid, token, d.new_password) });
  return (
    <div className="sbp-page" style={{ maxWidth: 440, paddingTop: 40 }}>
      <Card>
        <Typography.Title level={3} style={{ marginTop: 0 }}>Choose a new password</Typography.Title>
        {!uid || !token ? <Alert type="error" showIcon message="This reset link is incomplete. Request a new one." /> : m.isSuccess ? (
          <Alert type="success" showIcon message="Password updated." action={<Link to="/login"><Button size="small" type="primary">Sign in</Button></Link>} />
        ) : (
          <form onSubmit={form.handleSubmit((d) => m.mutate(d))} noValidate>
            {m.isError && <Alert type="error" showIcon message={errorMessage(m.error)} style={{ marginBottom: 12 }} />}
            <TextField control={form.control} name="new_password" label="New password" type="password" required autoComplete="new-password" />
            <TextField control={form.control} name="confirm" label="Confirm password" type="password" required autoComplete="new-password" />
            <Button type="primary" htmlType="submit" block loading={m.isPending}>Update password</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
