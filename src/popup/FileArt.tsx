import { useState } from 'react';
import { ART_LABEL, type ArtKind } from './fileArt';

/** Hand-drawn artwork per kind of file. Warm copper palette, readable on dark and light windows. */
const C = { hi: '#ffd7a1', mid: '#f59a3b', low: '#b9561b', ink: '#2b160b', paper: '#fff4e3', line: '#e3b985' };

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={C.hi} />
        <stop offset="0.55" stopColor={C.mid} />
        <stop offset="1" stopColor={C.low} />
      </linearGradient>
      <linearGradient id={`${id}-d`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3b2314" />
        <stop offset="1" stopColor="#1b0f08" />
      </linearGradient>
    </defs>
  );
}

function Art({ kind, id }: { kind: ArtKind; id: string }) {
  const g = `url(#${id}-g)`;
  const d = `url(#${id}-d)`;
  switch (kind) {
    case 'iso':
      return (
        <>
          <circle cx="60" cy="60" r="46" fill={d} stroke={g} strokeWidth="3" />
          <circle cx="60" cy="60" r="38" fill="none" stroke={C.mid} strokeOpacity=".35" />
          <path d="M22 52a40 40 0 0 1 36-30" fill="none" stroke={C.hi} strokeWidth="3" strokeLinecap="round" opacity=".8" />
          <circle cx="60" cy="60" r="17" fill={g} />
          <circle cx="60" cy="60" r="6" fill={C.ink} />
          <rect x="40" y="86" width="40" height="15" rx="4" fill={C.ink} stroke={g} strokeWidth="2" />
          <text x="60" y="97.5" textAnchor="middle" fontSize="10" fontWeight="800" fill={C.hi} fontFamily="system-ui,sans-serif">ISO</text>
        </>
      );
    case 'software':
      return (
        <>
          <path d="M60 14 100 34v46L60 102 20 80V34z" fill={g} />
          <path d="M60 14 100 34 60 54 20 34z" fill={C.hi} opacity=".85" />
          <path d="M60 54v48L20 80V34z" fill={C.mid} opacity=".9" />
          <path d="M60 54v48l40-22V34z" fill={C.low} />
          <path d="M60 14 100 34v46L60 102 20 80V34z" fill="none" stroke={C.ink} strokeOpacity=".35" strokeWidth="2" strokeLinejoin="round" />
        </>
      );
    case 'pdf':
      return (
        <>
          <path d="M28 12h46l22 22v74H28z" fill={C.paper} stroke={C.line} strokeWidth="2" strokeLinejoin="round" />
          <path d="M74 12v22h22" fill="#f1d3a8" stroke={C.line} strokeWidth="2" strokeLinejoin="round" />
          <rect x="28" y="50" width="68" height="26" fill="#d83a2e" />
          <text x="62" y="69" textAnchor="middle" fontSize="17" fontWeight="800" fill="#fff" fontFamily="system-ui,sans-serif">PDF</text>
          <path d="M38 88h48M38 97h34" stroke={C.line} strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case 'audio':
      return (
        <>
          <rect x="14" y="14" width="92" height="92" rx="14" fill={d} stroke={g} strokeWidth="3" />
          <circle cx="60" cy="60" r="31" fill={C.ink} stroke={C.mid} strokeOpacity=".5" />
          <circle cx="60" cy="60" r="22" fill="none" stroke={C.mid} strokeOpacity=".3" />
          <circle cx="60" cy="60" r="9" fill={g} />
          <path d="M70 38v26a6 6 0 1 1-3-5V44l-14 4v20a6 6 0 1 1-3-5V45z" fill={C.hi} transform="translate(2 -3) scale(.9)" />
        </>
      );
    case 'archive':
      return (
        <>
          <rect x="18" y="40" width="84" height="60" rx="6" fill={g} />
          <rect x="14" y="26" width="92" height="22" rx="6" fill={C.hi} stroke={C.low} strokeOpacity=".5" strokeWidth="2" />
          <rect x="52" y="26" width="16" height="74" fill={C.ink} opacity=".75" />
          <path d="M60 52v6M60 64v6M60 76v6" stroke={C.hi} strokeWidth="3" strokeLinecap="round" />
          <rect x="18" y="40" width="84" height="60" rx="6" fill="none" stroke={C.ink} strokeOpacity=".3" strokeWidth="2" />
        </>
      );
    case 'image':
      return (
        <>
          <rect x="12" y="20" width="96" height="80" rx="10" fill={C.paper} stroke={g} strokeWidth="4" />
          <circle cx="40" cy="45" r="9" fill={C.mid} />
          <path d="M16 92l30-34 20 22 14-14 28 26z" fill={g} />
          <path d="M16 92l30-34 20 22" fill="none" stroke={C.ink} strokeOpacity=".25" strokeWidth="2" />
        </>
      );
    case 'video':
      return (
        <>
          <rect x="10" y="22" width="100" height="76" rx="10" fill={d} stroke={g} strokeWidth="3" />
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <rect x={16 + i * 20} y="26" width="9" height="7" rx="2" fill={C.mid} opacity=".7" />
              <rect x={16 + i * 20} y="87" width="9" height="7" rx="2" fill={C.mid} opacity=".7" />
            </g>
          ))}
          <path d="M50 44v32l28-16z" fill={g} />
        </>
      );
    case 'document':
      return (
        <>
          <path d="M28 12h46l22 22v74H28z" fill={C.paper} stroke={C.line} strokeWidth="2" strokeLinejoin="round" />
          <path d="M74 12v22h22" fill="#f1d3a8" stroke={C.line} strokeWidth="2" strokeLinejoin="round" />
          <rect x="38" y="46" width="34" height="7" rx="3" fill={C.mid} />
          <path d="M38 64h50M38 74h50M38 84h50M38 94h30" stroke={C.line} strokeWidth="3.5" strokeLinecap="round" />
        </>
      );
    case 'font':
      return (
        <>
          <path d="M28 12h46l22 22v74H28z" fill={C.paper} stroke={C.line} strokeWidth="2" strokeLinejoin="round" />
          <path d="M74 12v22h22" fill="#f1d3a8" stroke={C.line} strokeWidth="2" strokeLinejoin="round" />
          <text x="62" y="82" textAnchor="middle" fontSize="40" fontWeight="700" fill={C.low} fontFamily="Georgia,serif">Aa</text>
          <path d="M38 94h48" stroke={C.line} strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case 'code':
      return (
        <>
          <rect x="10" y="20" width="100" height="80" rx="10" fill={d} stroke={g} strokeWidth="3" />
          <circle cx="24" cy="32" r="3.5" fill="#ef6a5b" />
          <circle cx="36" cy="32" r="3.5" fill={C.hi} />
          <circle cx="48" cy="32" r="3.5" fill="#6cc17a" />
          <path d="M46 62 32 72l14 10M74 62l14 10-14 10M66 56 54 88" fill="none" stroke={g} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    default:
      return (
        <>
          <path d="M28 12h46l22 22v74H28z" fill={C.paper} stroke={C.line} strokeWidth="2" strokeLinejoin="round" />
          <path d="M74 12v22h22" fill="#f1d3a8" stroke={C.line} strokeWidth="2" strokeLinejoin="round" />
          <path d="M40 64h44M40 76h44M40 88h26" stroke={C.line} strokeWidth="3.5" strokeLinecap="round" />
        </>
      );
  }
}

/**
 * The picture shown for a download. A real thumbnail (`src`) wins when there is one (finished images),
 * and falls back to the artwork if it cannot be loaded.
 */
export function FileArt({ kind, size = 96, src, className }: { kind: ArtKind; size?: number; src?: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  const id = `art-${kind}`;
  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface2 ${className ?? ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={ART_LABEL[kind]}
      data-testid="file-art"
      data-kind={kind}
    >
      {src && !broken ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <svg viewBox="0 0 120 120" width={size * 0.86} height={size * 0.86} aria-hidden>
          <Defs id={id} />
          <Art kind={kind} id={id} />
        </svg>
      )}
    </div>
  );
}
