/** Icône « fichier PDF » (feuille rouge marquée PDF). Décorative : le texte voisin porte le sens. */
export function PdfIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={(size * 3) / 4} height={size} viewBox="0 0 12 16" className={className} aria-hidden focusable="false">
      <path d="M1.5 0H8l4 4v10.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 0 14.5v-13A1.5 1.5 0 0 1 1.5 0Z" fill="#E5252A" />
      <path d="M8 0v2.5A1.5 1.5 0 0 0 9.5 4H12Z" fill="#F4A7A9" />
      <text x="6" y="12.6" fill="#fff" fontFamily="Arial, sans-serif" fontSize="4.4" fontWeight="700" textAnchor="middle">
        PDF
      </text>
    </svg>
  );
}
