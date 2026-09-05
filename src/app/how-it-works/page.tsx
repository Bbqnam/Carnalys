"use client";

import { StaticPageShell } from "@/features/search/static-page-shell";

const sectionHeading = "mt-10 text-xl font-semibold tracking-[-0.02em] text-ink";
const paragraph = "mt-3 text-[15px] leading-relaxed text-ink";

function HowItWorksEn() {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-accent-strong">Guide</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
        How Carnalys works
      </h1>
      <p className={paragraph}>
        No jargon, no dashboard you need a manual for. Here is what each part actually does.
      </p>

      <h2 className={sectionHeading}>Search and filters</h2>
      <p className={paragraph}>
        Type what you are after in the search bar, or narrow things down with Filters: price,
        year, mileage, fuel type, body style and more. Every car on Carnalys is pulled from real
        Swedish marketplaces and kept in sync, so what you see is what is actually for sale
        right now.
      </p>

      <h2 className={sectionHeading}>Deal Score</h2>
      <p className={paragraph}>
        A 0 to 100 score for how good the asking price is compared with similar cars: same
        model, similar age, similar mileage. High means the price looks genuinely good. Low
        means you are probably paying a premium for something. A car with too few comparable
        listings shows as unrated rather than a made up number.
      </p>

      <h2 className={sectionHeading}>Market value</h2>
      <p className={paragraph}>
        An estimate of what a car is actually worth right now, based on what similar cars are
        currently listed for and adjusted for its specific age and mileage. It comes with a
        range, not a single overly precise number, because that is a more honest way to show an
        estimate.
      </p>

      <h2 className={sectionHeading}>Buy confidence</h2>
      <p className={paragraph}>
        How reassuring the car itself looks on paper: age, mileage, service history, number of
        previous owners. This is about the car&apos;s own condition signals, separate from
        whether the price is good.
      </p>

      <h2 className={sectionHeading}>Estimated ownership cost</h2>
      <p className={paragraph}>
        What a car actually costs to keep, not just to buy. Depreciation, fuel or electricity,
        insurance, maintenance and tax, broken down by category. The insurance line factors in
        the car&apos;s brand, fuel type and power. A Tesla and a Kia at the same price do not cost
        the same to insure, even though most price comparisons treat them as if they do. If you
        add your own age band, licence years and region in Settings, the insurance estimate
        personalizes to you specifically.
      </p>
      <p className={paragraph}>
        Worth repeating: this is a screening estimate, not a quote. It is there to warn you
        before you fall in love with a car that turns out to be expensive to insure. Always get
        a real quote before you buy.
      </p>

      <h2 className={sectionHeading}>Compare</h2>
      <p className={paragraph}>
        Add up to three cars to the comparison tray and see them side by side: price, specs,
        Deal Score, ownership cost, all in one table. Useful once you have narrowed things down
        to a shortlist and need to actually decide.
      </p>

      <h2 className={sectionHeading}>Saved cars and saved searches</h2>
      <p className={paragraph}>
        Save individual cars to come back to later, or save an entire search, filters and all,
        so you can reopen it in one click instead of rebuilding it every time.
      </p>

      <h2 className={sectionHeading}>Analysis</h2>
      <p className={paragraph}>
        The Analysis page zooms out from individual cars to the market itself. Price trends,
        typical mileage for a model and year, whether now is a relatively good or bad time to
        buy. Good context before you start seriously shopping.
      </p>

      <h2 className={sectionHeading}>Ask Carnalys</h2>
      <p className={paragraph}>
        The little chat launcher in the corner lets you ask about any specific car in plain
        language. Is this a fair price, what should I watch out for, that kind of thing. It
        answers from the same data you see on the page, not from thin air.
      </p>

      <h2 className={sectionHeading}>One honest note</h2>
      <p className={paragraph}>
        Every estimate on Carnalys, Deal Score, market value, ownership cost, insurance, is a
        statistical estimate built from listing data, not a guarantee or a professional
        appraisal. See the{" "}
        <a className="underline underline-offset-2 hover:text-ink" href="/disclaimer">
          disclaimer
        </a>{" "}
        for the full version.
      </p>
    </>
  );
}

