import type { ReactNode } from "react";
import { Button, Input, Space, Tooltip, message } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { copyText } from "../lib";

async function copyWithToast(text: string) {
  if (await copyText(text)) message.success("Link copied to clipboard");
  else message.error("Could not copy automatically. Select the link and copy it manually.");
}

/** Read-only link field with a copy button. */
export function CopyLink({ url, label = "Invitation link" }: { url: string; label?: string }) {
  return (
    <Space.Compact style={{ width: "100%" }}>
      <Input readOnly value={url} aria-label={label} onFocus={(e) => e.currentTarget.select()} style={{ fontSize: 12 }} />
      <Tooltip title="Copy link">
        <Button icon={<CopyOutlined />} onClick={() => copyWithToast(url)} aria-label={`Copy ${label.toLowerCase()}`} />
      </Tooltip>
    </Space.Compact>
  );
}

export function CopyButton({ text, label, children }: { text: string; label: string; children?: ReactNode }) {
  return (
    <Button size="small" icon={<CopyOutlined />} onClick={() => copyWithToast(text)} aria-label={label}>
      {children}
    </Button>
  );
}
