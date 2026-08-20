import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const iconDefaults = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 1.8,
  viewBox: "0 0 24 24",
};

export function SearchIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function HeartIcon({ fill = "none", ...props }: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} fill={fill} {...props}>
      <path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.3 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    </svg>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function SearchEmptyIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4 4M8 10.5h5" />
    </svg>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <path d="M14 5h5v5M13 11l6-6M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function ManufacturerIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <path d="M12 2.8 20 6v5.4c0 4.7-3.2 8.3-8 9.8-4.8-1.5-8-5.1-8-9.8V6l8-3.2Z" fill="currentColor" opacity="0.1" stroke="none" />
      <path d="M12 2.8 20 6v5.4c0 4.7-3.2 8.3-8 9.8-4.8-1.5-8-5.1-8-9.8V6l8-3.2Z" />
      <path d="m8.1 12 2.4-3.1h3L15.9 12M7.5 12h9v3.3h-1.3M9 15.3H7.5V12" />
      <circle cx="9.3" cy="15.3" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="15.3" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function VehicleModelIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="5" fill="currentColor" opacity="0.1" stroke="none" />
      <path d="m5.2 13 1.7-4.2A2 2 0 0 1 8.8 7.5h6.4a2 2 0 0 1 1.9 1.3l1.7 4.2M4.5 13h15v4.5h-2M6.5 17.5h-2V13" />
      <path d="M7.2 11h9.6" />
      <circle cx="7.7" cy="17.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="16.3" cy="17.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CalendarFilterIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <rect x="3" y="4.5" width="18" height="16.5" rx="4" fill="currentColor" opacity="0.1" stroke="none" />
      <rect x="3" y="4.5" width="18" height="16.5" rx="4" />
      <path d="M7.5 2.8v4M16.5 2.8v4M3 9h18" />
      <path d="M7 13h3M14 13h3M7 17h3M14 17h3" strokeWidth="1.5" />
    </svg>
  );
}

export function OdometerIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.1" stroke="none" />
      <path d="M5 17a8.5 8.5 0 1 1 14 0" />
      <path d="m12 12 4.8-3.2" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <path d="M7 17h10" />
    </svg>
  );
}

export function AllOptionsIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor" opacity="0.1" stroke="none" />
      <path d="M6 8h12M6 16h12" />
      <circle cx="10" cy="8" r="2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="16" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ElectricFuelIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <rect x="3.5" y="3" width="17" height="18" rx="5" fill="currentColor" opacity="0.1" stroke="none" />
      <path d="M8 5.5h8M9 18.5h6" />
      <path d="m13.2 7.2-4 6.2h3.2l-.8 4.1 3.8-6.1h-3.1l.9-4.2Z" fill="currentColor" opacity="0.2" />
      <path d="m13.2 7.2-4 6.2h3.2l-.8 4.1 3.8-6.1h-3.1l.9-4.2Z" />
    </svg>
  );
}

export function PlugInFuelIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <path d="M5 3.5h9a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-10Z" fill="currentColor" opacity="0.1" stroke="none" />
      <path d="M8 4.5v4M13 4.5v4M6.5 8.5h8v1.8a3.8 3.8 0 0 1-3.8 3.8H10v3.4a3 3 0 0 0 3 3h3.5" />
      <path d="m18.2 10.5-2.1 3.2h2l-1.2 3.3" fill="currentColor" opacity="0.2" />
      <path d="m18.2 10.5-2.1 3.2h2l-1.2 3.3" />
    </svg>
  );
}

export function HybridFuelIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <path d="M20 4.2C12 4.6 7.2 8 7.2 12.8c0 3 2.2 5 5.1 5 5 0 7.7-5.4 7.7-13.6Z" fill="currentColor" opacity="0.12" stroke="none" />
      <path d="M20 4.2C12 4.6 7.2 8 7.2 12.8c0 3 2.2 5 5.1 5 5 0 7.7-5.4 7.7-13.6Z" />
      <path d="M4.5 20c2.2-5.5 6.2-9 12.1-10.8" />
      <path d="m8.2 6.4-2.4 3.7h2.1l-1.2 3.3" />
    </svg>
  );
}

export function PetrolFuelIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <rect x="4" y="3" width="12" height="18" rx="3" fill="currentColor" opacity="0.1" stroke="none" />
      <path d="M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h15" />
      <path d="M7.2 6h6.6v5H7.2z" fill="currentColor" opacity="0.14" />
      <path d="M16 7h1.5l2 2.5V17a1.5 1.5 0 0 0 3 0v-5.5L20 9" />
    </svg>
  );
}

