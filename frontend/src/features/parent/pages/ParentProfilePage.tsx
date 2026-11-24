import { App, Button, Card, Col, Divider, Row, Tag, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { LockOutlined } from "@ant-design/icons";
import { fieldErrors } from "@/api/client";
import { useAuth } from "@/app/auth";
import { SelectField, SwitchField, TextAreaField, TextField, TimeField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { InstallHint } from "@/components/ui/Misc";
import { PageHeader } from "@/components/ui/PageHeader";
import { InlineError, QueryState } from "@/components/ui/States";
import { PushToggle } from "@/features/account/AccountPage";
import { titleCase } from "@/lib/format";
import { parentApi, qk } from "../api";
import { LANGUAGE_OPTIONS, NOTIFICATION_CATEGORY_OPTIONS } from "../labels";
import { prefsSchema, profileSchema, type PrefsFormValues, type ProfileFormValues } from "../schemas";

export default function ParentProfilePage() {
  const { refreshUser } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const profile = useQuery({ queryKey: qk.profile, queryFn: parentApi.profile });
  const p = profile.data;

  const form = useZodForm(profileSchema, {
    values: p ? { first_name: p.first_name, last_name: p.last_name, phone: p.phone, alt_phone: p.alt_phone, address: p.address, preferred_language: p.preferred_language } : undefined,
  });
  const save = useMutation({
    mutationFn: (d: ProfileFormValues) => parentApi.updateProfile(d),
    onSuccess: (data) => {
      qc.setQueryData(qk.profile, data);
      qc.invalidateQueries({ queryKey: qk.children });
      void refreshUser();
      message.success("Profile updated");
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });

  const prefForm = useZodForm(prefsSchema, { values: p?.notification_preferences });
  const savePrefs = useMutation({
    mutationFn: (d: PrefsFormValues) => parentApi.savePrefs({ ...d, quiet_hours_start: d.quiet_hours_start || null, quiet_hours_end: d.quiet_hours_end || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.profile });
      qc.invalidateQueries({ queryKey: qk.prefs });
      message.success("Notification preferences saved");
    },
    onError: (e) => applyServerErrors(prefForm.setError, fieldErrors(e)),
  });

  return (
    <div className="sbp-stack">
      <PageHeader compact title="Profile & settings" crumbs={[{ label: "More", to: "/parent/more" }, { label: "Profile" }]} />
      <QueryState query={profile} rows={8}>
        {(data) => (
          <>
            <Card size="small" title="Contact details">
              <form onSubmit={form.handleSubmit((d) => save.mutate(d))} noValidate>
                {save.isError && <InlineError error={save.error} />}
                <Row gutter={12}>
                  <Col span={12}>
                    <TextField control={form.control} name="first_name" label="First name" required autoComplete="given-name" />
                  </Col>
                  <Col span={12}>
                    <TextField control={form.control} name="last_name" label="Last name" autoComplete="family-name" />
                  </Col>
                </Row>
                <TextField control={form.control} name="phone" label="Mobile phone" required type="tel" autoComplete="tel" help="Used for SMS / WhatsApp alerts and by the transport office." />
                <TextField control={form.control} name="alt_phone" label="Alternate phone" type="tel" />
                <TextAreaField control={form.control} name="address" label="Address" rows={2} />
                <SelectField control={form.control} name="preferred_language" label="Preferred language" options={LANGUAGE_OPTIONS} allowClear={false} />
                <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                  Signed in as {data.email}
                </Typography.Text>
                <Button type="primary" htmlType="submit" size="large" block loading={save.isPending}>
                  Save changes
                </Button>
              </form>
            </Card>

            <Card size="small" title="My children">
              {data.children.length === 0 ? (
                <div className="sbp-muted">No children linked yet.</div>
              ) : (
                data.children.map((c, i) => (
                  <div key={c.student_id} className="sbp-between" style={{ padding: "8px 0", borderBottom: i < data.children.length - 1 ? "1px solid var(--sbp-border)" : undefined }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div className="sbp-muted" style={{ fontSize: 12 }}>
                        {titleCase(c.relationship)}
                        {c.is_primary ? " · primary guardian" : ""}
                      </div>
                    </div>
                    <div className="sbp-row">
                      {c.can_pickup && <Tag color="green">Can pick up</Tag>}
                      {c.receives_notifications ? <Tag color="blue">Alerts on</Tag> : <Tag>Alerts off</Tag>}
                    </div>
                  </div>
                ))
              )}
              <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
                To add or remove a child, contact the school transport office.
              </Typography.Text>
            </Card>

            <Card size="small" title="Notifications">
              <form onSubmit={prefForm.handleSubmit((d) => savePrefs.mutate(d))} noValidate>
                {savePrefs.isError && <InlineError error={savePrefs.error} />}
                <SwitchField control={prefForm.control} name="push_enabled" label="Push notifications" />
                <SwitchField control={prefForm.control} name="email_enabled" label="Email" />
                <SwitchField control={prefForm.control} name="sms_enabled" label="SMS / WhatsApp" />
                <SelectField control={prefForm.control} name="muted_categories" label="Muted alert types" mode="multiple" options={NOTIFICATION_CATEGORY_OPTIONS} placeholder="None" help="Incident and trip cancellation alerts are never muted." />
                <Row gutter={12}>
                  <Col span={12}>
                    <TimeField control={prefForm.control} name="quiet_hours_start" label="Quiet hours from" />
                  </Col>
                  <Col span={12}>
                    <TimeField control={prefForm.control} name="quiet_hours_end" label="Quiet hours until" />
                  </Col>
                </Row>
                <Button type="primary" htmlType="submit" size="large" block loading={savePrefs.isPending}>
                  Save preferences
                </Button>
              </form>
              <Divider />
              <div className="sbp-stack">
                <PushToggle />
                <InstallHint />
              </div>
            </Card>

            <Card size="small" title="Security">
              <Button block size="large" icon={<LockOutlined />} onClick={() => navigate("/parent/more/account")}>
                Change password
              </Button>
            </Card>
          </>
        )}
      </QueryState>
    </div>
  );
}
