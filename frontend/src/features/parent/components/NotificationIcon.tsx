import type { ReactNode } from "react";
import {
  AlertOutlined,
  BankOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DisconnectOutlined,
  ExclamationCircleOutlined,
  FieldTimeOutlined,
  FileExclamationOutlined,
  FormOutlined,
  InfoCircleOutlined,
  LoginOutlined,
  LogoutOutlined,
  MessageOutlined,
  NotificationOutlined,
  PlayCircleOutlined,
  UserDeleteOutlined,
  WalletOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { tokens } from "@/app/theme";

type Tone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";

const MAP: Record<string, { icon: ReactNode; tone: Tone }> = {
  ARRIVAL_SOON: { icon: <ClockCircleOutlined />, tone: "primary" },
  ETA_CHANGED: { icon: <FieldTimeOutlined />, tone: "info" },
  BOARDED: { icon: <LoginOutlined />, tone: "success" },
  DROPPED: { icon: <LogoutOutlined />, tone: "success" },
  NO_SHOW: { icon: <UserDeleteOutlined />, tone: "warning" },
  SCHOOL_ARRIVAL: { icon: <BankOutlined />, tone: "success" },
  TRIP_STARTED: { icon: <PlayCircleOutlined />, tone: "primary" },
  TRIP_DELAY: { icon: <WarningOutlined />, tone: "warning" },
  TRIP_CANCELLED: { icon: <CloseCircleOutlined />, tone: "danger" },
  ANNOUNCEMENT: { icon: <NotificationOutlined />, tone: "info" },
  FEE_DUE: { icon: <WalletOutlined />, tone: "warning" },
  FEE_OVERDUE: { icon: <ExclamationCircleOutlined />, tone: "danger" },
  PAYMENT_RECEIVED: { icon: <CheckCircleOutlined />, tone: "success" },
  DOCUMENT_EXPIRY: { icon: <FileExclamationOutlined />, tone: "warning" },
  INCIDENT: { icon: <AlertOutlined />, tone: "danger" },
  COMPLAINT: { icon: <MessageOutlined />, tone: "info" },
  REQUEST_UPDATE: { icon: <FormOutlined />, tone: "primary" },
  GPS_STALE: { icon: <DisconnectOutlined />, tone: "warning" },
  SYSTEM: { icon: <InfoCircleOutlined />, tone: "neutral" },
};

const BG: Record<Tone, string> = { primary: tokens.primarySoft, success: tokens.successSoft, warning: tokens.warningSoft, danger: tokens.dangerSoft, info: tokens.infoSoft, neutral: tokens.neutralSoft };
const FG: Record<Tone, string> = { primary: tokens.primary, success: tokens.success, warning: tokens.warning, danger: tokens.danger, info: tokens.info, neutral: tokens.neutral };

export function NotificationIcon({ category, size = 40 }: { category: string; size?: number }) {
  const m = MAP[category] ?? { icon: <InfoCircleOutlined />, tone: "neutral" as Tone };
  return (
    <div aria-hidden style={{ width: size, height: size, borderRadius: 12, display: "grid", placeItems: "center", background: BG[m.tone], color: FG[m.tone], fontSize: Math.round(size * 0.45), flexShrink: 0 }}>
      {m.icon}
    </div>
  );
}
