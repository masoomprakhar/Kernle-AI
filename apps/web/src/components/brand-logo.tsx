import Image from "next/image";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { className: "h-6 w-auto", width: 120, height: 31 },
  md: { className: "h-8 w-auto", width: 160, height: 41 },
  lg: { className: "h-10 w-auto md:h-12", width: 220, height: 56 },
} as const;

type BrandLogoProps = {
  size?: keyof typeof SIZES;
  className?: string;
  priority?: boolean;
};

/** Shared Kernle wordmark — use everywhere a logo appears. */
export function BrandLogo({ size = "md", className, priority }: BrandLogoProps) {
  const s = SIZES[size];
  return (
    <Image
      src="/kernle-logo.png"
      alt="Kernle AI"
      width={s.width}
      height={s.height}
      className={cn(s.className, className)}
      priority={priority}
    />
  );
}
