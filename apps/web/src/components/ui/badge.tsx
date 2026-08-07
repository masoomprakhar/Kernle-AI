import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2.5 py-0.5 text-caption",
  {
    variants: {
      variant: {
        default: "border-transparent bg-ink text-white",
        secondary: "border-hairline bg-surface-soft text-ink",
        outline: "border-hairline text-body",
        success: "border-success-border bg-canvas text-success",
        warning: "border-transparent bg-cream text-ink",
        danger: "border-transparent bg-peach text-coral",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