function HowItWorksSv() {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-accent-strong">Guide</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
        Så fungerar Carnalys
      </h1>
      <p className={paragraph}>
        Ingen jargong, ingen instrumentpanel du behöver en manual för. Här är vad varje del
        faktiskt gör.
      </p>

      <h2 className={sectionHeading}>Sök och filter</h2>
      <p className={paragraph}>
        Skriv vad du letar efter i sökrutan, eller smalna av med Filter: pris, årsmodell,
        miltal, drivmedel, kaross och mer. Alla bilar på Carnalys hämtas från riktiga svenska
        marknadsplatser och hålls synkade, så det du ser är det som faktiskt är till salu just
        nu.
      </p>

      <h2 className={sectionHeading}>Deal Score</h2>
      <p className={paragraph}>
        Ett betyg från 0 till 100 för hur bra det begärda priset är jämfört med liknande bilar:
        samma modell, liknande ålder, liknande miltal. Högt betyg betyder att priset ser
        genuint bra ut. Lågt betyder att du troligen betalar för mycket. En bil med för få
        jämförbara annonser visas som obedömd i stället för att få en påhittad siffra.
      </p>

      <h2 className={sectionHeading}>Marknadsvärde</h2>
      <p className={paragraph}>
        En uppskattning av vad en bil faktiskt är värd just nu, baserad på vad liknande bilar
        ligger ute för just nu och justerad för dess specifika ålder och miltal. Det visas som
        ett intervall, inte en enda överdrivet exakt siffra, eftersom det är ett ärligare sätt
        att visa en uppskattning.
      </p>

      <h2 className={sectionHeading}>Köptrygghet</h2>
      <p className={paragraph}>
        Hur trygg bilen själv ser ut på pappret: ålder, miltal, servicehistorik, antal tidigare
        ägare. Det handlar om bilens egna tillståndssignaler, skilt från om priset är bra.
      </p>

      <h2 className={sectionHeading}>Uppskattad ägandekostnad</h2>
      <p className={paragraph}>
        Vad en bil faktiskt kostar att äga, inte bara att köpa. Värdeminskning, drivmedel eller
        el, försäkring, underhåll och skatt, uppdelat per kategori. Försäkringsraden tar hänsyn
        till bilens märke, drivmedel och effekt. En Tesla och en Kia till samma pris kostar
        inte lika mycket att försäkra, även om de flesta prisjämförelser behandlar dem som att
        de gör det. Om du lägger till din egen åldersgrupp, antal år med körkort och region
        under Inställningar anpassas försäkringsuppskattningen specifikt för dig.
      </p>
      <p className={paragraph}>
        Värt att upprepa: det här är en varningssignal, inte en offert. Den finns för att varna
        dig innan du blir kär i en bil som visar sig vara dyr att försäkra. Skaffa alltid en
        riktig offert innan du köper.
      </p>

      <h2 className={sectionHeading}>Jämför</h2>
      <p className={paragraph}>
        Lägg till upp till tre bilar i jämförelsen och se dem sida vid sida: pris,
        specifikationer, Deal Score, ägandekostnad, allt i en tabell. Bra när du har smalnat av
        till en kortlista och faktiskt behöver bestämma dig.
      </p>

      <h2 className={sectionHeading}>Sparade bilar och sparade sökningar</h2>
      <p className={paragraph}>
        Spara enskilda bilar att återkomma till senare, eller spara en hel sökning, filter och
        allt, så att du kan öppna den igen med ett klick i stället för att bygga upp den varje
        gång.
      </p>

      <h2 className={sectionHeading}>Analys</h2>
      <p className={paragraph}>
        Analyssidan zoomar ut från enskilda bilar till själva marknaden. Prisutveckling,
        typiskt miltal för en modell och årsmodell, om nu är en relativt bra eller dålig tid att
        köpa. Bra sammanhang innan du börjar shoppa på allvar.
      </p>

      <h2 className={sectionHeading}>Fråga Carnalys</h2>
      <p className={paragraph}>
        Den lilla chattknappen i hörnet låter dig fråga om en specifik bil i vanligt språk. Är
        det här ett rimligt pris, vad ska jag tänka på, den typen av frågor. Den svarar utifrån
        samma data som du ser på sidan, inte ur tomma intet.
      </p>

      <h2 className={sectionHeading}>En ärlig notering</h2>
      <p className={paragraph}>
        Varje uppskattning på Carnalys, Deal Score, marknadsvärde, ägandekostnad, försäkring,
        är en statistisk uppskattning byggd på annonsdata, inte en garanti eller en
        professionell värdering. Se{" "}
        <a className="underline underline-offset-2 hover:text-ink" href="/disclaimer">
          ansvarsfriskrivningen
        </a>{" "}
        för hela versionen.
      </p>
    </>
  );
}

export default function HowItWorksPage() {
  return (
    <StaticPageShell>
      {(locale) => (locale === "sv" ? <HowItWorksSv /> : <HowItWorksEn />)}
    </StaticPageShell>
  );
}
