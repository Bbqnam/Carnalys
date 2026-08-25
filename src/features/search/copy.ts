import type { ScoreFactor } from "@/domain/vehicle";

export type Locale = "en" | "sv";

export function scoreFactorText(locale: Locale, factor: ScoreFactor) {
  const numberLocale = locale === "en" ? "en-SE" : "sv-SE";
  const legacyFactor = factor as ScoreFactor & {
    label?: string;
    explanation?: string;
  };
  const value = (key: string) => factor.params?.[key];
  const labels = {
    en: {
      price_vs_market: "Price vs market",
      vehicle_age: "Vehicle age",
      mileage: "Mileage",
      affordability: "Price bracket",
      condition: "Condition and reliability",
      ownership_history: "Ownership history",
    },
    sv: {
      price_vs_market: "Pris jämfört med marknaden",
      vehicle_age: "Fordonets ålder",
      mileage: "Miltal",
      affordability: "Prisklass",
      condition: "Skick och tillförlitlighet",
      ownership_history: "Ägarhistorik",
    },
  } as const;

  if (!factor.params && legacyFactor.label && legacyFactor.explanation) {
    return {
      label: legacyFactor.label,
      explanation: legacyFactor.explanation,
    };
  }

  let explanation: string;
  switch (factor.key) {
    case "price_vs_market":
      explanation =
        value("percent") === undefined
          ? locale === "en"
            ? "Too few comparable listings for a reliable price comparison."
            : "För få jämförbara annonser för en säker prisjämförelse."
          : factor.impact === "positive"
            ? locale === "en"
              ? `Priced ${value("percent")}% below estimated market value.`
              : `Prissatt ${value("percent")} % under uppskattat marknadsvärde.`
            : factor.impact === "negative"
              ? locale === "en"
                ? `Priced ${value("percent")}% above estimated market value.`
                : `Prissatt ${value("percent")} % över uppskattat marknadsvärde.`
              : locale === "en"
                ? "Priced close to estimated market value."
                : "Prissatt nära uppskattat marknadsvärde.";
      break;
    case "vehicle_age":
      explanation =
        locale === "en"
          ? `${value("age")} years old (model year ${value("modelYear")}).`
          : `${value("age")} år gammal (årsmodell ${value("modelYear")}).`;
      break;
    case "mileage":
      explanation =
        locale === "en"
          ? `${value("mileageKm").toLocaleString(numberLocale)} km on the odometer.`
          : `${value("mileageKm").toLocaleString(numberLocale)} km i mätarställningen.`;
      break;
    case "affordability":
      explanation =
        locale === "en"
          ? `Asking price SEK ${value("askingPrice").toLocaleString(numberLocale)}.`
          : `Utgångspris ${value("askingPrice").toLocaleString(numberLocale)} kr.`;
      break;
    case "condition":
      explanation =
        factor.impact === "positive"
          ? locale === "en"
            ? "Low age and mileage reduce the risk of age-related faults."
            : "Låg ålder och lågt miltal minskar risken för åldersrelaterade fel."
          : factor.impact === "negative"
            ? locale === "en"
              ? "High age and mileage increase the risk of wear and unplanned maintenance."
              : "Hög ålder och högt miltal ökar risken för slitage och oplanerat underhåll."
            : locale === "en"
              ? "Moderate wear risk for the vehicle's age and mileage."
              : "Måttlig risk för slitage givet fordonets ålder och miltal.";
      break;
    case "ownership_history": {
      const ownerCount = value("ownerCount");
      explanation =
        ownerCount === undefined
          ? locale === "en"
            ? "The number of previous owners is unknown."
            : "Antal tidigare ägare är inte känt."
          : ownerCount === 1
            ? locale === "en"
              ? "Only one previous owner."
              : "Endast en tidigare ägare."
            : factor.impact === "positive"
              ? locale === "en"
                ? `${ownerCount} previous owners, fewer than average.`
                : `${ownerCount} tidigare ägare, färre än genomsnittet.`
              : factor.impact === "negative"
                ? locale === "en"
                  ? `${ownerCount} previous owners, more than average.`
                  : `${ownerCount} tidigare ägare, fler än genomsnittet.`
                : locale === "en"
                  ? `${ownerCount} previous owners.`
                  : `${ownerCount} tidigare ägare.`;
      break;
    }
  }

  return { label: labels[locale][factor.key], explanation };
}

