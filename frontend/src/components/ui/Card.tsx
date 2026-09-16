import type { HTMLAttributes, ReactNode } from "react";
import { motion } from "framer-motion";
import { cardMotion } from "../../design/motion";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  animated?: boolean;
  interactive?: boolean;
}

export default function Card({
  children,
  animated = true,
  interactive = false,
  className = "",
  ...props
}: CardProps) {
  const classes = [
    "nexo-ui-card",
    interactive ? "nexo-ui-card-interactive" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  if (!animated) {
    return (
      <div className={classes} {...props}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={classes}
      variants={cardMotion}
      initial="hidden"
      animate="visible"
      whileHover={
        interactive
          ? {
              y: -2,
              transition: { duration: 0.18 }
            }
          : undefined
      }
    >
      {children}
    </motion.div>
  );
}