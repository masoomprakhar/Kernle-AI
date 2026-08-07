import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-screen max-w-content flex-col px-6 py-10 md:flex-row md:items-center md:gap-16 md:px-12">
        <div className="mb-10 md:mb-0 md:flex-1">
          <Link href="/marketing" className="inline-block">
            <p className="font-display text-display-md font-semibold text-ink md:text-display-lg">
              Kernle AI
            </p>
          </Link>
          <p className="mt-4 max-w-md text-label-md text-body">
            Product data that ships clean — enrichment, governance, and channel readiness in one
            editorial workspace.
          </p>
          <div className="mt-8 hidden max-w-sm rounded-lg bg-coral p-8 text-white md:block">
            <p className="font-display text-title-md">Catalog teams move faster when the UI stays calm.</p>
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
