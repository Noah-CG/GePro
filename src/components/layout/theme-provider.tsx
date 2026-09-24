"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * next-themes insère un <script> qui pose le thème avant l'hydratation (pas de flash). Il ne
 * s'exécute que depuis le HTML du serveur ; côté navigateur, React 19 signale ce <script> en
 * développement. On le marque donc comme bloc de données côté client, où il ne sert plus.
 */
const clientScriptProps = typeof window === "undefined" ? undefined : { type: "application/json" };

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider scriptProps={clientScriptProps} {...props} />;
}
