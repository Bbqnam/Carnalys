import Image, { type StaticImageData } from "next/image";
import abarth from "@/logos/abarth.png";
import aiways from "@/logos/aiways.png";
import alfaRomeo from "@/logos/alfa-romeo.png";
import alpine from "@/logos/alpine.png";
import audi from "@/logos/audi.png";
import bmw from "@/logos/bmw.png";
import bugatti from "@/logos/bugatti.png";
import buick from "@/logos/buick.png";
import byd from "@/logos/byd.png";
import cupra from "@/logos/cupra.png";
import dodge from "@/logos/dodge.png";
import dongfeng from "@/logos/dongfeng.png";
import elaris from "@/logos/elaris.svg";
import firefly from "@/logos/firefly.svg";
import ford from "@/logos/ford.png";
import genesis from "@/logos/genesis.png";
import gmc from "@/logos/gmc.png";
import greatWall from "@/logos/great-wall.png";
import hongqi from "@/logos/hongqi.png";
import hyundai from "@/logos/hyundai.png";
import jaguar from "@/logos/jaguar.png";
import kgm from "@/logos/kgm.svg";
import kia from "@/logos/kia.png";
import lancia from "@/logos/lancia.png";
import landRover from "@/logos/land-rover.png";
import leapmotor from "@/logos/leapmotor.png";
import lexus from "@/logos/lexus.png";
import lincoln from "@/logos/lincoln.png";
import lotus from "@/logos/lotus.png";
import lynkAndCo from "@/logos/lynk-and-co.png";
import maxus from "@/logos/maxus.png";
import mazda from "@/logos/mazda.png";
import mercedesBenz from "@/logos/mercedes-benz.png";
import mg from "@/logos/mg.png";
import nio from "@/logos/nio.png";
import nissan from "@/logos/nissan.png";
import peugeot from "@/logos/peugeot.png";
import polestar from "@/logos/polestar.png";
import renault from "@/logos/renault.png";
import rivian from "@/logos/rivian.png";
import seat from "@/logos/seat.png";
import tesla from "@/logos/tesla.png";
import toyota from "@/logos/toyota.png";
import vinfast from "@/logos/vinfast.png";
import volkswagen from "@/logos/volkswagen.png";
import volvo from "@/logos/volvo.png";
import voyah from "@/logos/voyah.png";
import xpeng from "@/logos/xpeng.png";
import zeekr from "@/logos/zeekr.png";

const brandLogos: Record<string, StaticImageData> = {
  abarth,
  aiways,
  "alfa-romeo": alfaRomeo,
  alpine,
  audi,
  bmw,
  bugatti,
  buick,
  byd,
  cupra,
  dodge,
  dongfeng,
  elaris,
  firefly,
  ford,
  genesis,
  gmc,
  "great-wall": greatWall,
  hongqi,
  hyundai,
  jaguar,
  kgm,
  kia,
  lancia,
  "land-rover": landRover,
  leapmotor,
  lexus,
  lincoln,
  lotus,
  "lynk-and-co": lynkAndCo,
  maxus,
  mazda,
  "mercedes-benz": mercedesBenz,
  mg,
  nio,
  nissan,
  peugeot,
  polestar,
  renault,
  rivian,
  seat,
  tesla,
  toyota,
  vinfast,
  volkswagen,
  volvo,
  voyah,
  xpeng,
  zeekr,
};

// The local artwork above stays the preferred source. The catalog fills the
// gaps in the live inventory with actual marque artwork instead of initials.
const catalogLogoSlugs: Record<string, string> = {
  ac: "ac",
  amc: "american-motors",
  alpina: "alpina",
  ariel: "ariel",
  "aston-martin": "aston-martin",
  austin: "austin",
  "austin-healey": "austin-healey",
  bentley: "bentley",
  borgward: "borgward",
  cadillac: "cadillac",
  chevrolet: "chevrolet",
  chrysler: "chrysler",
  citroen: "citroen",
  cobra: "shelby",
  daf: "daf",
  dkw: "dkw",
  ds: "ds",
  dacia: "dacia",
  daewoo: "daewoo",
  daihatsu: "daihatsu",
  daimler: "daimler",
  datsun: "datsun",
  "de-tomaso": "de-tomaso",
  delorean: "dmc",
  edsel: "edsel",
  ferrari: "ferrari",
  fiat: "fiat",
  fisker: "fisker",
  gaz: "gaz",
  holden: "holden",
  honda: "honda",
  hudson: "hudson",
  hummer: "hummer",
  infiniti: "infiniti",
  international: "international-trucks",
  "international-harvester": "international-harvester",
  isuzu: "isuzu",
  iveco: "iveco",
  jeep: "jeep",
  jensen: "jensen",
  "kaiser-jeep": "kaiser",
  lada: "lada",
  lamborghini: "lamborghini",
  leyland: "leyland",
  luaz: "luaz",
  man: "man",
  mini: "mini",
  maserati: "maserati",
  matra: "matra",
  mclaren: "mclaren",
  mercury: "mercury",
  "mini-marcos": "marcos",
  mitsubishi: "mitsubishi",
  morgan: "morgan",
  morris: "morris",
  moskvitch: "moskvitch",
  oldsmobile: "oldsmobile",
  opel: "opel",
  packard: "packard",
  plymouth: "plymouth",
  pontiac: "pontiac",
  porsche: "porsche",
  ram: "ram",
  radical: "radical-sportscars",
  rambler: "rambler",
  "rolls-royce": "rolls-royce",
  rover: "rover",
  saab: "saab",
  shelby: "shelby",
  simca: "simca",
  skoda: "skoda",
  smart: "smart",
  ssangyong: "ssangyong",
  studebaker: "studebaker",
  subaru: "subaru",
  suzuki: "suzuki",
  tvr: "tvr",
  trabant: "trabant",
  triumph: "triumph",
  vauxhall: "vauxhall",
  willys: "willys-overland",
};

