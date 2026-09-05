"use client";

import { StaticPageShell } from "@/features/search/static-page-shell";

const sectionHeading = "mt-8 text-lg font-semibold tracking-[-0.01em] text-ink";
const paragraph = "mt-3 text-[15px] leading-relaxed text-ink-muted";

function DisclaimerEn() {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-accent-strong">
        Please read
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
        Disclaimer
      </h1>
      <p className={paragraph}>
        Carnalys is a personal project built to help make sense of the used car market. It is
        not a licensed valuer, insurer, or financial adviser. Please read this before making any
        real decisions based on what you see here.
      </p>

      <h2 className={sectionHeading}>Estimates, not guarantees</h2>
      <p className={paragraph}>
        Deal Score, market value, buy confidence and estimated ownership cost are all
        statistical estimates calculated from listing data. They are not appraisals,
        valuations, or promises about what a car is actually worth or will actually cost you.
        Treat every number on Carnalys as a starting point for your own judgement, not a
        substitute for it.
      </p>

      <h2 className={sectionHeading}>Insurance estimates are a screening tool</h2>
      <p className={paragraph}>
        The insurance figure in ownership cost is a rough, model based estimate meant to flag
        cars that are likely to be unusually expensive or cheap to insure. It is not a quote and
        will not match what any specific insurer actually charges you. Always get a real quote
        from an insurer before buying a car, especially if Carnalys flags it as high risk.
      </p>

      <h2 className={sectionHeading}>Listing data comes from third parties</h2>
      <p className={paragraph}>
        Car listings are sourced from third party Swedish marketplaces and dealer sites.
        Carnalys does not control, verify, or guarantee the accuracy of prices, mileage, specs,
        photos, or availability. Always confirm the details directly with the seller before
        making any commitment, and be aware a listing can be sold, changed, or removed at any
        time without Carnalys knowing immediately.
      </p>

      <h2 className={sectionHeading}>Not financial, legal, or insurance advice</h2>
      <p className={paragraph}>
        Nothing on Carnalys constitutes financial, legal, or insurance advice. If a decision
        involves real money, and buying a car generally does, it is worth getting advice from a
        professional who can actually look at your specific situation.
      </p>

      <h2 className={sectionHeading}>Use at your own judgement</h2>
      <p className={paragraph}>
        Carnalys is provided as is, built and maintained by one person as a side project. It
        aims to be genuinely useful, but it can be wrong, incomplete, or out of date. You are
        responsible for your own car buying decisions. Carnalys is here to help you make a more
        informed one, not to make it for you.
      </p>
    </>
  );
}

function DisclaimerSv() {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-accent-strong">
        Läs detta
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
        Ansvarsfriskrivning
      </h1>
      <p className={paragraph}>
        Carnalys är ett personligt projekt byggt för att göra begagnatmarknaden lättare att
        förstå. Det är inte en auktoriserad värderingsman, ett försäkringsbolag eller en
        finansiell rådgivare. Läs det här innan du fattar några riktiga beslut baserat på det du
        ser här.
      </p>

      <h2 className={sectionHeading}>Uppskattningar, inte garantier</h2>
      <p className={paragraph}>
        Deal Score, marknadsvärde, köptrygghet och uppskattad ägandekostnad är alla statistiska
        uppskattningar beräknade från annonsdata. De är inga värderingar eller löften om vad en
        bil faktiskt är värd eller faktiskt kommer att kosta dig. Se varje siffra på Carnalys
        som en utgångspunkt för ditt eget omdöme, inte som ett substitut för det.
      </p>

      <h2 className={sectionHeading}>Försäkringsuppskattningar är ett varningsverktyg</h2>
      <p className={paragraph}>
        Försäkringssiffran i ägandekostnaden är en grov uppskattning baserad på fordonstyp, tänkt
        att flagga bilar som troligen är ovanligt dyra eller billiga att försäkra. Det är ingen
        offert och kommer inte att matcha vad ett specifikt försäkringsbolag faktiskt tar av dig.
        Skaffa alltid en riktig offert från ett försäkringsbolag innan du köper en bil, särskilt
        om Carnalys flaggar den som hög risk.
      </p>

      <h2 className={sectionHeading}>Annonsdata kommer från tredje part</h2>
      <p className={paragraph}>
        Bilannonser hämtas från tredje parts svenska marknadsplatser och handlarsajter. Carnalys
        kontrollerar, verifierar eller garanterar inte att priser, miltal, specifikationer,
        bilder eller tillgänglighet stämmer. Bekräfta alltid detaljerna direkt med säljaren innan
        du gör något åtagande, och tänk på att en annons kan bli såld, ändrad eller borttagen när
        som helst utan att Carnalys vet om det direkt.
      </p>

      <h2 className={sectionHeading}>Inte finansiell, juridisk eller försäkringsrådgivning</h2>
      <p className={paragraph}>
        Inget på Carnalys utgör finansiell, juridisk eller försäkringsrådgivning. Om ett beslut
        rör riktiga pengar, vilket att köpa en bil oftast gör, är det värt att få rådgivning från
        någon som faktiskt kan titta på din specifika situation.
      </p>

      <h2 className={sectionHeading}>Använd ditt eget omdöme</h2>
      <p className={paragraph}>
        Carnalys tillhandahålls i befintligt skick, byggt och underhållet av en person som ett
        sidoprojekt. Målet är att vara genuint användbart, men det kan ha fel, vara ofullständigt
        eller inaktuellt. Du är själv ansvarig för dina egna bilköpsbeslut. Carnalys finns här
        för att hjälpa dig fatta ett mer informerat beslut, inte för att fatta det åt dig.
      </p>
    </>
  );
}

export default function DisclaimerPage() {
  return (
    <StaticPageShell>
      {(locale) => (locale === "sv" ? <DisclaimerSv /> : <DisclaimerEn />)}
    </StaticPageShell>
  );
}
