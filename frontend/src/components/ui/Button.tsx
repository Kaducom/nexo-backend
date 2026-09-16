import type { ReactNode } from "react";
import {
  motion,
  type HTMLMotionProps
} from "framer-motion";

interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "children"> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  icon?: ReactNode;
}

export default function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  icon,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileHover={
        disabled
          ? undefined
          : { y: -1 }
      }
      whileTap={
        disabled
          ? undefined
          : { scale: 0.98 }
      }
      className={[
        "nexo-button",
        `nexo-button-${variant}`,
        `nexo-button-${size}`,
        fullWidth ? "nexo-button-full" : "",
        className
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      {...props}
    >
      {icon && (
        <span className="nexo-button-icon">
          {icon}
        </span>
      )}

      <span>{children}</span>
    </motion.button>
  );
}