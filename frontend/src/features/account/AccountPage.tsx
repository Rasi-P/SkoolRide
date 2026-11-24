import { useEffect, useState } from "react";
import { Alert, Button, Card, Col, Row, Switch, Tabs, Typography, message } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { z } from "zod";
import { authApi } from "@/api/auth";
import { api, errorMessage } from "@/api/client";
import { useAuth } from "@/app/auth";
import { SelectField, TextField, useZodForm } from "@/components/forms/fields";
import { PageHeader } from "@/components/ui/PageHeader";
import { InstallHint } from "@/components/ui/Misc";
import { getPushState, subscribeToPush, unsubscribeFromPush, type PushState } from "@/pwa/push";

const profileSchema = z.object({ first_name: z.string().min(1, "Required"), last_name: z.string().optional(), phone: z.string().optional() });
const passwordSchema = z.object({ current_password: z.string().min(1, "Required"), new_password: z.string().min(8, "At least 8 characters"), confirm: z.string() }).refine((d) => d.new_password === d.confirm, { path: ["confirm"], message: "Passwords do not match" });
const prefSchema = z.object({ push_enabled: z.boolean(), email_enabled: z.boolean(), sms_enabled: z.boolean(), muted_categories: z.array(z.string()) });

const CATEGORIES = ["ARRIVAL_SOON", "ETA_CHANGED", "BOARDED", "DROPPED", "NO_SHOW", "SCHOOL_ARRIVAL", "TRIP_STARTED", "TRIP_DELAY", "ANNOUNCEMENT", "FEE_DUE", "FEE_OVERDUE", "PAYMENT_RECEIVED", "DOCUMENT_EXPIRY", "COMPLAINT", "REQUEST_UPDATE", "GPS_STALE"];

export function PushToggle() {
  const [state, setState] = useState<PushState>("unsubscribed");
  const config = useQuery({ queryKey: ["public-config"], queryFn: authApi.publicConfig, staleTime: Infinity });
  useEffect(() => { getPushState().then(setState); }, []);
  const toggle = async (on: boolean) => {
    try {
      if (on) setState(await subscribeToPush(config.data?.vapid_public_key ?? null));
      else { await unsubscribeFromPush(); setState("unsubscribed"); }
    } catch (e) { message.error(errorMessage(e)); }
  };
  const disabled = state === "unsupported" || state === "denied" || !config.data?.vapid_public_key;
  return (
    <div>
      <div className="sbp-row"><Switch checked={state === "subscribed"} onChange={toggle} disabled={disabled} aria-label="Push notifications on this device" /> <span>Push notifications on this device</span></div>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
        {state === "unsupported" ? "This browser does not support web push. On iOS, install the app to the home screen first." : state === "denied" ? "Notifications are blocked in the browser settings." : !config.data?.vapid_public_key ? "Push is not configured on this server (VAPID keys missing). In-app notifications still work." : state === "subscribed" ? "You will receive alerts even when the app is closed (browser permitting)." : "Enable to receive bus alerts on this device."}
      </Typography.Text>
    </div>
  );
}

export default function AccountPage() {
  const { user, refreshUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const profile = useZodForm(profileSchema, { values: user ? { first_name: user.first_name, last_name: user.last_name, phone: user.phone } : undefined });
  const saveProfile = useMutation({ mutationFn: (d: z.input<typeof profileSchema>) => authApi.updateMe(d), onSuccess: () => { refreshUser(); message.success("Profile updated"); } });
  const pw = useZodForm(passwordSchema, { defaultValues: { current_password: "", new_password: "", confirm: "" } });
  const changePw = useMutation({ mutationFn: (d: z.input<typeof passwordSchema>) => authApi.changePassword(d.current_password, d.new_password), onSuccess: () => { message.success("Password changed"); pw.reset(); } });
  const prefs = useQuery({ queryKey: ["notification-prefs"], queryFn: () => api.get<z.input<typeof prefSchema>>("/notifications/preferences/").then((r) => r.data) });
  const prefForm = useZodForm(prefSchema, { values: prefs.data });
  const savePrefs = useMutation({ mutationFn: (d: z.input<typeof prefSchema>) => api.put("/notifications/preferences/", d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["notification-prefs"] }); message.success("Preferences saved"); } });

  return (
    <div>
      <PageHeader title="My account" subtitle={user?.email} />
      <Tabs
        activeKey={params.get("tab") || "profile"}
        onChange={(k) => setParams({ tab: k })}
        items={[
          {
            key: "profile", label: "Profile",
            children: (
              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <Card title="Profile">
                    <form onSubmit={profile.handleSubmit((d) => saveProfile.mutate(d))} noValidate>
                      {saveProfile.isError && <Alert type="error" showIcon message={errorMessage(saveProfile.error)} style={{ marginBottom: 12 }} />}
                      <TextField control={profile.control} name="first_name" label="First name" required />
                      <TextField control={profile.control} name="last_name" label="Last name" />
                      <TextField control={profile.control} name="phone" label="Phone" autoComplete="tel" />
                      <Button type="primary" htmlType="submit" loading={saveProfile.isPending}>Save</Button>
                    </form>
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card title="Change password">
                    <form onSubmit={pw.handleSubmit((d) => changePw.mutate(d))} noValidate>
                      {changePw.isError && <Alert type="error" showIcon message={errorMessage(changePw.error)} style={{ marginBottom: 12 }} />}
                      <TextField control={pw.control} name="current_password" label="Current password" type="password" required autoComplete="current-password" />
                      <TextField control={pw.control} name="new_password" label="New password" type="password" required autoComplete="new-password" />
                      <TextField control={pw.control} name="confirm" label="Confirm new password" type="password" required autoComplete="new-password" />
                      <Button type="primary" htmlType="submit" loading={changePw.isPending}>Update password</Button>
                    </form>
                  </Card>
                </Col>
              </Row>
            ),
          },
          {
            key: "notifications", label: "Notifications",
            children: (
              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <Card title="Channels">
                    <form onSubmit={prefForm.handleSubmit((d) => savePrefs.mutate(d))} noValidate>
                      <div className="sbp-stack" style={{ marginBottom: 16 }}>
                        {(["push_enabled", "email_enabled", "sms_enabled"] as const).map((k) => (
                          <label key={k} className="sbp-row"><Switch checked={!!prefForm.watch(k)} onChange={(v) => prefForm.setValue(k, v, { shouldDirty: true })} /> {k === "push_enabled" ? "Push notifications" : k === "email_enabled" ? "Email" : "SMS / WhatsApp"}</label>
                        ))}
                      </div>
                      <SelectField control={prefForm.control} name="muted_categories" label="Mute categories" mode="multiple" options={CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, " ").toLowerCase() }))} help="Incident and cancellation alerts are never muted." />
                      <Button type="primary" htmlType="submit" loading={savePrefs.isPending}>Save preferences</Button>
                    </form>
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card title="This device"><div className="sbp-stack"><PushToggle /><InstallHint /></div></Card>
                </Col>
              </Row>
            ),
          },
        ]}
      />
    </div>
  );
}
