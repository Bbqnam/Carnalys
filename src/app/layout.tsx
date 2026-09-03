import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cookies } from "next/headers";
import { themeInitScript } from "@/features/search/theme";
import { AccountProvider } from "@/features/auth/account-provider";
import { getAccountBootstrap } from "@/features/auth/session";
import { AnalystChatProvider } from "@/features/analyst/analyst-chat-provider";
import { AnalystLauncher } from "@/features/analyst/analyst-launcher";
import { defaultLocale, isLocale, localeCookieName } from "@/features/search/locale";
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
  const [account, cookieStore] = await Promise.all([getAccountBootstrap(), cookies()]);
  const localeCookie = cookieStore.get(localeCookieName)?.value;
  const locale = isLocale(localeCookie) ? localeCookie : defaultLocale;
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
          <AnalystChatProvider initialLocale={locale}>
            {children}
            <AnalystLauncher initialLocale={locale} />
          </AnalystChatProvider>
        </AccountProvider>
      </body>
    </html>
  );
}
