/**
 * react-hook-form + zod bound Ant Design fields. Every field renders a label, error message and aria attributes.
 */
import { type ReactNode } from "react";
import { Controller, type Control, type FieldValues, type Path, useForm, type UseFormProps, type UseFormSetError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { DatePicker, Input, InputNumber, Select, Switch, TimePicker, Form } from "antd";
import dayjs from "dayjs";

export function useZodForm<S extends z.ZodTypeAny>(schema: S, options?: Omit<UseFormProps<z.input<S>>, "resolver">) {
  return useForm<z.input<S>>({ resolver: zodResolver(schema as never), mode: "onBlur", ...options });
}

interface BaseProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label?: ReactNode;
  required?: boolean;
  help?: ReactNode;
  disabled?: boolean;
  placeholder?: string;
}

function Wrap({ label, required, help, error, children, id }: { label?: ReactNode; required?: boolean; help?: ReactNode; error?: string; children: ReactNode; id: string }) {
  return (
    <Form.Item
      label={label ? <label htmlFor={id}>{label}</label> : undefined}
      required={required}
      validateStatus={error ? "error" : undefined}
      help={error || help}
      style={{ marginBottom: 16 }}
      colon={false}
    >
      {children}
    </Form.Item>
  );
}

export function TextField<T extends FieldValues>({ control, name, label, required, help, disabled, placeholder, type = "text", autoComplete }: BaseProps<T> & { type?: string; autoComplete?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Wrap id={name} label={label} required={required} help={help} error={fieldState.error?.message}>
          {type === "password" ? (
            <Input.Password id={name} {...field} value={field.value ?? ""} disabled={disabled} placeholder={placeholder} autoComplete={autoComplete} aria-invalid={!!fieldState.error} />
          ) : (
            <Input id={name} {...field} value={field.value ?? ""} type={type} disabled={disabled} placeholder={placeholder} autoComplete={autoComplete} aria-invalid={!!fieldState.error} />
          )}
        </Wrap>
      )}
    />
  );
}

export function TextAreaField<T extends FieldValues>({ control, name, label, required, help, disabled, placeholder, rows = 3 }: BaseProps<T> & { rows?: number }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Wrap id={name} label={label} required={required} help={help} error={fieldState.error?.message}>
          <Input.TextArea id={name} {...field} value={field.value ?? ""} rows={rows} disabled={disabled} placeholder={placeholder} aria-invalid={!!fieldState.error} />
        </Wrap>
      )}
    />
  );
}

export function NumberField<T extends FieldValues>({ control, name, label, required, help, disabled, placeholder, min, max, step, prefix }: BaseProps<T> & { min?: number; max?: number; step?: number; prefix?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Wrap id={name} label={label} required={required} help={help} error={fieldState.error?.message}>
          <InputNumber id={name} style={{ width: "100%" }} value={field.value as number | null} onChange={(v) => field.onChange(v)} onBlur={field.onBlur} min={min} max={max} step={step} disabled={disabled} placeholder={placeholder} prefix={prefix} aria-invalid={!!fieldState.error} />
        </Wrap>
      )}
    />
  );
}

export function SelectField<T extends FieldValues>({ control, name, label, required, help, disabled, placeholder, options, mode, allowClear = true, loading }: BaseProps<T> & { options: { value: string | number; label: ReactNode }[]; mode?: "multiple" | "tags"; allowClear?: boolean; loading?: boolean }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Wrap id={name} label={label} required={required} help={help} error={fieldState.error?.message}>
          <Select id={name} style={{ width: "100%" }} value={field.value ?? undefined} onChange={(v) => field.onChange(v ?? null)} onBlur={field.onBlur} options={options} mode={mode} allowClear={allowClear} disabled={disabled} placeholder={placeholder} loading={loading} showSearch optionFilterProp="label" aria-invalid={!!fieldState.error} />
        </Wrap>
      )}
    />
  );
}

export function DateField<T extends FieldValues>({ control, name, label, required, help, disabled, placeholder }: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Wrap id={name} label={label} required={required} help={help} error={fieldState.error?.message}>
          <DatePicker id={name} style={{ width: "100%" }} value={field.value ? dayjs(field.value as string) : null} onChange={(d) => field.onChange(d ? d.format("YYYY-MM-DD") : null)} onBlur={field.onBlur} disabled={disabled} placeholder={placeholder} format="DD MMM YYYY" aria-invalid={!!fieldState.error} />
        </Wrap>
      )}
    />
  );
}

export function TimeField<T extends FieldValues>({ control, name, label, required, help, disabled }: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Wrap id={name} label={label} required={required} help={help} error={fieldState.error?.message}>
          <TimePicker id={name} style={{ width: "100%" }} format="HH:mm" minuteStep={5} value={field.value ? dayjs(`2000-01-01T${field.value}`) : null} onChange={(d) => field.onChange(d ? d.format("HH:mm:ss") : null)} onBlur={field.onBlur} disabled={disabled} aria-invalid={!!fieldState.error} />
        </Wrap>
      )}
    />
  );
}

export function SwitchField<T extends FieldValues>({ control, name, label, help, disabled }: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Form.Item label={<label htmlFor={name}>{label}</label>} help={help} colon={false} style={{ marginBottom: 16 }}>
          <Switch id={name} checked={!!field.value} onChange={(v) => field.onChange(v)} disabled={disabled} />
        </Form.Item>
      )}
    />
  );
}

/** Apply server-side field errors ({"field": "msg"}) to the form. */
export function applyServerErrors<T extends FieldValues>(setError: UseFormSetError<T>, errors: Record<string, string>) {
  for (const [k, v] of Object.entries(errors)) if (k !== "detail" && k !== "non_field_errors") setError(k as Path<T>, { message: v });
}
