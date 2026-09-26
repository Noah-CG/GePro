import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";

/** Mise en page des pages de compte (connexion, inscription…) : logo, titre, carte, liens en pied. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/connexion" aria-label="GePro">
            <Logo className="mx-auto mb-4" />
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {children}
        {footer && <div className="mt-6 space-y-2 text-center text-sm text-muted">{footer}</div>}
      </div>
    </main>
  );
}

/** Carte blanche qui entoure un formulaire de compte. */
export function AuthCard({ children }: { children: ReactNode }) {
  return <div className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">{children}</div>;
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
      {children}
    </p>
  );
}

export function FormNotice({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-text">{children}</p>;
}
