import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-screen max-w-content flex-col px-4 py-8 sm:px-6 sm:py-10 md:flex-row md:items-center md:gap-16 md:px-12">
        <div className="mb-8 md:mb-0 md:flex-1">
          <Link
            href="/marketing"
            className="group inline-flex flex-col gap-3"
            aria-label="Kernle AI home"
          >
            <BrandLogo size="lg" priority />
          </Link>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-body sm:text-label-md">
            Product data that ships clean — enrichment, governance, and channel readiness in one
            editorial workspace.
          </p>
          <div className="mt-8 hidden max-w-sm rounded-lg bg-coral p-8 text-white md:block">
            <p className="font-display text-title-md">
              Catalog teams move faster when the UI stays calm.
            </p>
            <p className="mt-3 text-body-md text-white/90">
              Near-black actions, white canvas, signature surfaces only when they earn the attention.
            </p>
          </div>
        </div>
        <div className="w-full md:max-w-md">{children}</div>
      </div>
    </div>
  );
}
