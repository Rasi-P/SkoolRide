import { Tabs } from "antd";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { SettingsTab } from "./SettingsTab";
import { TemplatesTab } from "./TemplatesTab";

export default function PlatformSettingsPage() {
  const [params, setParams] = useSearchParams();
  return (
    <div>
      <PageHeader title="Platform settings" subtitle="Global configuration and the default notification templates every school inherits." />
      <Tabs
        activeKey={params.get("tab") || "settings"}
        onChange={(k) => setParams({ tab: k })}
        items={[
          { key: "settings", label: "Platform settings", children: <SettingsTab /> },
          { key: "templates", label: "Notification templates", children: <TemplatesTab /> },
        ]}
      />
    </div>
  );
}