/**
 * The stored MarketValueEstimate.explanation string is Swedish-only
 * (written at analysis time, before locale is known); comparableCount is
 * locale-independent data, so the frontend derives the message from that
 * instead of rendering the stored string.
 */
export function marketValueExplanationText(locale: Locale, comparableCount: number) {
  if (comparableCount >= 3) {
    return locale === "en"
      ? `Median price from ${comparableCount} comparable active listings.`
      : `Medianpris från ${comparableCount} jämförbara aktiva annonser.`;
  }
  return locale === "en"
    ? "Too few comparable listings; the estimate is shown as neutral."
    : "För få jämförbara annonser; värderingen visas neutralt.";
}

/** Same reasoning as marketValueExplanationText — stored summary strings are Swedish-only. */
export function dealScoreSummaryText(locale: Locale, comparableCount: number) {
  if (comparableCount >= 3) {
    return locale === "en"
      ? "Price is compared against similar active listings."
      : "Priset jämförs med liknande aktiva annonser.";
  }
  return locale === "en"
    ? "Too few comparable listings for a reliable price assessment."
    : "För få jämförbara annonser för en säker prisbedömning.";
}

export function buyConfidenceSummaryText(locale: Locale) {
  return locale === "en"
    ? "Assessment based on available listing data."
    : "Bedömning baserad på tillgänglig annonsdata.";
}

