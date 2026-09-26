import { redirect } from "next/navigation";
import { suiteQuery } from "@/lib/invitations";

type Props = { searchParams: Promise<{ suite?: string }> };

/** Ancienne adresse de la page de connexion (favoris, liens déjà envoyés) : renvoie vers /connexion. */
export default async function LegacyLoginPage({ searchParams }: Props) {
  redirect(`/connexion${suiteQuery((await searchParams).suite)}`);
}
