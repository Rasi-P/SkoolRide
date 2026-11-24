/**
 * Context-aware confirmation dialog. The shared confirmAction() uses the static Modal.confirm, which renders
 * through ReactDOM.render/createRoot from the "react-dom" main entry; React 19 no longer exports those, so without
 * @ant-design/v5-patch-for-react-19 the static dialog never appears. App.useApp().modal renders inside the tree.
 */
import { useCallback } from "react";
import { App } from "antd";
import type { ReactNode } from "react";

export interface ConfirmOptions {
  title: string;
  content?: ReactNode;
  okText?: string;
  danger?: boolean;
  onOk: () => Promise<unknown> | unknown;
}

export function useConfirm() {
  const { modal } = App.useApp();
  return useCallback(
    ({ title, content, okText = "Confirm", danger, onOk }: ConfirmOptions) =>
      modal.confirm({
        title,
        content,
        okText,
        cancelText: "Cancel",
        okButtonProps: { danger, className: "sbp-touch-btn" },
        cancelButtonProps: { className: "sbp-touch-btn" },
        centered: true,
        onOk: async () => {
          await onOk();
        },
      }),
    [modal],
  );
}