export const uiCopy = {
  en: {
    languageName: "English",
    languageSwitchLabel: "Change language",
    themeSwitchLabel: "Change theme",
    lightTheme: "Light",
    darkTheme: "Dark",
    nav: {
      home: "Carnalys home",
      howItWorks: "How it works",
      analysis: "Analysis",
      saved: "Saved",
      savedCars: (count: number) => `${count} saved cars`,
      compare: "Compare",
      compareCars: (count: number) => `${count} cars in comparison`,
    },
    hero: {
      eyebrow: "Smarter car buying starts here",
      title: "Carnalys",
      description:
        "We compare market value, ownership cost and reliability so you can find the best buys—not just more listings.",
      searchLabel: "Search by make or model",
      searchPlaceholder: "Try “Volvo V60” or “Tesla Model 3”",
      showCars: (count: number) =>
        `Show ${count.toLocaleString("en-SE")} ${count === 1 ? "car" : "cars"}`,
      popular: "Popular",
      suggestionsLabel: "Popular searches",
      benefits: [
        "Market value analyzed",
        "Ownership cost estimated",
        "Reliability considered",
      ],
    },
    filters: {
      title: "Filters",
      reset: "Reset",
      resetAll: "Reset all",
      moreFilters: "More filters",
      resultCount: (count: number) => `${count.toLocaleString("en-SE")} cars`,
      budget: "Price range",
      anyBudget: "Any budget",
      minimum: "From",
      maximum: "To",
      noMinimum: "0 SEK",
      noMaximum: "500,000 SEK+",
      minimumBudget: "Minimum price",
      maximumBudget: "Maximum price",
      make: "Brand",
      allMakes: "All brands",
      searchMakes: "Search brands",
      model: "Model",
      allModels: "All models",
      searchModels: "Search models",
      selected: (count: number) => `${count} selected`,
      clearSelection: "Clear",
      done: "Done",
      noMatches: "No matching options",
      fuel: "Fuel",
      any: "Any",
      transmission: "Transmission",
      year: "Model year",
      anyYear: "Any year",
      mileage: "Mileage range",
      anyMileage: "Any mileage",
      body: "Body style",
      seller: "Seller",
      sellerTypes: { dealer: "Dealer", private: "Private" },
      fuels: {
        electric: "Electric",
        plug_in_hybrid: "Plug-in",
        self_charging_hybrid: "Hybrid",
        petrol: "Petrol",
        diesel: "Diesel",
        ethanol: "Ethanol",
        hydrogen: "Hydrogen",
        other: "Other",
      },
      transmissions: { automatic: "Automatic", manual: "Manual", other: "Other" },
      bodies: {
        convertible: "Convertible",
        coupe: "Coupé",
        estate: "Estate",
        hatchback: "Hatchback",
        minivan: "Minivan",
        pickup: "Pickup",
        sedan: "Sedan",
        suv: "SUV",
        van: "Van",
        other: "Other",
      },
      drivetrains: {
        all_wheel_drive: "All-wheel drive",
        front_wheel_drive: "Front-wheel drive",
        rear_wheel_drive: "Rear-wheel drive",
        other: "Other",
      },
      serviceHistories: {
        complete: "Full service history",
        partial: "Partial service history",
        missing: "No service history",
        unknown: "Service history unknown",
      },
    },
    results: {
      title: "Best buys right now",
      matchCount: (shown: number, total: number) =>
        `${shown} of ${total} analyzed ${total === 1 ? "car" : "cars"} match`,
      rangeCount: (first: number, last: number, total: number) =>
        `Showing ${first}–${last} of ${total.toLocaleString("en-SE")} cars`,
      pageMatchCount: (shown: number, total: number) =>
        `${shown} match on this page · ${total.toLocaleString("en-SE")} cars total`,
      synchronized: "Synced",
      useCurrentLocation: "Use my location",
      locating: "Finding you…",
      locationOn: "Location on",
      locationUnavailable: "Couldn't get location",
      locationDenied: "Location blocked",
      filterButton: "Filters",
      sortLabel: "Sort",
      sortAria: "Sort results",
      pageSizeLabel: "Per page",
      pageSizeAria: "Cars per page",
      postedLabel: "Posted",
      postedAria: "Filter by posted date",
      postedOptions: {
        "": "Any time",
        today: "Today",
        week: "This week",
        month: "This month",
      },
      sorts: {
        deal_score: "Best Deal Score",
        buy_confidence: "Highest confidence",
        price_asc: "Lowest price",
        price_desc: "Highest price",
        newest: "Newest listings first",
      },
      activeFilters: "Active filters",
      removeFilter: (label: string) => `Remove filter: ${label}`,
      noResultsTitle: "No cars match yet",
      noResultsBody:
        "Try another make, increase your budget or reset the filters to see every analyzed car.",
      clearFilters: "Clear filters",
      mobileTitle: "Refine your search",
      closeFilters: "Close filters",
      paginationLabel: "Vehicle result pages",
      pageOf: (page: number, total: number) => `Page ${page} of ${total}`,
      previousPage: "Previous",
      nextPage: "Next page",
      pageNumbers: "Choose a result page",
      goToPage: (page: number) => `Go to page ${page}`,
    },
    card: {
      dealScore: "Deal Score",
      dealBadge: "Deal",
      confidence: "Buy confidence",
      exceptional: "Exceptional",
      veryGood: "Very good",
      average: "Average",
      poor: "Poor",
      missingImage: "Image unavailable",
      removeSaved: "Remove from saved",
      saveCar: "Save car",
      removeFromCompare: "Remove from comparison",
      addToCompare: "Add to comparison",
      compareLimitReached: "Comparison is full (max 4 cars)",
      reduced: "Reduced",
      mileageUnit: "mil",
      marketValue: "Market value",
      save: "Save",
      belowMarket: (percent: number) => `${percent}% below market`,
      aboveMarket: (percent: number) => `${percent}% above market`,
      atMarket: "At estimated market value",
      marketEstimatePending: "Market estimate pending",
      insufficientMarketData: (count: number) =>
        `${count} comparable ${count === 1 ? "car" : "cars"}; at least 3 required`,
      dealScoreHelp: "Price attractiveness compared with similar cars.",
      confidenceHelp: "Overall purchase quality, ownership cost and risk.",
      financingFrom: "Financing from",
      perMonth: "/mo",
      dealerBadge: "Dealer",
      privateSellerBadge: "Private",
      posted: "Posted",
      firstSeen: "First seen",
      distanceAway: (distanceKm: number) => `${distanceKm} km away`,
      viewListing: "View listing",
      scoreOutOf: (label: string, value: number) => `${label}: ${value} out of 100`,
    },
    detail: {
      back: "Back to results",
      previousPhoto: "Previous photo",
      nextPhoto: "Next photo",
      photoPosition: (index: number, total: number) => `Photo ${index} of ${total}`,
      dealScoreTitle: "Deal Score",
      buyConfidenceTitle: "Buy Confidence",
      whyThisScore: "Why this score",
      marketValueTitle: "Estimated market value",
      marketRange: "Likely range",
      comparablePricesLabel: "Comparable listings",
      thisCarLabel: "This car",
      analyseModel: (model: string) => `Analyse the ${model} market`,
      ownershipCostTitle: "Estimated annual ownership cost",
      ownershipCostCaption: (km: number) =>
        `Based on ${km.toLocaleString("en-SE")} km per year`,
      equipmentTitle: "Equipment",
      equipmentShowAll: (count: number) => `Show all ${count}`,
      equipmentShowLess: "Show less",
      specificationsTitle: "Specifications",
      engine: "Engine",
      horsepower: "Horsepower",
      fuelConsumption: "Fuel consumption",
      fuelConsumptionEstimated: (value: string) => `~${value} (estimated)`,
      drivetrain: "Drivetrain",
      serviceHistory: "Service history",
      owners: "Owners",
      warranty: "Warranty",
      registrationNumber: "Registration number",
      vin: "VIN",
      firstRegistration: "First registered",
      notFoundTitle: "Car not found",
      notFoundBody: "This listing may have been removed or sold.",
      backToSearch: "Back to search",
      factorImpact: {
        positive: "Positive factor",
        neutral: "Neutral factor",
        negative: "Negative factor",
      },
      factorTiers: [
        "Well below average",
        "Below average",
        "Average",
        "Above average",
        "Well above average",
      ],
      ownershipCostBreakdown: "Estimated cost split",
      ownershipCostCategories: {
        depreciation: "Depreciation",
        energy: "Fuel / energy",
        insurance: "Insurance",
        maintenance: "Maintenance",
        tax: "Tax",
      },
    },
    compare: {
      title: "Compare vehicles",
      emptyBody: "Add cars to compare by selecting the compare checkbox on a listing.",
      browseCta: "Browse cars",
      selectedCount: (count: number) => `${count} selected`,
      clearAll: "Clear all",
      viewComparison: "Compare",
      remove: "Remove",
      price: "Price",
      marketValue: "Market value",
      dealScore: "Deal Score",
      mileage: "Mileage",
      year: "Year",
      sellerType: "Seller",
      location: "Location",
    },
    filterLabels: {
      max: "Max",
      from: "From",
    },
    footer: {
      tagline: "A more confident way to choose a car.",
      disclaimer: "Market values and costs are estimates, not guarantees.",
    },
  },
  sv: {
    languageName: "Svenska",
    languageSwitchLabel: "Byt språk",
    themeSwitchLabel: "Byt tema",
    lightTheme: "Ljust",
    darkTheme: "Mörkt",
    nav: {
      home: "Carnalys hem",
      howItWorks: "Så fungerar det",
      analysis: "Analys",
      saved: "Sparade",
      savedCars: (count: number) => `${count} sparade bilar`,
      compare: "Jämför",
      compareCars: (count: number) => `${count} bilar att jämföra`,
    },
    hero: {
      eyebrow: "Smartare bilköp börjar här",
      title: "Carnalys",
      description:
        "Vi jämför marknadsvärde, ägandekostnad och tillförlitlighet så att du hittar de bästa köpen — inte bara fler annonser.",
      searchLabel: "Sök efter märke eller modell",
      searchPlaceholder: "Prova ”Volvo V60” eller ”Tesla Model 3”",
      showCars: (count: number) =>
        `Visa ${count.toLocaleString("sv-SE")} ${count === 1 ? "bil" : "bilar"}`,
      popular: "Populärt",
      suggestionsLabel: "Populära sökningar",
      benefits: [
        "Marknadsvärde analyserat",
        "Ägandekostnad uppskattad",
        "Tillförlitlighet bedömd",
      ],
    },
    filters: {
      title: "Filter",
      reset: "Återställ",
      resetAll: "Rensa alla",
      moreFilters: "Fler filter",
      resultCount: (count: number) => `${count.toLocaleString("sv-SE")} bilar`,
      budget: "Prisintervall",
      anyBudget: "Alla priser",
      minimum: "Från",
      maximum: "Till",
      noMinimum: "0 kr",
      noMaximum: "500 000 kr+",
      minimumBudget: "Lägsta pris",
      maximumBudget: "Högsta pris",
      make: "Märke",
      allMakes: "Alla märken",
      searchMakes: "Sök bilmärke",
      model: "Modell",
      allModels: "Alla modeller",
      searchModels: "Sök modell",
      selected: (count: number) => `${count} valda`,
      clearSelection: "Rensa",
      done: "Klar",
      noMatches: "Inga matchande alternativ",
      fuel: "Drivmedel",
      any: "Alla",
      transmission: "Växellåda",
      year: "Årsmodell",
      anyYear: "Alla år",
      mileage: "Miltalsintervall",
      anyMileage: "Alla miltal",
      body: "Karosstyp",
      seller: "Säljare",
      sellerTypes: { dealer: "Handlare", private: "Privat" },
      fuels: {
        electric: "El",
        plug_in_hybrid: "Laddhybrid",
        self_charging_hybrid: "Hybrid",
        petrol: "Bensin",
        diesel: "Diesel",
        ethanol: "Etanol",
        hydrogen: "Vätgas",
        other: "Övrigt",
      },
      transmissions: { automatic: "Automat", manual: "Manuell", other: "Övrig" },
      bodies: {
        convertible: "Cabriolet",
        coupe: "Coupé",
        estate: "Kombi",
        hatchback: "Halvkombi",
        minivan: "Minibuss",
        pickup: "Pickup",
        sedan: "Sedan",
        suv: "SUV",
        van: "Skåpbil",
        other: "Övrig",
      },
      drivetrains: {
        all_wheel_drive: "Fyrhjulsdrift",
        front_wheel_drive: "Framhjulsdrift",
        rear_wheel_drive: "Bakhjulsdrift",
        other: "Övrig",
      },
      serviceHistories: {
        complete: "Fullständig servicehistorik",
        partial: "Delvis servicehistorik",
        missing: "Ingen servicehistorik",
        unknown: "Servicehistorik okänd",
      },
    },
    results: {
      title: "Bästa köpen just nu",
      matchCount: (shown: number, total: number) =>
        `${shown} av ${total} analyserade ${total === 1 ? "bil" : "bilar"} matchar`,
      rangeCount: (first: number, last: number, total: number) =>
        `Visar ${first}–${last} av ${total.toLocaleString("sv-SE")} bilar`,
      pageMatchCount: (shown: number, total: number) =>
        `${shown} matchar på sidan · ${total.toLocaleString("sv-SE")} bilar totalt`,
      synchronized: "Synkad",
      useCurrentLocation: "Använd min plats",
      locating: "Hämtar plats…",
      locationOn: "Plats aktiverad",
      locationUnavailable: "Kunde inte hämta plats",
      locationDenied: "Plats blockerad",
      filterButton: "Filter",
      sortLabel: "Sortera",
      sortAria: "Sortera resultat",
      pageSizeLabel: "Per sida",
      pageSizeAria: "Bilar per sida",
      postedLabel: "Publicerad",
      postedAria: "Filtrera efter publiceringsdatum",
      postedOptions: {
        "": "När som helst",
        today: "Idag",
        week: "Denna vecka",
        month: "Denna månad",
      },
      sorts: {
        deal_score: "Bäst Deal Score",
        buy_confidence: "Högst köptrygghet",
        price_asc: "Lägst pris",
        price_desc: "Högst pris",
        newest: "Senast publicerade först",
      },
      activeFilters: "Aktiva filter",
      removeFilter: (label: string) => `Ta bort filter: ${label}`,
      noResultsTitle: "Inga bilar matchar ännu",
      noResultsBody:
        "Prova ett annat märke, höj maxpriset eller rensa filtren för att se alla analyserade bilar.",
      clearFilters: "Rensa filter",
      mobileTitle: "Anpassa din sökning",
      closeFilters: "Stäng filter",
      paginationLabel: "Resultatsidor för bilar",
      pageOf: (page: number, total: number) => `Sida ${page} av ${total}`,
      previousPage: "Föregående",
      nextPage: "Nästa sida",
      pageNumbers: "Välj en resultatsida",
      goToPage: (page: number) => `Gå till sida ${page}`,
    },
    card: {
      dealScore: "Deal Score",
      dealBadge: "Prisvärde",
      confidence: "Köptrygghet",
      exceptional: "Exceptionellt",
      veryGood: "Mycket bra",
      average: "Genomsnittligt",
      poor: "Svagt",
      missingImage: "Bild saknas",
      removeSaved: "Ta bort från sparade",
      saveCar: "Spara bilen",
      removeFromCompare: "Ta bort från jämförelse",
      addToCompare: "Lägg till i jämförelse",
      compareLimitReached: "Jämförelsen är full (max 4 bilar)",
      reduced: "Sänkt",
      mileageUnit: "mil",
      marketValue: "Marknadsvärde",
      save: "Spara",
      belowMarket: (percent: number) => `${percent}% under marknaden`,
      aboveMarket: (percent: number) => `${percent}% över marknaden`,
      atMarket: "Vid uppskattat marknadsvärde",
      marketEstimatePending: "Marknadsestimat inväntas",
      insufficientMarketData: (count: number) =>
        `${count} jämförbara ${count === 1 ? "bil" : "bilar"}; minst 3 krävs`,
      dealScoreHelp: "Prisets attraktivitet jämfört med liknande bilar.",
      confidenceHelp: "Helhetsbedömning av kvalitet, ägandekostnad och risk.",
      financingFrom: "Finansiering från",
      perMonth: "/mån",
      dealerBadge: "Handlare",
      privateSellerBadge: "Privat",
      posted: "Publicerad",
      firstSeen: "Först sedd",
      distanceAway: (distanceKm: number) => `${distanceKm} km bort`,
      viewListing: "Visa annons",
      scoreOutOf: (label: string, value: number) => `${label}: ${value} av 100`,
    },
    detail: {
      back: "Tillbaka till resultat",
      previousPhoto: "Föregående bild",
      nextPhoto: "Nästa bild",
      photoPosition: (index: number, total: number) => `Bild ${index} av ${total}`,
      dealScoreTitle: "Deal Score",
      buyConfidenceTitle: "Köptrygghet",
      whyThisScore: "Varför detta betyg",
      marketValueTitle: "Uppskattat marknadsvärde",
      marketRange: "Trolig prisspann",
      comparablePricesLabel: "Jämförbara annonser",
      thisCarLabel: "Den här bilen",
      analyseModel: (model: string) => `Analysera marknaden för ${model}`,
      ownershipCostTitle: "Uppskattad årlig ägandekostnad",
      ownershipCostCaption: (km: number) =>
        `Baserat på ${km.toLocaleString("sv-SE")} km per år`,
      equipmentTitle: "Utrustning",
      equipmentShowAll: (count: number) => `Visa alla ${count}`,
      equipmentShowLess: "Visa färre",
      specificationsTitle: "Specifikationer",
      engine: "Motor",
      horsepower: "Effekt",
      fuelConsumption: "Bränsleförbrukning",
      fuelConsumptionEstimated: (value: string) => `~${value} (uppskattat)`,
      drivetrain: "Drivning",
      serviceHistory: "Servicehistorik",
      owners: "Ägare",
      warranty: "Garanti",
      registrationNumber: "Registreringsnummer",
      vin: "Chassinummer",
      firstRegistration: "Först registrerad",
      notFoundTitle: "Bilen hittades inte",
      notFoundBody: "Annonsen kan ha tagits bort eller sålts.",
      backToSearch: "Tillbaka till sökningen",
      factorImpact: {
        positive: "Positiv faktor",
        neutral: "Neutral faktor",
        negative: "Negativ faktor",
      },
      factorTiers: [
        "Långt under snittet",
        "Under snittet",
        "Genomsnittligt",
        "Över snittet",
        "Långt över snittet",
      ],
      ownershipCostBreakdown: "Uppskattad kostnadsfördelning",
      ownershipCostCategories: {
        depreciation: "Värdeminskning",
        energy: "Drivmedel/el",
        insurance: "Försäkring",
        maintenance: "Underhåll",
        tax: "Skatt",
      },
    },
    compare: {
      title: "Jämför bilar",
      emptyBody: "Lägg till bilar att jämföra genom att markera jämför-kryssrutan på en annons.",
      browseCta: "Bläddra bland bilar",
      selectedCount: (count: number) => `${count} valda`,
      clearAll: "Rensa alla",
      viewComparison: "Jämför",
      remove: "Ta bort",
      price: "Pris",
      marketValue: "Marknadsvärde",
      dealScore: "Deal Score",
      mileage: "Miltal",
      year: "Årsmodell",
      sellerType: "Säljare",
      location: "Plats",
    },
    filterLabels: {
      max: "Max",
      from: "Från",
    },
    footer: {
      tagline: "Ett tryggare sätt att välja bil.",
      disclaimer: "Marknadsvärden och kostnader är uppskattningar, inte garantier.",
    },
  },
} as const;
