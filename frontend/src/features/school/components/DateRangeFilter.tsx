import { DatePicker } from "antd";
import { dayjs } from "@/lib/format";

export type DateRange = [string, string] | null;

interface Props {
  value: DateRange;
  onChange: (v: DateRange) => void;
  allowClear?: boolean;
}

/** YYYY-MM-DD range picker with quick presets. */
export function DateRangeFilter({ value, onChange, allowClear = true }: Props) {
  const today = dayjs();
  return (
    <DatePicker.RangePicker
      aria-label="Date range"
      allowClear={allowClear}
      value={value ? [dayjs(value[0]), dayjs(value[1])] : null}
      format="DD MMM YYYY"
      onChange={(v) => onChange(v && v[0] && v[1] ? [v[0].format("YYYY-MM-DD"), v[1].format("YYYY-MM-DD")] : null)}
      presets={[
        { label: "Today", value: [today, today] },
        { label: "Last 7 days", value: [today.subtract(6, "day"), today] },
        { label: "Last 30 days", value: [today.subtract(29, "day"), today] },
        { label: "This month", value: [today.startOf("month"), today.endOf("month")] },
        { label: "Next 7 days", value: [today, today.add(6, "day")] },
      ]}
    />
  );
}

export const lastDays = (n: number): DateRange => [dayjs().subtract(n - 1, "day").format("YYYY-MM-DD"), dayjs().format("YYYY-MM-DD")];
export const nextDays = (n: number): DateRange => [dayjs().format("YYYY-MM-DD"), dayjs().add(n - 1, "day").format("YYYY-MM-DD")];
