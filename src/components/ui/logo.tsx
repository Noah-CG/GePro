/** Logo de GePro, identique au favicon (src/app/icon.svg). */
export function Logo({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 112 112" width={size} height={size} className={className} role="img" aria-label="GePro">
      <rect width="112" height="112" rx="26" fill="#5B4BFF" />
      <g transform="translate(26 26) scale(0.714286) translate(-8 -8)">
        <path d="M8 8H62V62H8Z M22 22V48H48V22Z" fill="#FFFFFF" />
        <path d="M38 38H92V92H38Z M52 52V78H78V52Z" fill="#B5AEFF" />
        <rect x="48" y="38" width="14" height="14" fill="#FFFFFF" />
      </g>
    </svg>
  );
}
