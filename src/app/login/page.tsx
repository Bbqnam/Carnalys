import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "@/features/auth/auth-form";
import { getCurrentUser } from "@/features/auth/session";
import { CarnalysMark } from "@/features/search/carnalys-mark";
import { defaultLocale, isLocale, localeCookieName } from "@/features/search/locale";

export const metadata = { title: "Sign in · Carnalys" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; redirectTo?: string }>;
}) {
  const [user, parameters, cookieStore] = await Promise.all([
    getCurrentUser(),
    searchParams,
    cookies(),
  ]);
  if (user) redirect("/settings");
  const localeValue = cookieStore.get(localeCookieName)?.value;
  const locale = isLocale(localeValue) ? localeValue : defaultLocale;
  const redirectTo = parameters.redirectTo?.startsWith("/") && !parameters.redirectTo.startsWith("//")
    ? parameters.redirectTo
    : "/";

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-5 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,var(--hero-glow-1),transparent_35%),radial-gradient(circle_at_80%_80%,var(--hero-glow-2),transparent_38%)] opacity-60" />
      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-7 flex items-center gap-2.5 text-ink">
          <CarnalysMark className="size-9" />
          <span className="text-sm font-semibold uppercase tracking-[0.18em]">Carnalys</span>
        </div>
        <AuthForm
          initialMode={parameters.mode === "register" ? "register" : "login"}
          locale={locale}
          redirectTo={redirectTo}
        />
      </div>
    </main>
  );
}
