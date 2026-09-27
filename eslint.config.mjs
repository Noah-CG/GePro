import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** ESLint (règles Next.js, React, hooks et TypeScript) : `npm run lint`. Le typage se vérifie avec `npm run typecheck`. */
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Variables volontairement ignorées : préfixe « _ » (déstructuration pour retirer un champ…).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
      // Règles du React Compiler, en avertissement : les motifs signalés sont voulus et sûrs ici
      // (lecture de localStorage après l'hydratation, remise à zéro des surcharges optimistes quand
      // les données du serveur changent, refs lues dans des gestionnaires d'événements, Date.now()
      // dans un Server Component). À revoir si le React Compiler est activé.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".pglite/**"]),
]);
