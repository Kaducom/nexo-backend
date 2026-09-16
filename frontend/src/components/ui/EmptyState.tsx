import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon,
  title,
  description,
  action
}: EmptyStateProps) {
  return (
    <div className="nexo-empty-state">
      {icon && (
        <div className="nexo-empty-state-icon">
          {icon}
        </div>
      )}

      <strong>{title}</strong>

      {description && <p>{description}</p>}

      {action && (
        <div className="nexo-empty-state-action">
          {action}
        </div>
      )}
    </div>
  );
}