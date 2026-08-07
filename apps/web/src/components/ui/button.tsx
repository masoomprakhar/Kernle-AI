import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-button transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info-border focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "rounded-lg bg-ink px-6 py-4 text-white shadow-cta-soft active:bg-ink-active",
        secondary:
          "rounded-lg border border-hairline bg-canvas px-6 py-4 text-ink active:bg-surface-soft",
        outline:
          "rounded-lg border border-hairline bg-canvas px-6 py-4 text-ink active:bg-surface-soft",
        ghost: "rounded-lg px-3 py-2 text-body active:bg-surface-soft",
        link: "text-link text-body-md active:text-link-active",
        destructive: "rounded-lg bg-coral px-6 py-4 text-white active:bg-ink-active",
        pill: "rounded-pill border border-hairline bg-canvas px-6 py-3 text-pricing-ink",
        legal: "rounded-xs bg-link px-2.5 py-3 text-[13.12px] font-semibold text-white",
        icon: "h-10 w-10 rounded-full border border-hairline bg-canvas text-ink active:bg-surface-soft",
      },
      size: {
        default: "",
        sm: "px-4 py-2 text-sm",
        lg: "px-6 py-4",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
