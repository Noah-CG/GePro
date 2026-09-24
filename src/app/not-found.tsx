import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-4xl font-semibold text-muted">404</p>
      <p className="text-sm text-muted">Cette page n&apos;existe pas (ou plus).</p>
      <Link href="/" className="text-sm font-medium text-accent hover:underline">
        Retour au tableau de bord
      </Link>
    </main>
  );
}
