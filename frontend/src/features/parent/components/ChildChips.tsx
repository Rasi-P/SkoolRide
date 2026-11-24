import { NameAvatar } from "@/components/ui/Misc";
import { useParent } from "../context";

/** Large tap targets to switch the selected child. Hidden when there is only one child. */
export function ChildChips({ variant = "default" }: { variant?: "default" | "hero" }) {
  const { children, selectedId, setSelected } = useParent();
  if (children.length < 2) return null;
  const hero = variant === "hero";
  return (
    <div role="radiogroup" aria-label="Select child" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {children.map((c) => {
        const active = c.id === selectedId;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setSelected(c.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              minHeight: 44,
              padding: "6px 14px 6px 6px",
              borderRadius: 999,
              cursor: "pointer",
              font: "inherit",
              fontWeight: 600,
              border: hero ? "1px solid rgba(255,255,255,0.35)" : active ? "1px solid var(--sbp-primary)" : "1px solid var(--sbp-border)",
              background: hero ? (active ? "#fff" : "rgba(255,255,255,0.12)") : active ? "var(--sbp-primary-soft)" : "var(--sbp-surface)",
              color: hero ? (active ? "var(--sbp-primary)" : "#fff") : active ? "var(--sbp-primary)" : "var(--sbp-text)",
            }}
          >
            <NameAvatar name={c.name} src={c.photo} size={30} />
            <span>
              {c.first_name}
              <span style={{ fontWeight: 400, opacity: 0.8 }}> · {c.class_label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
