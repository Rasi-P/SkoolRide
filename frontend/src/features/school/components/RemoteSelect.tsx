import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Form, Select } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { listAll } from "../api";

export interface RemoteOption {
  value: string;
  label: string;
}

interface Props<T> {
  path: string;
  queryKey: string;
  params?: Record<string, unknown>;
  toOption: (item: T) => RemoteOption;
  value?: string | null;
  onChange: (value: string | null, item: T | null) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  id?: string;
  /** Label for a pre-selected value that is not in the current result set (e.g. editing). */
  valueLabel?: string | null;
  style?: React.CSSProperties;
  mode?: "multiple";
  values?: string[];
  onChangeMany?: (values: string[]) => void;
}

/** Server-searched select (students, parents, invoices...). Debounces the search term and queries with `?search=`. */
export function RemoteSelect<T>({ path, queryKey, params, toOption, value, onChange, placeholder = "Search...", disabled, allowClear = true, id, valueLabel, style, mode, values, onChangeMany }: Props<T>) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(term.trim()), 300);
    return () => window.clearTimeout(t);
  }, [term]);
  const query = useQuery({
    queryKey: [queryKey, "remote", debounced, params ?? {}],
    queryFn: () => listAll<T>(path, { ...(params ?? {}), search: debounced || undefined, page_size: 30 }),
    staleTime: 30_000,
  });
  const options = useMemo(() => {
    const opts = (query.data ?? []).map(toOption);
    if (value && valueLabel && !opts.some((o) => o.value === value)) opts.unshift({ value, label: valueLabel });
    return opts;
  }, [query.data, toOption, value, valueLabel]);
  return (
    <Select
      id={id}
      showSearch
      filterOption={false}
      onSearch={setTerm}
      loading={query.isFetching}
      options={options}
      value={mode === "multiple" ? values : (value ?? undefined)}
      mode={mode}
      onChange={(v) => {
        if (mode === "multiple") onChangeMany?.((v as string[]) ?? []);
        else {
          const item = (query.data ?? []).find((it) => toOption(it).value === v) ?? null;
          onChange((v as string | undefined) ?? null, item);
        }
      }}
      placeholder={placeholder}
      disabled={disabled}
      allowClear={allowClear}
      notFoundContent={query.isFetching ? "Searching..." : "No matches"}
      style={{ width: "100%", ...style }}
      aria-label={placeholder}
    />
  );
}

interface FieldProps<F extends FieldValues, T> extends Omit<Props<T>, "value" | "onChange"> {
  control: Control<F>;
  name: Path<F>;
  label?: ReactNode;
  required?: boolean;
  help?: ReactNode;
  onSelect?: (item: T | null) => void;
}

/** react-hook-form binding for RemoteSelect. */
export function RemoteSelectField<F extends FieldValues, T>({ control, name, label, required, help, onSelect, ...rest }: FieldProps<F, T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label ? <label htmlFor={name}>{label}</label> : undefined} required={required} validateStatus={fieldState.error ? "error" : undefined} help={fieldState.error?.message || help} colon={false} style={{ marginBottom: 16 }}>
          <RemoteSelect<T>
            {...rest}
            id={name}
            value={(field.value as string | null) ?? null}
            onChange={(v, item) => {
              field.onChange(v);
              onSelect?.(item);
            }}
          />
        </Form.Item>
      )}
    />
  );
}
