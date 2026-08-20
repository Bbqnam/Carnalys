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
import skoda from "@/logos/skoda.png";
import tesla from "@/logos/tesla.png";
import toyota from "@/logos/toyota.png";
import vinfast from "@/logos/vinfast.png";
import volkswagen from "@/logos/volkswagen.png";
import volvo from "@/logos/volvo.png";
import voyah from "@/logos/voyah.png";
import xpeng from "@/logos/xpeng.png";
import zeekr from "@/logos/zeekr.png";
import { ManufacturerIcon } from "./icons";

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
  skoda,
  tesla,
  toyota,
  vinfast,
  volkswagen,
  volvo,
  voyah,
  xpeng,
  zeekr,
};

function normalizeMake(make: string) {
  return make
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function BrandLogo({ make, className = "size-5" }: { make: string; className?: string }) {
  const logo = brandLogos[normalizeMake(make)];

  if (!logo) {
    return <ManufacturerIcon className={className} />;
  }

  return (
    <span aria-hidden="true" className={`relative block shrink-0 ${className}`}>
      <Image alt="" className="object-contain" fill sizes="28px" src={logo} />
    </span>
  );
}
