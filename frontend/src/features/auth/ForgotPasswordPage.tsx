import { Alert, Button, Card, Typography } from "antd";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { z } from "zod";
import { authApi } from "@/api/auth";
import { errorMessage } from "@/api/client";
import { TextField, useZodForm } from "@/components/forms/fields";

const schema = z.object({ email: z.string().email("Enter a valid email") });

export default function ForgotPasswordPage() {
  const form = useZodForm(schema, { defaultValues: { email: "" } });
  const m = useMutation({ mutationFn: (d: z.input<typeof schema>) => authApi.requestReset(d.email) });
  return (
    <div className="sbp-page" style={{ maxWidth: 440, paddingTop: 40 }}>
      <Card>
        <Typography.Title level={3} style={{ marginTop: 0 }}>Reset your password</Typography.Title>
        {m.isSuccess ? (
          <Alert type="success" showIcon message="If an account exists for that email, a reset link has been sent. In development the email is printed to the backend console." />
        ) : (
          <form onSubmit={form.handleSubmit((d) => m.mutate(d))} noValidate>
            {m.isError && <Alert type="error" showIcon message={errorMessage(m.error)} style={{ marginBottom: 12 }} />}
            <TextField control={form.control} name="email" label="Email" type="email" required autoComplete="email" />
            <Button type="primary" htmlType="submit" block loading={m.isPending}>Send reset link</Button>
          </form>
        )}
        <div style={{ marginTop: 12 }}><Link to="/login">Back to sign in</Link></div>
      </Card>
    </div>
  );
}
