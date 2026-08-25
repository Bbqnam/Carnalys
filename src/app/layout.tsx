import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { themeInitScript } from "@/features/search/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Carnalys",
  description:
    "Compare used cars in Sweden by market value, Deal Score, buy confidence and estimated ownership cost.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Must run before first paint, synchronously, to avoid a flash
            of the wrong theme; can't wait for a hydrated component. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
