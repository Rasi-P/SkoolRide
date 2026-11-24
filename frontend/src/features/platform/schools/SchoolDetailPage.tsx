import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Tabs, Tag, message } from "antd";
import { PlayCircleOutlined, StopOutlined } from "@ant-design/icons";
import { useParams, useSearchParams } from "react-router-dom";
import { errorMessage } from "@/api/client";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDateTime } from "@/lib/format";
import { platformApi, platformKeys } from "../api";
import type { SchoolDetail } from "../types";
import { SuspendModal } from "./SuspendModal";
import { SchoolAdminsTab } from "./tabs/SchoolAdminsTab";
import { SchoolOnboardingTab } from "./tabs/SchoolOnboardingTab";
import { SchoolOverviewTab } from "./tabs/SchoolOverviewTab";
import { SchoolSubscriptionTab } from "./tabs/SchoolSubscriptionTab";

export default function SchoolDetailPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const [suspending, setSuspending] = useState(false);
  const query = useQuery({ queryKey: platformKeys.school(id), queryFn: () => platformApi.school(id), enabled: !!id });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: platformKeys.school(id) });
    qc.invalidateQueries({ queryKey: [platformKeys.schools] });
    qc.invalidateQueries({ queryKey: platformKeys.overview });
  };
  const reactivate = useMutation({
    mutationFn: () => platformApi.reactivateSchool(id),
    onSuccess: (s) => {
      message.success(`${s.name} is now active`);
      invalidate();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <QueryState query={query}>
      {(school: SchoolDetail) => {
        const canReactivate = school.status === "SUSPENDED" || school.status === "INACTIVE" || school.status === "APPROVED";
        const canSuspend = school.status !== "SUSPENDED";
        const reactivateLabel = school.status === "APPROVED" ? "Activate" : "Reactivate";
        return (
          <div>
            <PageHeader
              crumbs={[{ label: "Schools", to: "/platform/schools" }, { label: school.name }]}
              title={
                <span className="sbp-row" style={{ flexWrap: "wrap" }}>
                  {school.name}
                  <StatusBadge status={school.status} />
                  {!school.is_operational && (
                    <Tag color="red" style={{ marginInlineEnd: 0 }}>
                      Not operational
                    </Tag>
                  )}
                </span>
              }
              subtitle={
                <>
                  <span className="sbp-mono">{school.code}</span> · {school.full_address || "No address on file"} · {school.timezone}
                </>
              }
              extra={
                <>
                  {canReactivate && (
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      loading={reactivate.isPending}
                      onClick={() =>
                        confirmAction({
                          title: `${reactivateLabel} ${school.name}?`,
                          content: "The school and all of its users regain access immediately.",
                          okText: reactivateLabel,
                          onOk: () => reactivate.mutateAsync(),
                        })
                      }
                    >
                      {reactivateLabel}
                    </Button>
                  )}
                  {canSuspend && (
                    <Button danger icon={<StopOutlined />} onClick={() => setSuspending(true)}>
                      Suspend
                    </Button>
                  )}
                </>
              }
            />
            {school.status === "SUSPENDED" && (
              <Alert
                type="error"
                showIcon
                message={`Suspended ${fmtDateTime(school.suspended_at)}`}
                description={school.suspension_reason || "No reason recorded."}
                style={{ marginBottom: 16 }}
              />
            )}
            {school.status === "ACTIVE" && school.subscription && !school.subscription.is_usable && (
              <Alert
                type="warning"
                showIcon
                message="Subscription is not usable"
                description={`The ${school.subscription.plan_name} subscription is ${school.subscription.status.toLowerCase().replace("_", " ")}${
                  school.subscription.ends_at ? ` (ends ${fmtDateTime(school.subscription.ends_at)})` : ""
                }. Users cannot operate the school until it is fixed in the Subscription tab.`}
                style={{ marginBottom: 16 }}
              />
            )}
            <Tabs
              activeKey={params.get("tab") || "overview"}
              onChange={(k) => setParams({ tab: k })}
              items={[
                { key: "overview", label: "Overview", children: <SchoolOverviewTab school={school} onSaved={invalidate} /> },
                { key: "subscription", label: "Subscription", children: <SchoolSubscriptionTab school={school} onSaved={invalidate} /> },
                { key: "admins", label: "Admins & invitations", children: <SchoolAdminsTab school={school} /> },
                { key: "onboarding", label: "Onboarding", children: <SchoolOnboardingTab school={school} /> },
              ]}
            />
            <SuspendModal school={school} open={suspending} onClose={() => setSuspending(false)} onDone={invalidate} />
          </div>
        );
      }}
    </QueryState>
  );
}
