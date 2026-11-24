import { useProtectedImage } from "./ProtectedMedia";
import { Alert, Avatar, Button, Typography } from "antd";
import { useEffect, useState } from "react";
import { DownloadOutlined, WifiOutlined } from "@ant-design/icons";
import { useOnline } from "@/hooks/useOnline";
import { onInstallAvailable, promptInstall, isStandalone } from "@/pwa/push";
import { onSwUpdate } from "@/pwa/register";
import { initials } from "@/lib/format";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <Alert
      banner
      type="warning"
      icon={<WifiOutlined />}
      message="You are offline. Live tracking, notifications and new data are unavailable until the connection returns; anything shown may be out of date."
      style={{ position: "sticky", top: 0, zIndex: 50 }}
    />
  );
}

export function UpdatePrompt() {
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);
  useEffect(() => onSwUpdate((u) => setUpdate(() => u)), []);
  if (!update) return null;
  return (
    <Alert
      banner
      type="info"
      message="A new version of SchoolBus Pro is available."
      action={<Button size="small" type="primary" onClick={() => update()}>Reload</Button>}
    />
  );
}

export function InstallButton({ block }: { block?: boolean }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => onInstallAvailable(setAvailable), []);
  if (!available || isStandalone()) return null;
  return (
    <Button icon={<DownloadOutlined />} block={block} onClick={() => promptInstall()}>
      Install app
    </Button>
  );
}

export function InstallHint() {
  const [available, setAvailable] = useState(false);
  useEffect(() => onInstallAvailable(setAvailable), []);
  if (isStandalone()) return null;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (available) return <InstallButton block />;
  if (isIOS)
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        To install: tap the Share icon in Safari, then "Add to Home Screen".
      </Typography.Text>
    );
  return null;
}

export function NameAvatar({ name, src, size = 36 }: { name: string | null | undefined; src?: string | null; size?: number }) {
  const image = useProtectedImage(src);
  return (
    <Avatar size={size} src={image} style={{ background: "#e0e7ff", color: "#1e3a8a", fontWeight: 600, flexShrink: 0 }}>
      {initials(name)}
    </Avatar>
  );
}

export function KeyValue({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 16px", margin: 0 }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: "contents" }}>
          <dt className="sbp-muted" style={{ fontSize: 13 }}>{it.label}</dt>
          <dd style={{ margin: 0, fontSize: 13 }}>{it.value ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}
