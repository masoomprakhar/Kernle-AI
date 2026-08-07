import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-[88px] w-full rounded-sm border border-hairline bg-canvas px-4 py-3 text-body-md text-ink placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info-border disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
