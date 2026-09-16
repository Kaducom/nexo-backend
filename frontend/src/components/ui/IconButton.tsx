import type { ReactNode } from "react";
import {
  motion,
  type HTMLMotionProps
} from "framer-motion";

interface IconButtonProps
  extends Omit<HTMLMotionProps<"button">, "children"> {
  icon: ReactNode;
  label: string;
  variant?: "default" | "primary" | "danger";
}

export default function IconButton({
  icon,
  label,
  variant = "default",
  className = "",
  disabled,
  ...props
}: IconButtonProps) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      whileHover={
        disabled
          ? undefined
          : { y: -1 }
      }
      whileTap={
        disabled
          ? undefined
          : { scale: 0.94 }
      }
      className={[
        "nexo-icon-button",
        `nexo-icon-button-${variant}`,
        className
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      {...props}
    >
      {icon}
    </motion.button>
  );
}