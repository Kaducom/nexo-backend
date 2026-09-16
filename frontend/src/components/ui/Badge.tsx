import type { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?:
    | "default"
    | "primary"
    | "success"
    | "warning"
    | "danger";
}

export default function Badge({
  children,
  variant = "default"
}: BadgeProps) {
  return (
    <span className={`nexo-badge nexo-badge-${variant}`}>
      {children}
    </span>
  );
}