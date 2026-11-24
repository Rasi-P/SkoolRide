import { Button } from "antd";
import { PhoneOutlined } from "@ant-design/icons";
import { telHref } from "../lib";

export function CallButton({ phone, label, block = true, size = "large" }: { phone: string; label: string; block?: boolean; size?: "small" | "middle" | "large" }) {
  return (
    <Button icon={<PhoneOutlined />} href={telHref(phone)} block={block} size={size} className={size === "large" ? "sbp-touch-btn" : undefined}>
      {label}
    </Button>
  );
}
