"use client";

import { StaticPageShell } from "@/features/search/static-page-shell";

function AboutEn() {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-accent-strong">
        The story
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
        About Carnalys
      </h1>

      <p className="mt-6 text-[15px] leading-relaxed text-ink">
        Carnalys started shortly after I got my driving licence.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        I got a little obsessed with cars almost immediately. The kind of obsessed where
        checking a few listings quickly turns into two hours and fourteen browser tabs.
        Different models, prices, mileage, trying to figure out what was actually a good deal
        instead of just good photos.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        The problem was that comparing cars properly is surprisingly hard. Ten tabs open and
        still no answer. I could go through them one by one, sure, but that only tells you how a
        car compares to nine other cars, not to the whole market. Was the price actually good?
        Was the mileage normal for its age? Was there a better one three scrolls down that I had
        already passed?
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        So, naturally, instead of just buying a car like a normal person, I started building
        Carnalys.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        At first it was just supposed to help me find my first car. A weekend project, nothing
        serious. Then I started collecting more data. Adding analysis. Tracking prices over
        time. Keeping old listings instead of letting them vanish. Somewhere along the way it
        turned from a side project into a full obsession, and it became a lot more than a search
        tool.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        Carnalys is now my attempt to actually understand the Swedish used car market through
        data, while building something I genuinely want to use myself.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">I still have not bought a car.</p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        But at least now I have a database to help me overthink it properly, which, if you know
        anyone who has bought a used car, is really the whole point.
      </p>
    </>
  );
}

function AboutSv() {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-accent-strong">
        Historien
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
        Om Carnalys
      </h1>

      <p className="mt-6 text-[15px] leading-relaxed text-ink">
        Carnalys startade strax efter att jag tog körkort.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        Jag blev nästan direkt lite besatt av bilar. Den sortens besatthet där en snabb koll på
        annonser blir till två timmar och fjorton flikar i webbläsaren. Olika modeller, priser,
        miltal, och ett försök att förstå vad som faktiskt var en bra affär och inte bara fina
        bilder.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        Problemet var att det är förvånansvärt svårt att jämföra bilar ordentligt. Tio öppna
        flikar och fortfarande inget svar. Jag kunde gå igenom dem en och en, men det säger bara
        hur en bil står sig mot nio andra bilar, inte mot hela marknaden. Var priset faktiskt
        bra? Var miltalet normalt för åldern? Fanns det en bättre bil tre annonser längre ner som
        jag redan hade scrollat förbi?
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        Så, naturligtvis, i stället för att bara köpa en bil som en normal person, började jag
        bygga Carnalys.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        Först var det bara tänkt att hjälpa mig hitta min första bil. Ett helgprojekt, inget
        märkvärdigt. Sedan började jag samla mer data. Lägga till analyser. Följa
        prisförändringar över tid. Spara gamla annonser i stället för att låta dem försvinna.
        Någonstans på vägen gick det från sidoprojekt till full besatthet, och blev till mycket
        mer än ett sökverktyg.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        Carnalys är nu mitt försök att faktiskt förstå den svenska begagnatmarknaden genom data,
        samtidigt som jag bygger något jag själv verkligen vill använda.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        Jag har fortfarande inte köpt någon bil.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink">
        Men nu har jag i alla fall en databas som hjälper mig att övertänka det ordentligt,
        vilket, om du känner någon som har köpt en begagnad bil, egentligen är hela poängen.
      </p>
    </>
  );
}

export default function AboutPage() {
  return (
    <StaticPageShell>{(locale) => (locale === "sv" ? <AboutSv /> : <AboutEn />)}</StaticPageShell>
  );
}
