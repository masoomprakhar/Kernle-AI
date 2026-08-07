import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FaqSection } from "@/components/marketing/faq";
import { HeroDemo } from "@/components/marketing/hero-demo";

const NAV = [
  ["#platform", "Platform"],
  ["#method", "Method"],
  ["#intelligence", "Intelligence"],
  ["#changelog", "Changelog"],
  ["#faq", "FAQ"],
];

const STORIES = [
  { label: "Retail catalogs", href: "#platform" },
  { label: "Fashion operations", href: "#platform" },
  { label: "Manufacturing SKUs", href: "#platform" },
  { label: "CPG syndication", href: "#platform" },
];

const PLATFORM_PILLARS = [
  {
    title: "Free your team to ship.",
    body: "Kernle handles structure, gaps, and channel rules. Merchandisers spend time on judgment, not reconciliation.",
    panel: "enrich",
  },
  {
    title: "AI digs. You decide.",
    body: "Every lead attribute and description draft is grounded in your data and images, with a confidence score and an explicit accept.",
    panel: "suggest",
  },
  {
    title: "Readiness before publish.",
    body: "New products get validated, scored, and routed to the right channel checklist before they ever cool off in a spreadsheet.",
    panel: "ready",
  },
];

const CONTEXT = [
  {
    title: "It stays structured.",
    body: "Attributes, families, and categories — not untagged paragraphs nobody can reuse.",
  },
  {
    title: "Your tools finally talk.",
    body: "ERP imports, supplier portals, storefronts, and marketplaces stay in sync from one record.",
  },
  {
    title: "Gets sharper over time.",
    body: "Quality scans and enrichment history make the next SKU faster than the last.",
  },
  {
    title: "Ask, and it is there.",
    body: "Completeness, blockers, and drafts — answers from the catalog in seconds.",
  },
  {
    title: "No channel left guessing.",
    body: "Destination rules checked before a single SKU ships downstream.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Ingest",
    body: "Import from spreadsheets, your ERP, or supplier submissions. Kernle maps and validates as data arrives.",
  },
  {
    n: "02",
    title: "Enrich",
    body: "Close gaps with guided editing or AI assistance. Organize into categories. Flag what is still incomplete.",
  },
  {
    n: "03",
    title: "Activate",
    body: "Syndicate approved, validated data to every connected channel. No re-keying. No parallel spreadsheets.",
  },
];

const CHANGELOG = [
  {
    date: "Aug 2026",
    title: "AI enrichment with confidence scores",
    body: "Draft attributes and copy from your own data — nothing saves without accept.",
  },
  {
    date: "Aug 2026",
    title: "Channel readiness checks",
    body: "Validate destination rules before publish so rejections drop downstream.",
  },
  {
    date: "Jul 2026",
    title: "Supplier collection portal",
    body: "Scoped intake for partners, with human approval before anything goes live.",
  },
  {
    date: "Jul 2026",
    title: "Asset library on the product record",
    body: "Packshots, sheets, and video stay linked to the SKUs that use them.",
  },
];

const FOOTER = {
  Product: [
    "Catalog Engine",
    "Asset Library",
    "Supplier Portal",
    "Syndication",
    "AI Enrichment",
    "Integrations",
  ],
  Solutions: ["By Industry", "By Use Case", "By Team Size"],
  Resources: ["Blog", "Guides", "Customer Stories", "Help Center"],
  Company: ["About", "Careers", "Contact", "Security"],
};