// A handful of historic marques are not present in the main catalog. These
// stable archive links point to their real badges/wordmarks.
const heritageLogoUrls: Record<string, string> = {
  "auto-union":
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Auto_Union_Logo_1932.svg?width=128",
  bmc: "https://upload.wikimedia.org/wikipedia/en/3/32/BMC_rosette.png",
  desoto:
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Desoto_brand_emblem.png",
  heinkel: "https://upload.wikimedia.org/wikipedia/en/a/a5/Heinkel_Logo.png",
  standard:
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Standard_Motor_Company_Limited_logo.jpg",
  sunbeam:
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Sunbeam_lion_badge.png",
  velorex:
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Velorex_-_logo_-_Muzeum_Motoryzacji_Topacz.jpg",
  zimmer:
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Zimmer_logo_2010.jpg",
};

function normalizeMake(make: string) {
  return make
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function CategoryMark({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-[35%] bg-[#edf3ef] text-[#436652] ring-1 ring-inset ring-[#d8e2da] ${className}`}
    >
      <svg className="size-[78%]" fill="none" viewBox="0 0 32 32">
        <path
          d="M5.25 19.2 7.8 13.7c.5-1.05 1.55-1.72 2.72-1.72h10.96c1.17 0 2.22.67 2.72 1.72l2.55 5.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
        <path
          d="M4.5 19.1c0-1.05.85-1.9 1.9-1.9h19.2c1.05 0 1.9.85 1.9 1.9v4.55c0 .75-.6 1.35-1.35 1.35h-1.4a2.75 2.75 0 0 0-5.5 0h-6.5a2.75 2.75 0 0 0-5.5 0h-1.4c-.75 0-1.35-.6-1.35-1.35V19.1Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
        <path d="M9.4 17.2h13.2M8.2 21h2M21.8 21h2" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    </span>
  );
}

function GlasMark({ className }: { className: string }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center ${className}`}>
      <svg className="size-full" viewBox="0 0 32 32">
        <circle cx="16" cy="16" fill="#e9e8e3" r="14.5" stroke="#153c31" strokeWidth="1.5" />
        <path d="M22.7 10.2A9 9 0 1 0 24 20h-8v-4h12c0 7.2-4.7 12-12 12A12 12 0 1 1 25.8 9Z" fill="#b4282e" />
        <circle cx="16" cy="16" fill="#f8f7f3" r="3.6" />
      </svg>
    </span>
  );
}

function HistoricWordmark({ brand, className }: { brand: "erskine" | "fordson"; className: string }) {
  if (brand === "erskine") {
    return (
      <span aria-hidden="true" className={`grid shrink-0 place-items-center ${className}`}>
        <svg className="size-full" viewBox="0 0 40 40">
          <path d="M7 5h26v19c0 7-5.5 10.2-13 13C12.5 34.2 7 31 7 24Z" fill="#162a43" stroke="#c7a85a" strokeWidth="2" />
          <path d="M11 10h18M11 27h18" stroke="#c7a85a" strokeWidth="1.4" />
          <text fill="#fff" fontFamily="Georgia, serif" fontSize="7.2" fontWeight="700" letterSpacing=".35" textAnchor="middle" x="20" y="21.5">
            ERSKINE
          </text>
        </svg>
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center ${className}`}>
      <svg className="size-full" viewBox="0 0 52 32">
        <ellipse cx="26" cy="16" fill="#173e73" rx="24" ry="12.5" stroke="#d7dce0" strokeWidth="2" />
        <text fill="#fff" fontFamily="Georgia, serif" fontSize="10.5" fontStyle="italic" fontWeight="700" textAnchor="middle" x="25.3" y="19.5">
          Fordson
        </text>
      </svg>
    </span>
  );
}

export function BrandLogo({ make, className = "size-5" }: { make: string; className?: string }) {
  const normalizedMake = normalizeMake(make);
  const localLogo = brandLogos[normalizedMake];
  const catalogSlug = catalogLogoSlugs[normalizedMake];
  const logo =
    localLogo ??
    heritageLogoUrls[normalizedMake] ??
    (catalogSlug ? `https://vl.imgix.net/img/${catalogSlug}-logo.png` : undefined);

  if (!logo) {
    if (normalizedMake === "glas") return <GlasMark className={className} />;
    if (normalizedMake === "erskine" || normalizedMake === "fordson") {
      return <HistoricWordmark brand={normalizedMake} className={className} />;
    }
    if (normalizedMake === "replica" || normalizedMake === "o-vriga") {
      return <CategoryMark className={className} />;
    }
    return null;
  }

  return (
    <span aria-hidden="true" className={`relative block shrink-0 ${className}`}>
      <Image alt="" className="object-contain" fill sizes="28px" src={logo} />
    </span>
  );
}
