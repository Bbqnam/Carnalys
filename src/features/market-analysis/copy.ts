import type { Locale } from "@/features/search/copy";

/**
 * Copy for the Analysis page, kept beside the feature rather than in the
 * search page's `uiCopy` so the two can evolve independently.
 *
 * Wording rule for this page: we hold advertised prices, not transactions. It
 * always says "asking price"; a listing that leaves the marketplace has
 * "disappeared", never "sold".
 */
export const analysisCopy = {
  en: {
    nav: "Analysis",
    title: "Market analysis",
    subtitle:
      "Which version is worth the money, and when the market favours you. Built from live Swedish listings.",
    listingBasis: (count: number) =>
      `${count.toLocaleString("en-SE")} listings analysed`,
    updated: "Updated",
    filters: {
      brand: "Brand",
      allBrands: "All brands",
      searchBrands: "Search brands",
      model: "Model",
      allModels: "All models",
      searchModels: "Search models",
      fuel: "Fuel",
      gearbox: "Gearbox",
      year: "Model year",
      mileage: "Mileage",
      any: "Any",
      reset: "Reset",
      selected: (count: number) => `${count} selected`,
      clear: "Clear",
      done: "Done",
      noMatches: "No matching options",
      showFilters: "Filters",
      hideFilters: "Hide filters",
      fuels: {
        electric: "Electric",
        plug_in_hybrid: "Plug-in hybrid",
        self_charging_hybrid: "Hybrid",
        petrol: "Petrol",
        diesel: "Diesel",
      },
      gearboxes: { automatic: "Automatic", manual: "Manual" },
    },
    snapshot: {
      title: "Market snapshot",
      listings: "Listings analysed",
      medianPrice: "Median asking price",
      medianMileage: "Median mileage",
      medianYear: "Median model year",
      spread: (low: string, high: string) => `Middle half ${low} – ${high}`,
      sampled: (count: string) => `${count} plotted`,
      retention: (percent: number) => `${percent}% of newest year's price`,
      medianNote: "Medians, so a handful of extreme listings can't skew the picture.",
    },
    variants: {
      title: "Best value versions",
      explanation:
        "Each version compared with what its own model year and mileage predict. Green means the version asks less than comparable cars, red means it asks more — so this measures value, not price.",
      showAll: (count: number) => `Show ${count} more`,
      showLess: "Show fewer",
      empty: "Not enough listings per version to compare. Try a specific model.",
      headline: "vs predicted price",
    },
    depreciation: {
      title: "Depreciation",
      explanation:
        "Median asking price by model year, as a share of the newest year on sale. Read off today's market rather than one car followed over time — the only kind of curve live listings can support.",
      retained: "of newest",
      sweetSpot: (year: number) => `${year} is the sweet spot.`,
      sweetSpotHelp: "The steepest drop has already been paid by the first owner.",
      hover: "Hover a year for its median asking price.",
      empty: "Not enough model years to draw a curve.",
      title2: "Value retained",
    },
    equipment: {
      title: "What equipment is worth",
      explanation:
        "Asking-price difference associated with each option, against comparable cars of the same model, year and mileage. Options aren't fitted at random, so these figures carry what tends to be specified alongside them too — a guide to what the market charges, not a price list.",
      basis: (minimum: string) => `Options on at least ${minimum} comparable listings`,
      empty: "Not enough equipment data for this selection.",
    },
    regions: {
      title: "Where it's cheaper",
      explanation:
        "Municipalities compared on mix-adjusted asking prices, so a town that simply lists older, higher-mileage cars doesn't look like a bargain. Remember to weigh travel against the difference.",
      cheapest: "Cheapest",
      priciest: "Most expensive",
      empty: "Not enough listings per area to compare.",
    },
    scatter: {
      title: "Price vs mileage",
      description:
        "Each dot is one live listing, shaded by model year.",
      priceAxis: "Asking price",
      mileageAxis: "Mileage",
      sampleNote: (shown: number, total: number) =>
        `Showing ${shown.toLocaleString("en-SE")} of ${total.toLocaleString("en-SE")} matching listings`,
      trimmedNote: (count: number) =>
        `${count.toLocaleString("en-SE")} outliers left off the axes`,
      newer: "Newer",
      older: "Older",
      modelYearLegend: "model year",
      dealer: "Dealer",
      private: "Private",
      viewListing: "Open listing",
      empty: "No listings match these filters.",
    },
    valueMap: {
      title: "Year × mileage value map",
      description:
        "Median asking price for each combination. Stronger colour means a higher asking price — not a worse car.",
      mileageHeader: "Mileage (mil)",
      yearHeader: "Model year",
      cars: (count: number) => `${count} ${count === 1 ? "car" : "cars"}`,
      lowConfidence: "Few listings — treat with caution",
      tooFew: "Too few listings",
      under: (value: string) => `Under ${value}`,
      plus: (value: string) => `${value}+`,
      empty: "Not enough listings to build a value map for this selection.",
      caution:
        "A cheaper cell is not automatically a better buy: it usually means older, higher-mileage or lesser-equipped cars.",
    },
    relationships: {
      title: "What age and mileage are worth",
      description:
        "Estimated from this selection, holding model, fuel, gearbox and seller type constant.",
      perYear: "One model year newer",
      perMileage: "1,000 mil less on the clock",
      sellerGap: "Private seller vs dealer",
      equivalence: "One model year is worth about",
      equivalenceUnit: (mil: string) => `${mil} mil`,
      equivalenceHelp:
        "So a newer car with that much extra mileage is priced about the same as an older one without it.",
      basis: (listings: string, models: number) =>
        `${listings} listings across ${models.toLocaleString("en-SE")} ${models === 1 ? "model" : "models"}`,
      fit: (percent: number) =>
        `Explains ${percent}% of the price spread within a model`,
      estimateLabel: "Market estimate",
      unavailable: "Not enough comparable listings",
      unavailableBody:
        "Widen the filters — a few dozen listings spread across many models can't support a reliable estimate.",
      methodology:
        "Least squares on the log of asking price, with each make and model's own average removed first so the effect is measured within a model rather than between models. Asking prices only; we don't observe what anyone paid.",
      methodologyToggle: "How this is calculated",
    },
    timing: {
      title: "Best time to buy",
      description:
        "How buying conditions compare across the year, adjusted for the fact that different cars are on sale in different months.",
      recentTitle: "Recent market trend",
      recentDescription:
        "Not enough history yet to talk about seasons. This is what we've observed so far.",
      months: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ],
      monthsShort: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ],
      verdicts: {
        great: "Great time to buy",
        good: "Slightly in your favour",
        normal: "Normal market",
        expensive: "Expensive period",
      },
      legend: { good: "Favours buyers", neutral: "Normal", bad: "Favours sellers" },
      noData: "Not observed yet",
      noDataHint: "We haven't watched this month yet",
      buyerScore: "Buyer Score",
      whyThisRating: "Why this rating",
      medianPrice: "Median asking price",
      vsBaseline: "Vs annual baseline",
      inventory: "Listings available",
      inventoryIndex: "Vs typical month",
      listingAge: "Typical listing age",
      days: (value: string) => `${value} days`,
      reductions: "Asking prices cut",
      observations: "Observations",
      components: {
        price: "Asking price level",
        inventory: "Choice available",
        reductions: "Price cutting",
        listing_age: "How long stock sits",
      },
      componentHelp: {
        price: "Comparable cars priced against the annual baseline.",
        inventory: "More listings means more room to negotiate.",
        reductions: "Sellers cutting asking prices signals a buyer's market.",
        listing_age: "Ads sitting longer means sellers are waiting for buyers.",
      },
      confidence: {
        none: "Building history",
        low: "Low confidence",
        medium: "Medium confidence",
        high: "High confidence",
      },
      coverage: (months: number) =>
        months === 0
          ? "No history recorded yet"
          : `${months} ${months === 1 ? "month" : "months"} of observations`,
      since: (date: string) => `Recording since ${date}`,
      emptyTitle: "History starts now",
      emptyBody:
        "Carnalysis began recording price and availability changes on this catalogue recently. Every sync adds to it, and this calendar fills in as the months pass — nothing here is estimated or filled in for you.",
      disclaimer:
        "Based on advertised prices and how long listings stay live. A listing disappearing is a market exit, not proof of a sale.",
      selectMonth: "Select a month",
    },
  },
  sv: {
    nav: "Analys",
    title: "Marknadsanalys",
    subtitle:
      "Vilken version som ger mest för pengarna, och när marknaden är på din sida. Byggd på aktuella svenska annonser.",
    listingBasis: (count: number) =>
      `${count.toLocaleString("sv-SE")} annonser analyserade`,
    updated: "Uppdaterad",
    filters: {
      brand: "Märke",
      allBrands: "Alla märken",
      searchBrands: "Sök märke",
      model: "Modell",
      allModels: "Alla modeller",
      searchModels: "Sök modell",
      fuel: "Drivmedel",
      gearbox: "Växellåda",
      year: "Årsmodell",
      mileage: "Miltal",
      any: "Alla",
      reset: "Återställ",
      selected: (count: number) => `${count} valda`,
      clear: "Rensa",
      done: "Klar",
      noMatches: "Inga träffar",
      showFilters: "Filter",
      hideFilters: "Dölj filter",
      fuels: {
        electric: "El",
        plug_in_hybrid: "Laddhybrid",
        self_charging_hybrid: "Hybrid",
        petrol: "Bensin",
        diesel: "Diesel",
      },
      gearboxes: { automatic: "Automat", manual: "Manuell" },
    },
    snapshot: {
      title: "Marknadsläge",
      listings: "Analyserade annonser",
      medianPrice: "Medianpris",
      medianMileage: "Medianmiltal",
      medianYear: "Medianårsmodell",
      spread: (low: string, high: string) => `Mittersta hälften ${low} – ${high}`,
      sampled: (count: string) => `${count} i diagrammet`,
      retention: (percent: number) => `${percent} % av nyaste årsmodellen`,
      medianNote: "Medianvärden, så enstaka extrema annonser inte snedvrider bilden.",
    },
    variants: {
      title: "Bäst värde per version",
      explanation:
        "Varje version jämförd med vad dess egen årsmodell och miltal förutsäger. Grönt betyder att versionen begär mindre än jämförbara bilar, rött att den begär mer — det mäter alltså värde, inte pris.",
      showAll: (count: number) => `Visa ${count} till`,
      showLess: "Visa färre",
      empty: "För få annonser per version för att jämföra. Välj en specifik modell.",
      headline: "mot förväntat pris",
    },
    depreciation: {
      title: "Värdeminskning",
      explanation:
        "Medianpris per årsmodell, som andel av den nyaste årsmodellen till salu. Avläst ur dagens marknad i stället för en bil följd över tid — den enda kurva aktiva annonser kan ge.",
      retained: "av nyaste",
      sweetSpot: (year: number) => `${year} är sweet spot.`,
      sweetSpotHelp: "Det brantaste fallet är redan betalt av första ägaren.",
      hover: "Peka på en årsmodell för dess medianpris.",
      empty: "För få årsmodeller för att rita en kurva.",
      title2: "Kvarvarande värde",
    },
    equipment: {
      title: "Vad utrustning är värd",
      explanation:
        "Prisskillnad kopplad till varje tillval, mot jämförbara bilar med samma modell, årsmodell och miltal. Tillval monteras inte slumpmässigt, så siffrorna bär även det som brukar specificeras tillsammans med dem — en vägledning om vad marknaden tar betalt, inte en prislista.",
      basis: (minimum: string) => `Tillval på minst ${minimum} jämförbara annonser`,
      empty: "För lite utrustningsdata för det här urvalet.",
    },
    regions: {
      title: "Var det är billigare",
      explanation:
        "Kommuner jämförda på mixjusterade utgångspriser, så en ort som helt enkelt annonserar äldre och mer körda bilar inte ser ut som ett fynd. Väg resan mot skillnaden.",
      cheapest: "Billigast",
      priciest: "Dyrast",
      empty: "För få annonser per ort för att jämföra.",
    },
    scatter: {
      title: "Pris mot miltal",
      description:
        "Varje punkt är en aktiv annons, färgad efter årsmodell.",
      priceAxis: "Utgångspris",
      mileageAxis: "Miltal",
      sampleNote: (shown: number, total: number) =>
        `Visar ${shown.toLocaleString("sv-SE")} av ${total.toLocaleString("sv-SE")} matchande annonser`,
      trimmedNote: (count: number) =>
        `${count.toLocaleString("sv-SE")} extremvärden ligger utanför skalan`,
      newer: "Nyare",
      older: "Äldre",
      modelYearLegend: "årsmodell",
      dealer: "Handlare",
      private: "Privat",
      viewListing: "Öppna annons",
      empty: "Inga annonser matchar filtren.",
    },
    valueMap: {
      title: "Årsmodell × miltal",
      description:
        "Medianpris för varje kombination. Kraftigare färg betyder högre utgångspris — inte sämre bil.",
      mileageHeader: "Miltal",
      yearHeader: "Årsmodell",
      cars: (count: number) => `${count} ${count === 1 ? "bil" : "bilar"}`,
      lowConfidence: "Få annonser — tolka försiktigt",
      tooFew: "För få annonser",
      under: (value: string) => `Under ${value}`,
      plus: (value: string) => `${value}+`,
      empty: "För få annonser för att bygga en värdekarta för det här urvalet.",
      caution:
        "En billigare ruta är inte automatiskt ett bättre köp — den rymmer oftast äldre, mer körda eller sämre utrustade bilar.",
    },
    relationships: {
      title: "Vad ålder och miltal är värda",
      description:
        "Skattat från det här urvalet, med modell, drivmedel, växellåda och säljartyp konstanta.",
      perYear: "En årsmodell nyare",
      perMileage: "1 000 mil lägre miltal",
      sellerGap: "Privat säljare mot handlare",
      equivalence: "En årsmodell motsvarar ungefär",
      equivalenceUnit: (mil: string) => `${mil} mil`,
      equivalenceHelp:
        "En nyare bil med så mycket högre miltal kostar alltså ungefär lika mycket som en äldre utan.",
      basis: (listings: string, models: number) =>
        `${listings} annonser över ${models.toLocaleString("sv-SE")} ${models === 1 ? "modell" : "modeller"}`,
      fit: (percent: number) =>
        `Förklarar ${percent} % av prisspridningen inom en modell`,
      estimateLabel: "Marknadsskattning",
      unavailable: "För få jämförbara annonser",
      unavailableBody:
        "Vidga filtren — några dussin annonser spridda över många modeller räcker inte för en tillförlitlig skattning.",
      methodology:
        "Minstakvadratanpassning på logaritmen av utgångspriset, där varje märkes och modells eget medelvärde först dras bort så att effekten mäts inom en modell i stället för mellan modeller. Endast utgångspriser; vi ser inte vad någon faktiskt betalade.",
      methodologyToggle: "Så räknas det ut",
    },
    timing: {
      title: "Bästa tiden att köpa",
      description:
        "Hur köpläget skiljer sig över året, justerat för att olika bilar ligger ute olika månader.",
      recentTitle: "Senaste marknadstrend",
      recentDescription:
        "Ännu inte tillräckligt med historik för att tala om säsonger. Det här har vi observerat hittills.",
      months: [
        "Januari",
        "Februari",
        "Mars",
        "April",
        "Maj",
        "Juni",
        "Juli",
        "Augusti",
        "September",
        "Oktober",
        "November",
        "December",
      ],
      monthsShort: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "Maj",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Okt",
        "Nov",
        "Dec",
      ],
      verdicts: {
        great: "Bra läge att köpa",
        good: "Något till din fördel",
        normal: "Normal marknad",
        expensive: "Dyr period",
      },
      legend: { good: "Gynnar köpare", neutral: "Normalt", bad: "Gynnar säljare" },
      noData: "Inte observerad än",
      noDataHint: "Vi har inte följt den här månaden än",
      buyerScore: "Köpläge",
      whyThisRating: "Varför den här bedömningen",
      medianPrice: "Medianpris",
      vsBaseline: "Mot årsbasnivån",
      inventory: "Annonser tillgängliga",
      inventoryIndex: "Mot en typisk månad",
      listingAge: "Typisk annonsålder",
      days: (value: string) => `${value} dagar`,
      reductions: "Sänkta utgångspriser",
      observations: "Observationer",
      components: {
        price: "Prisnivå",
        inventory: "Utbud att välja på",
        reductions: "Prissänkningar",
        listing_age: "Hur länge annonser ligger kvar",
      },
      componentHelp: {
        price: "Jämförbara bilar mot årsbasnivån.",
        inventory: "Fler annonser ger mer förhandlingsutrymme.",
        reductions: "Säljare som sänker priset tyder på köparens marknad.",
        listing_age: "Annonser som ligger längre betyder att säljare får vänta.",
      },
      confidence: {
        none: "Bygger historik",
        low: "Låg tillförlitlighet",
        medium: "Medelhög tillförlitlighet",
        high: "Hög tillförlitlighet",
      },
      coverage: (months: number) =>
        months === 0
          ? "Ingen historik registrerad än"
          : `${months} ${months === 1 ? "månad" : "månader"} med observationer`,
      since: (date: string) => `Registrerar sedan ${date}`,
      emptyTitle: "Historiken börjar nu",
      emptyBody:
        "Carnalysis började nyligen registrera pris- och tillgänglighetsförändringar i den här katalogen. Varje synk fyller på, och kalendern växer fram månad för månad — inget här är uppskattat eller ifyllt åt dig.",
      disclaimer:
        "Baserat på utgångspriser och hur länge annonser ligger kvar. Att en annons försvinner är ett marknadsutträde, inte ett bevis på försäljning.",
      selectMonth: "Välj en månad",
    },
  },
} satisfies Record<Locale, unknown>;

export type AnalysisCopy = (typeof analysisCopy)["en"];
