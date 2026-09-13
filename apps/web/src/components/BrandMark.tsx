import type { ReactNode } from "react";

interface BrandMarkProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

export function BrandMark({ children = "N", className }: BrandMarkProps) {
  const classes = className ? `brand-mark ${className}` : "brand-mark";
  return (
    <span className={classes} aria-hidden="true">
      {children}
    </span>
  );
}
