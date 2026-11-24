import { useQuery } from "@tanstack/react-query";
import { Card, List, Progress, Typography } from "antd";
import { CheckCircleFilled, ClockCircleOutlined } from "@ant-design/icons";
import { tokens } from "@/app/theme";
import { QueryState } from "@/components/ui/States";
import { platformApi, platformKeys } from "../../api";
import type { OnboardingProgress, SchoolDetail } from "../../types";

export function SchoolOnboardingTab({ school }: { school: SchoolDetail }) {
  const query = useQuery({ queryKey: platformKeys.schoolOnboarding(school.id), queryFn: () => platformApi.schoolOnboarding(school.id) });
  return (
    <QueryState query={query}>
      {(p: OnboardingProgress) => {
        const percent = p.total_steps > 0 ? Math.round((p.completed_steps / p.total_steps) * 100) : 0;
        return (
          <Card
            size="small"
            title="Onboarding checklist"
            extra={
              <span className="sbp-muted">
                {p.completed_steps} of {p.total_steps} steps
              </span>
            }
          >
            <Progress percent={percent} status={p.completed ? "success" : "active"} aria-label={`Onboarding ${percent}% complete`} />
            <List
              dataSource={p.steps}
              renderItem={(s) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      s.done ? (
                        <CheckCircleFilled style={{ color: tokens.success, fontSize: 20 }} aria-label="Completed" />
                      ) : (
                        <ClockCircleOutlined style={{ color: tokens.textMuted, fontSize: 20 }} aria-label="Not completed" />
                      )
                    }
                    title={<span style={{ color: s.done ? tokens.textMuted : undefined }}>{s.label}</span>}
                    description={<span style={{ fontSize: 12 }}>{s.done ? "Completed" : `Pending - done by the school admin under ${s.href}`}</span>}
                  />
                </List.Item>
              )}
            />
            {school.onboarding_dismissed && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                The school admin dismissed the onboarding guide in their console.
              </Typography.Text>
            )}
          </Card>
        );
      }}
    </QueryState>
  );
}