export function DieselFuelIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <path d="M12 2.5S6.2 9 6.2 14.1a5.8 5.8 0 0 0 11.6 0C17.8 9 12 2.5 12 2.5Z" fill="currentColor" opacity="0.1" stroke="none" />
      <path d="M12 2.5S6.2 9 6.2 14.1a5.8 5.8 0 0 0 11.6 0C17.8 9 12 2.5 12 2.5Z" />
      <path d="M9.3 12.2h5.4M9.3 15h5.4M10.5 17.8h3" />
      <circle cx="12" cy="8.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AutomaticTransmissionIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.1" stroke="none" />
      <circle cx="12" cy="12" r="8.2" />
      <path d="m8.7 16 3.3-9 3.3 9M10.1 12.5h3.8" />
      <path d="M17.3 7.2v3.3H14" />
    </svg>
  );
}

export function ManualTransmissionIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor" opacity="0.1" stroke="none" />
      <path d="M6.5 7v10M12 7v10M17.5 7v10M6.5 12h11" />
      <circle cx="6.5" cy="6.5" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17.5" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="6.5" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function EstateBodyIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} viewBox="0 0 64 32" {...props}>
      <ellipse cx="32" cy="27.5" rx="27" ry="1.5" fill="currentColor" opacity="0.08" stroke="none" />
      <path
        d="M3.5 22.8v-4.1c0-1.7 1-2.8 2.8-3.3l7.2-2.1 5-6.4c.8-1 1.8-1.5 3.2-1.5h18.6c1.5 0 2.8.5 3.9 1.6l6.8 6.8 6.6 1.8c2 .6 2.9 1.7 2.9 3.5v3.7h-4.8a6.1 6.1 0 0 0-11.8 0H20.1a6.1 6.1 0 0 0-11.8 0Z"
        fill="currentColor"
        opacity="0.16"
      />
      <path d="M3.5 22.8v-4.1c0-1.7 1-2.8 2.8-3.3l7.2-2.1 5-6.4c.8-1 1.8-1.5 3.2-1.5h18.6c1.5 0 2.8.5 3.9 1.6l6.8 6.8 6.6 1.8c2 .6 2.9 1.7 2.9 3.5v3.7h-4.8M43.9 22.8H20.1M8.3 22.8H3.5" />
      <path d="m20.5 7.7-4.2 5.5h14.1V7.7Zm12.5 0v5.5h14.1l-5.4-5.5Z" fill="currentColor" opacity="0.34" stroke="none" />
      <path d="M30.4 7.7v5.5M33 7.7v5.5M16.3 13.2h30.8M32 14.5v7.1M46.9 14.3l1.2 7.2" />
      <path d="M34.6 16.6h3.3M50.5 16.6h3.1M5.5 18.4h3.8M57 18.5h3.2" strokeWidth="1.3" />
      <circle cx="14.2" cy="23.4" r="4.4" fill="currentColor" stroke="none" />
      <circle cx="49.8" cy="23.4" r="4.4" fill="currentColor" stroke="none" />
      <circle cx="14.2" cy="23.4" r="1.7" fill="white" stroke="currentColor" strokeWidth="0.9" />
      <circle cx="49.8" cy="23.4" r="1.7" fill="white" stroke="currentColor" strokeWidth="0.9" />
    </svg>
  );
}

export function SuvBodyIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} viewBox="0 0 64 32" {...props}>
      <ellipse cx="32" cy="28" rx="27" ry="1.5" fill="currentColor" opacity="0.08" stroke="none" />
      <path d="M4 23.2V13.1c0-1.4.9-2.5 2.4-2.8l8.1-1.9 3.2-4.1h25.8l5.8 7.4 8.6 2.7c1.5.5 2.2 1.5 2.2 3v5.8h-4.8a6.2 6.2 0 0 0-12 0H20.7a6.2 6.2 0 0 0-12 0Z" fill="currentColor" opacity="0.17" stroke="none" />
      <path d="M4 23.2V13.1c0-1.4.9-2.5 2.4-2.8l8.1-1.9 3.2-4.1h25.8l5.8 7.4 8.6 2.7c1.5.5 2.2 1.5 2.2 3v5.8h-4.8M43.3 23.2H20.7M8.7 23.2H4" />
      <path d="m19.4 6.2-3.3 4.6h14V6.2Zm13.2 0v4.6h13.9l-3.8-4.6Z" fill="currentColor" opacity="0.35" stroke="none" />
      <path d="M30.1 6.2v4.6M32.6 6.2v4.6M16.1 10.8h30.4M31.3 12.2v9.7M47.1 12.3l1.3 9.3" />
      <path d="M17.2 2.8h27.2M20.7 2.8v1.5M41.5 2.8v1.5M34.2 15.4h3.4M51.5 16.2h3.2M4 16.2h3" strokeWidth="1.3" />
      <circle cx="14.7" cy="23.7" r="4.7" fill="currentColor" stroke="none" />
      <circle cx="49.3" cy="23.7" r="4.7" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="23.7" r="1.8" fill="white" stroke="currentColor" strokeWidth="0.9" />
      <circle cx="49.3" cy="23.7" r="1.8" fill="white" stroke="currentColor" strokeWidth="0.9" />
    </svg>
  );
}

