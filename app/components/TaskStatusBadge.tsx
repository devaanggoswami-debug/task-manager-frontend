import { statusLabel, type TaskStatus } from "@/lib/api";
import Icon, { type IconName } from "./Icon";

export const STATUS_ICON: Record<TaskStatus, IconName> = {
  not_started: "statusNotStarted",
  in_progress: "statusInProgress",
  blocked: "statusBlocked",
  done: "statusDone",
};

export default function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <Icon name={STATUS_ICON[status]} size={16} />
      {statusLabel(status)}
    </span>
  );
}
