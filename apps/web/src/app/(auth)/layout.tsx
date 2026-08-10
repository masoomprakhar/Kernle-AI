import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-screen max-w-content flex-col px-6 py-10 md:flex-row md:items-center md:gap-16 md:px-12">
        <div className="mb-10 md:mb-0 md:flex-1">
          <Link
            href="/marketing"
            className="group inline-flex flex-col gap-3"
            aria-label="Kernle AI home"
          >
            <span className="inline-flex items-center rounded-md border border-hairline bg-surface-soft/60 px-3 py-2.5 transition-colors group-hover:border-ink/20 group-hover:bg-surface-soft">
              <BrandLogo size="lg" priority />
            </span>
          </Link>
          <p className="mt-5 max-w-md text-label-md text-body">
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