export function SedanBodyIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} viewBox="0 0 64 32" {...props}>
      <ellipse cx="32" cy="27.5" rx="28" ry="1.5" fill="currentColor" opacity="0.08" stroke="none" />
      <path d="M3.5 23v-3.3c0-1.7 1.1-2.9 3.1-3.5l10.3-2.8 6.8-6.1c1.4-1.3 2.8-1.8 4.7-1.8h8.5c2.1 0 3.6.6 5.1 2l5.8 5.5 9.3 2.3c2.3.6 3.4 1.7 3.4 3.6V23h-4.9a6.1 6.1 0 0 0-11.8 0H20.1a6.1 6.1 0 0 0-11.8 0Z" fill="currentColor" opacity="0.16" stroke="none" />
      <path d="M3.5 23v-3.3c0-1.7 1.1-2.9 3.1-3.5l10.3-2.8 6.8-6.1c1.4-1.3 2.8-1.8 4.7-1.8h8.5c2.1 0 3.6.6 5.1 2l5.8 5.5 9.3 2.3c2.3.6 3.4 1.7 3.4 3.6V23h-4.9M43.8 23H20.1M8.3 23H3.5" />
      <path d="m25 7.7-6.1 5.6h12.3V7.7Zm8.7 0v5.6h11.5l-5.4-5.1c-.4-.4-1.1-.5-1.8-.5Z" fill="currentColor" opacity="0.35" stroke="none" />
      <path d="M31.2 7.7v5.6M33.7 7.7v5.6M18.9 13.3h26.3M32.4 14.6v7.1M46.2 14.5l1.2 7.1" />
      <path d="M35 16.6h3.4M6.2 18.8h4M56 17.5h4" strokeWidth="1.3" />
      <circle cx="14.2" cy="23.5" r="4.4" fill="currentColor" stroke="none" />
      <circle cx="49.7" cy="23.5" r="4.4" fill="currentColor" stroke="none" />
      <circle cx="14.2" cy="23.5" r="1.7" fill="white" stroke="currentColor" strokeWidth="0.9" />
      <circle cx="49.7" cy="23.5" r="1.7" fill="white" stroke="currentColor" strokeWidth="0.9" />
    </svg>
  );
}

export function HatchbackBodyIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" {...iconDefaults} viewBox="0 0 64 32" {...props}>
      <ellipse cx="31" cy="27.5" rx="26" ry="1.5" fill="currentColor" opacity="0.08" stroke="none" />
      <path d="M5 22.9v-3.7c0-1.6 1-2.7 2.8-3.2l8.3-2.4 5.1-6.3c1-1.2 2.3-1.8 4-1.8h9.5c1.8 0 3.2.6 4.5 1.8l9.2 8.4 5.9 1.5c1.7.5 2.5 1.5 2.5 3v2.7h-4.4a5.9 5.9 0 0 0-11.5 0H20.5a5.9 5.9 0 0 0-11.5 0Z" fill="currentColor" opacity="0.16" stroke="none" />
      <path d="M5 22.9v-3.7c0-1.6 1-2.7 2.8-3.2l8.3-2.4 5.1-6.3c1-1.2 2.3-1.8 4-1.8h9.5c1.8 0 3.2.6 4.5 1.8l9.2 8.4 5.9 1.5c1.7.5 2.5 1.5 2.5 3v2.7h-4.4M40.9 22.9H20.5M9 22.9H5" />
      <path d="m23 7.7-4.6 5.8h12.3V7.7Zm10.2 0v5.8h11.9l-7-5.8Z" fill="currentColor" opacity="0.35" stroke="none" />
      <path d="M30.7 7.7v5.8M33.2 7.7v5.8M18.4 13.5h26.7M31.9 14.8v6.9M46.5 14.9l2.2 6.8" />
      <path d="M34.5 16.7h3.3M7.2 18.6h3.7M52.2 18.6h4.1" strokeWidth="1.3" />
      <circle cx="14.8" cy="23.4" r="4.3" fill="currentColor" stroke="none" />
      <circle cx="46.7" cy="23.4" r="4.3" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="23.4" r="1.7" fill="white" stroke="currentColor" strokeWidth="0.9" />
      <circle cx="46.7" cy="23.4" r="1.7" fill="white" stroke="currentColor" strokeWidth="0.9" />
    </svg>
  );
}
