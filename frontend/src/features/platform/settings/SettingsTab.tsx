import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, InputNumber, Switch, Typography, message } from "antd";
import { errorMessage } from "@/api/client";
import { QueryState } from "@/components/ui/States";
import { fromNow } from "@/lib/format";
import { platformApi, platformKeys } from "../api";
import type { PlatformSetting } from "../types";

type Kind = "boolean" | "number" | "string" | "json";
const kindOf = (v: unknown): Kind => (typeof v === "boolean" ? "boolean" : typeof v === "number" ? "number" : typeof v === "string" ? "string" : "json");
const KIND_LABEL: Record<Kind, string> = { boolean: "On / off", number: "Number", string: "Text", json: "JSON" };

export function SettingsTab() {
  const query = useQuery({ queryKey: platformKeys.settings, queryFn: platformApi.settings });
  return (
    <QueryState query={query} isEmpty={(d) => d.length === 0} emptyTitle="No platform settings" emptyDescription="Settings are seeded by the backend.">
      {(items: PlatformSetting[]) => (
        <div className="sbp-stack">
          {items.map((s) => (
            // keyed on updated_at so a saved value remounts the editor with fresh state
            <SettingRow key={`${s.key}:${s.updated_at}`} setting={s} />
          ))}
        </div>
      )}
    </QueryState>
  );
}

function SettingRow({ setting }: { setting: PlatformSetting }) {
  const qc = useQueryClient();
  const kind = kindOf(setting.value);
  const original = kind === "json" ? JSON.stringify(setting.value, null, 2) : String(setting.value ?? "");
  const [text, setText] = useState(original);
  const [num, setNum] = useState<number | null>(kind === "number" ? (setting.value as number) : null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (value: unknown) => platformApi.updateSetting(setting.key, value),
    onSuccess: () => {
      message.success(`Saved ${setting.key}`);
      qc.invalidateQueries({ queryKey: platformKeys.settings });
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const dirty = kind === "number" ? num !== setting.value : kind === "boolean" ? false : text !== original;
  const inputId = `setting-${setting.key}`;

  const submit = () => {
    if (kind === "number") {
      if (num === null) {
        message.error("Enter a number");
        return;
      }
      save.mutate(num);
    } else if (kind === "string") {
      save.mutate(text);
    } else if (kind === "json") {
      try {
        const parsed: unknown = JSON.parse(text);
        setJsonError(null);
        save.mutate(parsed);
      } catch (e) {
        setJsonError(e instanceof Error ? e.message : "Invalid JSON");
      }
    }
  };
  const reset = () => {
    setText(original);
    setNum(kind === "number" ? (setting.value as number) : null);
    setJsonError(null);
  };

  return (
    <div className="sbp-surface" style={{ padding: 16 }}>
      <div className="sbp-between" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <label htmlFor={inputId} style={{ fontWeight: 600 }} className="sbp-mono">
            {setting.key}
          </label>
          <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
            {setting.description || "No description"} · {KIND_LABEL[kind]} · updated {fromNow(setting.updated_at)}
          </Typography.Text>
        </div>
        {kind === "boolean" && (
          <Switch id={inputId} checked={setting.value as boolean} loading={save.isPending} onChange={(v) => save.mutate(v)} aria-label={setting.key} />
        )}
      </div>
      {kind !== "boolean" && (
        <div style={{ marginTop: 12 }}>
          {kind === "number" && (
            <InputNumber id={inputId} value={num} onChange={(v) => setNum(typeof v === "number" ? v : v === null || v === "" ? null : Number(v))} style={{ width: 220 }} />
          )}
          {kind === "string" && <Input id={inputId} value={text} onChange={(e) => setText(e.target.value)} style={{ maxWidth: 520 }} />}
          {kind === "json" && (
            <Input.TextArea
              id={inputId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(14, Math.max(3, text.split("\n").length))}
              status={jsonError ? "error" : undefined}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}
              aria-describedby={jsonError ? `${inputId}-error` : undefined}
            />
          )}
          {jsonError && (
            <div id={`${inputId}-error`} role="alert" style={{ color: "var(--sbp-danger)", fontSize: 12, marginTop: 4 }}>
              {jsonError}
            </div>
          )}
          <div className="sbp-row" style={{ marginTop: 10 }}>
            <Button type="primary" size="small" onClick={submit} loading={save.isPending} disabled={!dirty}>
              Save
            </Button>
            <Button size="small" onClick={reset} disabled={!dirty}>
              Reset
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
