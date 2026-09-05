import Link from "next/link";
import { CarnalysMark } from "./carnalys-mark";
import { uiCopy, type Locale } from "./copy";

// TODO: replace with a real payment link (Swish/PayPal.me/Buy Me a Coffee/
// Ko-fi) before this goes public — this is a placeholder and must not ship
// pointing at "#".
const DONATION_URL = "#";

const columnHeadingClass = "text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle";
const linkClass = "text-sm text-ink-muted transition hover:text-ink";

export function SiteFooter({ locale }: { locale: Locale }) {
  const copy = uiCopy[locale];

  return (
    <footer className="border-t border-border bg-background px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1800px]">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <Link className="flex items-center gap-2" href="/">
              <CarnalysMark className="size-7 text-ink" />
              <span className="text-sm font-semibold uppercase tracking-[0.16em] text-ink">
                Carnalys
              </span>
            </Link>
            <p className="mt-3 max-w-[32ch] text-sm text-ink-muted">{copy.footer.tagline}</p>
          </div>

          <nav aria-label={copy.footer.exploreHeading}>
            <p className={columnHeadingClass}>{copy.footer.exploreHeading}</p>
            <ul className="mt-3 flex flex-col gap-2">
              <li><Link className={linkClass} href="/">{copy.nav.home}</Link></li>
              <li><Link className={linkClass} href="/compare">{copy.nav.compare}</Link></li>
              <li><Link className={linkClass} href="/analysis">{copy.nav.analysis}</Link></li>
              <li><Link className={linkClass} href="/saved">{copy.nav.saved}</Link></li>
            </ul>
          </nav>

          <nav aria-label={copy.footer.carnalysHeading}>
            <p className={columnHeadingClass}>{copy.footer.carnalysHeading}</p>
            <ul className="mt-3 flex flex-col gap-2">
              <li><Link className={linkClass} href="/about">{copy.footer.about}</Link></li>
              <li><Link className={linkClass} href="/how-it-works">{copy.nav.howItWorks}</Link></li>
              <li><Link className={linkClass} href="/disclaimer">{copy.footer.disclaimerLink}</Link></li>
            </ul>
          </nav>

          <div>
            <p className={columnHeadingClass}>{copy.footer.supportHeading}</p>
            {/* Deliberately quiet: a single small link, not a banner. The
                project should feel like something people can support, not
                something asking to be. */}
            <a
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-accent-strong"
              href={DONATION_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span aria-hidden="true">⛽</span>
              {copy.footer.donate}
            </a>
            <p className="mt-1 text-xs text-ink-subtle">{copy.footer.donateHint}</p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-border pt-6 text-xs text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Carnalys.</p>
          <p>
            {copy.footer.disclaimer}{" "}
            <Link className="underline underline-offset-2 hover:text-ink" href="/disclaimer">
              {copy.footer.readDisclaimer}
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
