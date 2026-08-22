import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { themeInitScript } from "@/features/search/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Carnalysis",
  description:
    "Compare used cars in Sweden by market value, Deal Score, buy confidence and estimated ownership cost.",
  icons: {
    icon: [{ url: "/icon.png?v=car-finder-2", type: "image/png", sizes: "512x512" }],
    shortcut: "/icon.png?v=car-finder-2",
    apple: [{ url: "/icon.png?v=car-finder-2", sizes: "512x512" }],
  },
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
