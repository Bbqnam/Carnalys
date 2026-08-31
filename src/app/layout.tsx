import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { themeInitScript } from "@/features/search/theme";
import { AccountProvider } from "@/features/auth/account-provider";
import { getAccountBootstrap } from "@/features/auth/session";
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const account = await getAccountBootstrap();
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
      <body className="min-h-full">
        <AccountProvider
          initialFavoriteIds={account.favoriteIds}
          initialUser={account.user}
          key={account.user?.id ?? "guest"}
        >
          {children}
        </AccountProvider>
      </body>
    </html>
  );
}
