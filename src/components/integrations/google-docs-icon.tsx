/** Icône « document Google Docs » (feuille bleue à lignes blanches). Décorative : le texte voisin porte le sens. */
export function GoogleDocsIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={(size * 3) / 4} height={size} viewBox="0 0 12 16" className={className} aria-hidden focusable="false">
      <path d="M1.5 0H8l4 4v10.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 0 14.5v-13A1.5 1.5 0 0 1 1.5 0Z" fill="#4285F4" />
      <path d="M8 0v2.5A1.5 1.5 0 0 0 9.5 4H12Z" fill="#A1C2FA" />
      <path d="M3 7.5h6M3 9.75h6M3 12h4" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
