import type { SVGProps } from "react";

/**
 * The Carnalys mark: a "C" whose counter holds a car in profile, nose
 * breaking out through the opening. Drawn as one flat shape in
 * `currentColor` so it inherits the surrounding text colour and needs no
 * per-theme asset; the counter and the wheel arches are genuine holes, so
 * whatever sits behind the mark shows through unchanged.
 *
 * Geometry is authored on a 64-unit grid: a ring of outer radius 27.5 and
 * inner radius 18.2 with sheared terminals, plus the car — drawn in its own
 * 100x32 box — scaled to 39 units wide and optically centred on the ring.
 */
export function CarnalysMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      fillRule="evenodd"
      viewBox="0 0 64 64"
      {...props}
    >
      <path d="M 49.68 10.93A27.5 27.5 0 1 0 48.93 53.67L 45.53 44.18A18.2 18.2 0 1 1 45.94 20.30Z" />
      <path
        d="M 4.0 32 C 1.6 32 0 29.9 0.2 27.4 L 0.7 22.8 C 0.9 19.9 3.0 17.6 5.9 16.9 L 26.0 12.0 L 34.6 4.0 C 36.4 2.3 38.8 1.3 41.3 1.3 L 62.0 1.3 C 65.2 1.3 68.2 2.8 70.1 5.4 L 77.8 16.0 L 89.6 18.8 C 95.6 20.3 100 25.7 100 31.9 L 100 32 L 92.5 32 A 7.6 7.6 0 0 0 77.3 32 L 26.2 32 A 7.6 7.6 0 0 0 11.0 32 Z"
        transform="translate(16.2 25.76) scale(0.39)"
      />
    </svg>
  );
}
