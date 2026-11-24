import { Modal } from "antd";
import type { ReactNode } from "react";

interface Options {
  title: string;
  content?: ReactNode;
  okText?: string;
  danger?: boolean;
  onOk: () => Promise<unknown> | unknown;
}

/** Imperative confirmation dialog with consistent copy and a destructive variant. */
export function confirmAction({ title, content, okText = "Confirm", danger, onOk }: Options) {
  Modal.confirm({
    title,
    content,
    okText,
    cancelText: "Cancel",
    okButtonProps: { danger },
    centered: true,
    onOk: async () => {
      await onOk();
    },
  });
}
