export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        background: "#f8fafc",
        border: "1px solid var(--sbp-border)",
        borderRadius: 10,
        fontSize: 12,
        lineHeight: 1.5,
        overflowX: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
