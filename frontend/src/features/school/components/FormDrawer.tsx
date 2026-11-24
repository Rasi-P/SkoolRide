import type { ReactNode } from "react";
import { Button, Drawer, Space } from "antd";
import { InlineError } from "@/components/ui/States";

interface Props {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  onSubmit?: () => void;
  submitting?: boolean;
  error?: unknown;
  width?: number;
  children: ReactNode;
  submitLabel?: string;
  readOnly?: boolean;
  extra?: ReactNode;
}

/** Drawer hosting a form: consistent header, inline server error and footer actions. */
export function FormDrawer({ open, title, onClose, onSubmit, submitting, error, width = 520, children, submitLabel = "Save", readOnly, extra }: Props) {
  return (
    <Drawer open={open} title={title} onClose={onClose} width={width} destroyOnHidden extra={extra}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        <InlineError error={error} />
        {children}
        {!readOnly && onSubmit && (
          <Space style={{ marginTop: 8 }}>
            <Button type="primary" htmlType="submit" loading={submitting}>
              {submitLabel}
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </Space>
        )}
      </form>
    </Drawer>
  );
}
