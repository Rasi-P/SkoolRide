import { Select } from "antd";

interface Props {
  value: unknown;
  onChange: (v: string | undefined) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  width?: number;
}

export function FilterSelect({ value, onChange, options, placeholder, width = 170 }: Props) {
  return (
    <Select
      allowClear
      aria-label={placeholder}
      placeholder={placeholder}
      value={(value as string) || undefined}
      onChange={(v) => onChange(v)}
      options={options}
      style={{ width }}
      showSearch
      optionFilterProp="label"
    />
  );
}
