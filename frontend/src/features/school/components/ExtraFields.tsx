/** Extra react-hook-form fields not covered by the shared field set. */
import type { ReactNode } from "react";
import { Checkbox, ColorPicker, DatePicker, Form } from "antd";
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { dayjs, WEEKDAYS } from "@/lib/format";

interface Base<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label?: ReactNode;
  required?: boolean;
  help?: ReactNode;
  disabled?: boolean;
}

function Item({ id, label, required, help, error, children }: { id?: string; label?: ReactNode; required?: boolean; help?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <Form.Item label={label ? (id ? <label htmlFor={id}>{label}</label> : <span>{label}</span>) : undefined} required={required} validateStatus={error ? "error" : undefined} help={error || help} colon={false} style={{ marginBottom: 16 }}>
      {children}
    </Form.Item>
  );
}

/** ISO datetime string field. */
export function DateTimeField<T extends FieldValues>({ control, name, label, required, help, disabled }: Base<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Item id={name} label={label} required={required} help={help} error={fieldState.error?.message}>
          <DatePicker id={name} showTime={{ format: "HH:mm" }} format="DD MMM YYYY HH:mm" style={{ width: "100%" }} value={field.value ? dayjs(field.value as string) : null} onChange={(d) => field.onChange(d ? d.toISOString() : null)} onBlur={field.onBlur} disabled={disabled} aria-invalid={!!fieldState.error} />
        </Item>
      )}
    />
  );
}

/** Hex colour field. */
export function ColourField<T extends FieldValues>({ control, name, label, required, help, disabled }: Base<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Item label={label} required={required} help={help} error={fieldState.error?.message}>
          <ColorPicker value={(field.value as string) || "#1d4ed8"} onChange={(c) => field.onChange(c.toHexString())} disabled={disabled} showText format="hex" disabledAlpha />
        </Item>
      )}
    />
  );
}

/** Weekday checkbox group (0=Mon .. 6=Sun) stored as number[]. */
export function WeekdaysField<T extends FieldValues>({ control, name, label, required, help, disabled }: Base<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Item label={label} required={required} help={help} error={fieldState.error?.message}>
          <Checkbox.Group aria-label={typeof label === "string" ? label : undefined} value={(field.value as number[]) ?? []} onChange={(v) => field.onChange((v as number[]).sort((a, b) => a - b))} disabled={disabled} options={WEEKDAYS.map((d, i) => ({ label: d, value: i }))} />
        </Item>
      )}
    />
  );
}

/** Generic checkbox group for string values. */
export function CheckboxGroupField<T extends FieldValues>({ control, name, label, required, help, disabled, options }: Base<T> & { options: { value: string; label: string }[] }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Item label={label} required={required} help={help} error={fieldState.error?.message}>
          <Checkbox.Group aria-label={typeof label === "string" ? label : undefined} value={(field.value as string[]) ?? []} onChange={(v) => field.onChange(v as string[])} disabled={disabled} options={options} />
        </Item>
      )}
    />
  );
}