function EnrichPanel() {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-5 shadow-cta-soft">
      <p className="text-[12px] font-medium text-muted-foreground">Enrichment queue</p>
      <div className="mt-4 space-y-3">
        {[
          ["Merino Jacket", "Material + care", "8.6"],
          ["Day Pack", "Short description", "7.9"],
          ["Trail Cap", "Color family", "9.1"],
        ].map(([name, field, score]) => (
          <div
            key={name}
            className="flex items-center justify-between rounded-md border border-hairline bg-surface-soft px-3 py-3"
          >
            <div>
              <p className="text-[13px] font-medium text-ink">{name}</p>
              <p className="text-[12px] text-body">{field}</p>
            </div>
            <div className="text-right">
              <p className="text-[12px] font-medium text-link">{score}</p>
              <p className="text-[11px] text-muted-foreground">confidence</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <span className="rounded-lg bg-ink px-3 py-2 text-[12px] font-medium text-white">Accept</span>
        <span className="rounded-lg border border-hairline px-3 py-2 text-[12px] font-medium text-ink">
          Edit
        </span>
      </div>
    </div>
  );
}

function SuggestPanel() {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-5 shadow-cta-soft">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium text-muted-foreground">AI suggestion</p>
        <span className="rounded-pill bg-[rgba(69,143,255,0.16)] px-2 py-0.5 text-[11px] font-medium text-link">
          Grounded
        </span>
      </div>
      <p className="mt-4 text-[15px] font-medium tracking-[-0.015em] text-ink">
        Suggested color: Glacier
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-body">
        Derived from packshot + existing attribute set. No invented specs.
      </p>
      <div className="mt-5 space-y-2">
        {["Uses linked asset IMG-2401", "Matches family: Apparel", "Ready for human review"].map(
          (line) => (
            <div key={line} className="flex items-center gap-2 text-[13px] text-body">
              <Check className="h-3.5 w-3.5 text-success" />
              {line}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function ReadyPanel() {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-5 shadow-cta-soft">
      <p className="text-[12px] font-medium text-muted-foreground">Publish checklist</p>
      <p className="mt-2 text-[16px] font-medium text-ink">Shopify · US</p>
      <div className="mt-5 space-y-3">
        {[
          ["Title", true],
          ["Description", true],
          ["Images (min 2)", true],
          ["Weight", false],
          ["GTIN", false],
        ].map(([label, ok]) => (
          <div key={String(label)} className="flex items-center justify-between text-[13px]">
            <span className="text-body">{label}</span>
            <span className={ok ? "font-medium text-success" : "font-medium text-coral"}>
              {ok ? "Pass" : "Missing"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const PANELS = {
  enrich: EnrichPanel,
  suggest: SuggestPanel,
  ready: ReadyPanel,
};

export function Homepage() {
  return (
    <div className="mkt-page min-h-screen bg-canvas text-body antialiased">
      {/* Announcement — Attio-style top bar */}
      <div className="border-b border-hairline bg-surface-soft">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-6 py-2.5 text-[13px] md:px-8">
          <p className="text-body">
            <span className="font-medium text-ink">Now live</span>
            <span className="mx-2 text-hairline">·</span>
            The first release of Kernle AI. Product data that thinks ahead.
          </p>
          <a
            href="#changelog"
            className="inline-flex shrink-0 items-center gap-1 font-medium text-link hover:text-link-active"
          >
            See what is new
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-hairline/80 bg-canvas/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6 md:px-8">
          <Link
            href="/"
            className="font-display text-[18px] font-semibold tracking-[-0.02em] text-ink"
          >
            Kernle AI
          </Link>
          <nav className="hidden items-center gap-7 text-[14px] text-body md:flex">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} className="transition-colors hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">
                Start free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero — Attio: big claim + dual CTA + interactive product */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(69,143,255,0.22),transparent_55%)]"
        />
        <div className="relative mx-auto max-w-[1200px] px-6 pb-16 pt-16 md:px-8 md:pb-24 md:pt-24">
          <div className="mx-auto max-w-[760px] text-center">
            <p className="mkt-reveal text-[12px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Product data, handled
            </p>
            <h1 className="mkt-reveal mkt-reveal-delay-1 mt-5 font-display text-display-xl tracking-[-0.03em] text-ink md:text-[56px] md:leading-[1.05]">
              Your catalog, finally in one place and finally intelligent.
            </h1>
            <p className="mkt-reveal mkt-reveal-delay-2 mx-auto mt-6 max-w-[52ch] text-[17px] leading-[1.6] text-body">
              Kernle AI centralizes, enriches, and ships product data to storefronts, marketplaces,
              print, and the AI systems that recommend you. One source of truth. Zero spreadsheets.
            </p>
            <div className="mkt-reveal mkt-reveal-delay-3 mt-9 flex flex-wrap items-center justify-center gap-3">
              <Button asChild>
                <Link href="/signup">
                  Start free
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="#method">See the method</Link>
              </Button>
            </div>
          </div>

          <div className="mkt-reveal mkt-reveal-delay-4 mx-auto mt-14 max-w-[980px] md:mt-16">
            <HeroDemo />
          </div>
        </div>
      </section>

      {/* Story / audience strip — Attio customer stories row */}
      <section className="border-y border-hairline">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-6 py-8 md:flex-row md:items-center md:justify-between md:px-8">
          <p className="text-[13px] text-muted-foreground">
            Where growing catalogs go to stop being messy
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {STORIES.map((s) => (
              <a
                key={s.label}
                href={s.href}
                className="inline-flex items-center gap-1 text-[14px] font-medium text-ink transition-colors hover:text-link"
              >
                {s.label}
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Platform — Attio-style large system statement + nested modules */}
      <section id="platform" className="scroll-mt-20 border-b border-hairline">
        <div className="mx-auto max-w-[1200px] px-6 py-20 md:px-8 md:py-28">
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Platform
          </p>
          <h2 className="mt-4 max-w-[22ch] font-display text-display-lg tracking-[-0.025em] text-ink md:text-[44px] md:leading-[1.12]">
            The catalog system that stays accurate. Structures once. Enriches with review. Publishes
            everywhere it needs to go.
          </h2>
          <p className="mt-6 max-w-[54ch] text-[16px] leading-[1.65] text-body">
            Kernle AI is where product data lives, gets enriched, and gets sent out — instead of
            being copy-pasted sixty different ways.
          </p>

          <div className="mt-16 space-y-6">
            {PLATFORM_PILLARS.map((pillar, i) => {
              const Panel = PANELS[pillar.panel as keyof typeof PANELS];
              const wash =
                i === 0
                  ? "bg-[rgba(69,143,255,0.12)]"
                  : i === 1
                    ? "bg-[rgba(27,97,201,0.08)]"
                    : "bg-[rgba(37,79,173,0.06)]";
              return (
                <div
                  key={pillar.title}
                  className={`grid items-center gap-8 rounded-lg p-6 md:grid-cols-2 md:gap-12 md:p-10 ${wash}`}
                >
                  <div>
                    <h3 className="font-display text-display-md tracking-[-0.02em] text-ink md:text-[28px]">
                      {pillar.title}
                    </h3>
                    <p className="mt-4 max-w-[40ch] text-[15px] leading-[1.65] text-body">
                      {pillar.body}
                    </p>
                  </div>
                  <Panel />
                </div>
              );
            })}
          </div>

          {/* Capability list — denser Attio-style feature grid */}
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Catalog Engine",
                body: "Families, attributes, and categories that match how you sell.",
              },
              {
                title: "Asset Library",
                body: "Packshots and sheets on the same record as the product.",
              },
              {
                title: "Supplier Collection",
                body: "Scoped portals. Your team approves before anything goes live.",
              },
              {
                title: "Syndication",
                body: "Push validated data to storefronts and marketplaces.",
              },
              {
                title: "Data Quality",
                body: "Scans for missing fields, ranked by what matters most.",
              },
              {
                title: "AI Enrichment",
                body: "Drafts with confidence scores. People make the call.",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="rounded-lg border border-hairline bg-canvas p-6 transition-colors hover:bg-surface-soft"
              >
                <h3 className="text-title-sm text-ink">{item.title}</h3>
                <p className="mt-2 text-[14px] leading-[1.6] text-body">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Self-building analog — Live from day one */}
      <section className="border-b border-hairline bg-surface-soft">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-6 py-20 md:grid-cols-2 md:px-8 md:py-28">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Live from day one
            </p>
            <h2 className="mt-4 max-w-[16ch] font-display text-display-lg tracking-[-0.025em] text-ink md:text-[40px]">
              Import once. The catalog organizes around how you sell.
            </h2>
            <p className="mt-5 max-w-[42ch] text-[15px] leading-[1.65] text-body">
              Connect a spreadsheet, ERP export, or supplier feed. Kernle maps fields, flags gaps,
              and gives you a working catalog before the team finishes onboarding.
            </p>
            <div className="mt-8">
              <Button variant="secondary" asChild>
                <Link href="/signup">
                  Start free
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-hairline bg-canvas p-6 shadow-cta-soft">
            <p className="text-[12px] font-medium text-muted-foreground">Product record</p>
            <p className="mt-2 text-[18px] font-medium tracking-[-0.02em] text-ink">Merino Jacket</p>
            <p className="text-[13px] text-muted-foreground">JKT-WOOL-12 · Apparel</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                ["Material", "Merino wool"],
                ["Care", "Hand wash"],
                ["Color", "Glacier"],
                ["Completeness", "71%"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md bg-surface-soft px-3 py-3">
                  <p className="text-[11px] font-medium text-muted-foreground">{k}</p>
                  <p className="mt-1 text-[13px] font-medium text-ink">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-md border border-hairline bg-cream/60 px-3 py-3 text-[13px] text-body">
              Summary: Structured for Ecommerce · en_US. 3 fields still blocking publish.
            </div>
          </div>
        </div>
      </section>

      {/* Universal context analog */}
      <section id="intelligence" className="scroll-mt-20 border-b border-hairline">
        <div className="mx-auto max-w-[1200px] px-6 py-20 md:px-8 md:py-28">
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Intelligence
          </p>
          <h2 className="mt-4 max-w-[20ch] font-display text-display-lg tracking-[-0.025em] text-ink md:text-[44px]">
            Your product data now has two audiences: people, and machines.
          </h2>
          <p className="mt-5 max-w-[54ch] text-[16px] leading-[1.65] text-body">
            AI shopping assistants and recommendation engines cannot recommend what they cannot
            understand. Kernle structures your data so both audiences get what they need.
          </p>

          <div className="mt-14 grid gap-px overflow-hidden rounded-lg border border-hairline bg-hairline md:grid-cols-5">
            {CONTEXT.map((item) => (
              <div key={item.title} className="bg-canvas p-5 md:p-6">
                <h3 className="text-[15px] font-medium tracking-[-0.015em] text-ink">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-[1.6] text-body">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Method — Attio clean 3-up */}
      <section id="method" className="scroll-mt-20 border-b border-hairline bg-surface-soft">
        <div className="mx-auto max-w-[1200px] px-6 py-20 md:px-8 md:py-28">
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Method
          </p>
          <h2 className="mt-4 max-w-[18ch] font-display text-display-lg tracking-[-0.025em] text-ink md:text-[40px]">
            From messy to market-ready in three steps.
          </h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.n} className="rounded-lg border border-hairline bg-canvas p-7">
                <p className="text-[13px] font-medium text-link">{step.n}</p>
                <h3 className="mt-4 font-display text-[28px] tracking-[-0.02em] text-ink">
                  {step.title}
                </h3>
                <p className="mt-3 text-[14px] leading-[1.65] text-body">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Evidence + pricing teaser */}
      <section className="border-b border-hairline">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-6 py-20 md:grid-cols-2 md:px-8 md:py-24">
          <div className="rounded-lg bg-[rgba(37,79,173,0.06)] p-8 md:p-10">
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Evidence
            </p>
            <h2 className="mt-3 max-w-[16ch] font-display text-[28px] tracking-[-0.02em] text-ink">
              Teams switch when spreadsheets stop scaling.
            </h2>
            <p className="mt-4 max-w-[40ch] text-[14px] leading-[1.65] text-body">
              Named outcomes and permissioned quotes will live here. Until then we will not invent
              logos, testimonials, or metrics.
            </p>
          </div>
          <div
            id="pricing"
            className="scroll-mt-20 rounded-lg bg-[rgba(69,143,255,0.14)] p-8 md:p-10"
          >
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Commercial
            </p>
            <h2 className="mt-3 max-w-[16ch] font-display text-[28px] tracking-[-0.02em] text-ink">
              Plans that scale with your catalog, not against it.
            </h2>
            <p className="mt-4 max-w-[40ch] text-[14px] leading-[1.65] text-body">
              Start free with a limited SKU count. Upgrade as your catalog, and your ambitions, grow.
            </p>
            <div className="mt-8">
              <Button variant="secondary" asChild>
                <Link href="/signup">See pricing</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Changelog — Attio pattern */}
      <section id="changelog" className="scroll-mt-20 border-b border-hairline">
        <div className="mx-auto max-w-[1200px] px-6 py-20 md:px-8 md:py-28">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Changelog
              </p>
              <h2 className="mt-4 max-w-[16ch] font-display text-display-lg tracking-[-0.025em] text-ink md:text-[40px]">
                Better as you grow.
              </h2>
            </div>
            <p className="max-w-[36ch] text-[14px] leading-[1.6] text-body">
              New capabilities as the catalog expands — without another spreadsheet migration.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {CHANGELOG.map((item) => (
              <article
                key={item.title}
                className="rounded-lg border border-hairline bg-canvas p-6 transition-colors hover:bg-surface-soft"
              >
                <p className="text-[12px] font-medium text-muted-foreground">{item.date}</p>
                <h3 className="mt-2 text-title-sm text-ink">{item.title}</h3>
                <p className="mt-2 text-[14px] leading-[1.6] text-body">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-b border-hairline">
        <div className="mx-auto grid max-w-[1200px] gap-12 px-6 py-20 md:grid-cols-12 md:px-8 md:py-28">
          <div className="md:col-span-4">
            <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              FAQ
            </p>
            <h2 className="mt-4 font-display text-display-md tracking-[-0.02em] text-ink md:text-[36px]">
              Direct answers.
            </h2>
            <p className="mt-4 text-[14px] leading-[1.65] text-body">
              Straight talk about what Kernle does, and what it deliberately does not.
            </p>
          </div>
          <div className="md:col-span-8">
            <FaqSection />
          </div>
        </div>
      </section>

      {/* Final CTA — Attio closing band */}
      <section className="border-b border-hairline bg-surface-soft">
        <div className="mx-auto max-w-[1200px] px-6 py-24 text-center md:px-8 md:py-32">
          <h2 className="mx-auto max-w-[16ch] font-display text-display-lg tracking-[-0.03em] text-ink md:text-[48px] md:leading-[1.08]">
            Your catalog is ready for this. Is your data?
          </h2>
          <p className="mx-auto mt-5 max-w-[42ch] text-[16px] leading-[1.65] text-body">
            Bring your product data into one place, and let Kernle AI help you keep it that way.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <Link href="/signup">
                Start free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/signup">Talk to sales</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="bg-canvas">
        <div className="mx-auto max-w-[1200px] px-6 py-16 md:px-8">
          <div className="grid gap-10 md:grid-cols-5">
            <div>
              <p className="font-display text-[15px] font-semibold tracking-[-0.02em] text-ink">
                Kernle AI
              </p>
              <p className="mt-3 max-w-[28ch] text-[13px] leading-relaxed text-muted-foreground">
                Product data infrastructure for teams that ship across channels.
              </p>
            </div>
            {Object.entries(FOOTER).map(([col, links]) => (
              <div key={col}>
                <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {col}
                </p>
                <ul className="mt-4 space-y-2.5 text-[13px] text-body">
                  {links.map((link) => (
                    <li key={link}>{link}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-14 flex flex-wrap gap-x-6 gap-y-2 border-t border-hairline pt-6 text-[12px] text-muted-foreground">
            <span>Terms of Service</span>
            <span>Privacy Policy</span>
            <span>Cookie Settings</span>
            <span className="md:ml-auto">© {new Date().getFullYear()} Kernle AI</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
