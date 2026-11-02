import React, { createContext, useContext } from "react";

/* The welcome cast lives here rather than in a downloaded render: a first launch has to look
   finished on a phone with no network at all, and a vector student weighs a few kilobytes next
   to a raster image. Volume comes from layered gradients, a core shadow and a rim light, so the
   same figure reads as modelled rather than flat. Because the parts are separate nodes, the
   eyes can blink and an arm can wave — which a flat picture cannot do.

   If a real 3D render is ever produced, drop it at src/assets/images/onboarding/screen-<n>.png
   and Scene() uses it, keeping this vector layer as the animated prop overlay and the fallback. */

/* Scene sets this when a raster render has been dropped in for the screen. The vector cast
   stands down so the render is not drawn over, while the prop chips keep animating on top. */
const RasterCtx = createContext(false);

/* Scenes use this to slide their vector props clear of a render's silhouette. */
export function useHasRaster() {
  return useContext(RasterCtx);
}

export const BRAND = {
  navy: "#142B4A",
  navyDeep: "#0B1B31",
  navyLift: "#22406B",
  blue: "#2878D0",
  blueDark: "#1C5AA0",
  blueSoft: "#7FB6EC",
  gold: "#D9AD50",
  goldDark: "#A87E2C",
  goldSoft: "#F1DBA6",
  cream: "#F2E8D7",
  creamDark: "#D8C9AC",
  white: "#FFFFFF",
  paper: "#F7F8FA",
  teal: "#1D624F",
  tealDark: "#134A3B",
  line: "#DFE6EF",
  text: "#B9C6D6"
};

/* Four tones, each with the four values a face needs to look round rather than printed. */
export const SKIN = {
  warm: { lit: "#c08a5e", base: "#a9754f", shade: "#7d5334", dark: "#59381f" },
  deep: { lit: "#a06c46", base: "#8d5a3c", shade: "#63391f", dark: "#452512" },
  rich: { lit: "#875a3e", base: "#6f4a33", shade: "#4a2e1c", dark: "#31190d" }
};

const HAIR = {
  black: { lit: "#3a3230", base: "#241d1b", shade: "#120f0e" },
  brown: { lit: "#5d3f2f", base: "#42291f", shade: "#221410" }
};

/* ------------------------------------------------------------------ shading */

function Defs({ id, skin, cloth, clothDark, hair }) {
  const h = HAIR[hair] || HAIR.black;
  return (
    <defs>
      <radialGradient id={`${id}-skin`} cx="34%" cy="26%" r="82%">
        <stop offset="0%" stopColor={skin.lit} />
        <stop offset="58%" stopColor={skin.base} />
        <stop offset="100%" stopColor={skin.shade} />
      </radialGradient>
      <linearGradient id={`${id}-cloth`} x1="0.1" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stopColor={cloth} />
        <stop offset="55%" stopColor={cloth} />
        <stop offset="100%" stopColor={clothDark} />
      </linearGradient>
      {/* userSpaceOnUse, not the default objectBoundingBox: the crown is built from several small
          circles and each one would otherwise re-sample the whole light-to-dark ramp across its own
          10px box, so every circle lands a shade off the cap and reads as a bald patch. */}
      <linearGradient id={`${id}-hair`} gradientUnits="userSpaceOnUse" x1="80" y1="28" x2="140" y2="92">
        <stop offset="0%" stopColor={h.lit} />
        <stop offset="48%" stopColor={h.base} />
        <stop offset="100%" stopColor={h.shade} />
      </linearGradient>
      {/* one light source for the whole figure: white falling from the upper left */}
      <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.42" />
        <stop offset="42%" stopColor="#ffffff" stopOpacity="0.05" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
      </linearGradient>
      <radialGradient id={`${id}-halo`} cx="50%" cy="42%" r="55%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/* --------------------------------------------------------------------- hair */

function CurlyHair({ id }) {
  const puffs = [[110, 26, 16], [82, 34, 14], [138, 34, 14], [68, 52, 12], [152, 52, 12], [64, 72, 10], [156, 72, 10]];
  return (
    <g>
      <ellipse cx="110" cy="60" rx="41" ry="32" fill={`url(#${id}-hair)`} />
      {puffs.map(([cx, cy, r], i) => (
        <circle key={`b${i}`} cx={cx} cy={cy} r={r} fill={`url(#${id}-hair)`} />
      ))}
      {/* only the lit crowning puffs get a specular dot — the ones down by the jaw are in
          shadow, and a highlight on each of them turns the hair into polka dots */}
      {puffs.slice(0, 4).map(([cx, cy, r], i) => (
        <circle key={`h${i}`} cx={cx - r * 0.34} cy={cy - r * 0.38} r={r * 0.26} fill="#ffffff" opacity="0.1" />
      ))}
      <path d="M74 46c8-14 24-20 36-19" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="5" strokeLinecap="round" fill="none" />
    </g>
  );
}

function BunHair({ id }) {
  return (
    <g>
      <ellipse cx="110" cy="30" rx="17" ry="15" fill={`url(#${id}-hair)`} />
      <circle cx="104" cy="25" r="5" fill="#ffffff" opacity="0.15" />
      <ellipse cx="110" cy="56" rx="38" ry="26" fill={`url(#${id}-hair)`} />
      {[
        [86, 40, 12],
        [134, 40, 12],
        [76, 58, 9],
        [144, 58, 9]
      ].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={`url(#${id}-hair)`} />
      ))}
      <path d="M96 54c6-12 22-12 28 0" stroke="#ffffff" strokeOpacity="0.1" strokeWidth="4" fill="none" strokeLinecap="round" />
    </g>
  );
}

function ShortHair({ id }) {
  return (
    <g>
      <path d="M110 26c23 0 37 15 37 36 0 5-1 9-3 11-3-15-15-21-34-21s-31 6-34 21c-2-2-3-6-3-11 0-21 14-36 37-36z" fill={`url(#${id}-hair)`} />
      {[
        [92, 38, 5],
        [104, 33, 6],
        [118, 33, 6],
        [130, 39, 5]
      ].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={`url(#${id}-hair)`} />
      ))}
      {/* sits on the crown curve, not across it — a wide axis-aligned oval here reads as a bald spot */}
      <ellipse cx="97" cy="36" rx="11" ry="3.2" fill="#ffffff" opacity="0.08" />
    </g>
  );
}

/* --------------------------------------------------------------------- face */

/* A stylised eye is mostly iris: a wide white band reads as surprise, and on deeper skin it glows
   like a cartoon ghost. One catchlight is what makes it look wet and alive. */
function Eye({ cx: cxProp, cy: cyProp, lashes }) {
  /* Callers pass these as strings taken from JSX attributes, so `cx + 0.3` would concatenate
     into "970.3" and drop the iris far outside the viewBox. */
  const cx = Number(cxProp);
  const cy = Number(cyProp);
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx="6.6" ry="5.5" fill="#f6f2ee" opacity="0.92" />
      <circle cx={cx + 0.3} cy={cy + 0.4} r="4.4" fill="#2f1c11" />
      <circle cx={cx + 0.3} cy={cy + 0.4} r="2.2" fill="#120a06" />
      <circle cx={cx - 1.8} cy={cy - 2} r="1.5" fill="#ffffff" opacity="0.95" />
      <circle cx={cx + 2.4} cy={cy + 2.6} r="0.8" fill="#ffffff" opacity="0.45" />
      <path
        d={`M${cx - 7.6} ${cy - 2.4}c2-4.4 12-4.4 15 0`}
        stroke="#1b1512"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      {lashes ? <path d={`M${cx + 6.6} ${cy - 3.6}l4-3`} stroke="#1b1512" strokeWidth="1.8" strokeLinecap="round" /> : null}
    </g>
  );
}

function Face({ id, skin, glasses, blush, lashes }) {
  return (
    <g>
      {/* ears sit behind the head shape so only their rim shows */}
      <g fill={skin.base}>
        <ellipse cx="77" cy="82" rx="6" ry="9" />
        <ellipse cx="143" cy="82" rx="6" ry="9" />
      </g>
      <ellipse cx="110" cy="78" rx="33" ry="35" fill={`url(#${id}-skin)`} />
      {/* rim light down the lit side, core shadow on the far one */}
      <path d="M84 60c-6 12-6 30 2 44" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="4" strokeLinecap="round" fill="none" />
      <ellipse cx="131" cy="88" rx="14" ry="20" fill={skin.shade} opacity="0.2" />
      <ellipse cx="97" cy="64" rx="16" ry="12" fill="#ffffff" opacity="0.1" />
      {blush ? (
        <g fill="#d9695a" opacity="0.14">
          <ellipse cx="87" cy="88" rx="8" ry="5" />
          <ellipse cx="133" cy="88" rx="8" ry="5" />
        </g>
      ) : null}
      <g className="ob-blink">
        <Eye cx="97" cy="78" lashes={lashes} />
        <Eye cx="123" cy="78" lashes={lashes} />
      </g>
      <g stroke="#241710" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.8">
        <path d="M88 66c4-3 13-3 17 1M115 67c4-4 13-4 17-1" />
      </g>
      <path d="M108 84c2 4 3 6 1 8" stroke={skin.dark} strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.7" />
      <path d="M99 96c6 6 16 6 22 0" stroke="#3d2418" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M102 97c4 3 12 3 16 0" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      {/* the neck and its shadow belong behind the torso, not here: Face paints last, so a neck
          drawn in here lands on top of the collar and reads as a box pasted on the shirt. */}
      {glasses ? (
        <g stroke={BRAND.navy} strokeWidth="2.6" fill="#ffffff" fillOpacity="0.16">
          <rect x="82" y="67" width="28" height="23" rx="10" />
          <rect x="110" y="67" width="28" height="23" rx="10" />
          <path d="M110 78h-1" strokeWidth="3" />
          <path d="M82 76 70 73M138 76l12-3" strokeWidth="2.2" fill="none" />
          <path d="M86 72l6-3" stroke="#ffffff" strokeWidth="2" strokeOpacity="0.7" fill="none" />
        </g>
      ) : null}
    </g>
  );
}

/* -------------------------------------------------------------------- body */

function Torso({ id, cloth, clothDark, collar, hood }) {
  return (
    <g>
      <path d="M110 116c-21 0-35 11-37 27l-3 35h80l-3-35c-2-16-16-27-37-27z" fill={`url(#${id}-cloth)`} />
      {/* same light source as the face: bright shoulder, shaded flank */}
      <path d="M74 130c-3 12-4 30-3 44" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="5" strokeLinecap="round" fill="none" />
      <ellipse cx="146" cy="152" rx="10" ry="28" fill={clothDark} opacity="0.4" />
      <path d="M96 118c6 9 22 9 28 0l-4 11h-20z" fill="#ffffff" opacity="0.16" />
      {collar ? <path d="M98 119l12 13 12-13" stroke={collar} strokeWidth="3.4" fill="none" strokeLinecap="round" /> : null}
      {hood ? (
        <g>
          <path d="M86 120c-4 10-2 20 4 26h40c6-6 8-16 4-26-8 8-40 8-48 0z" fill={clothDark} opacity="0.55" />
          <path d="M104 132v10M116 132v10" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      ) : null}
      <path d="M73 172h74l1 8H72z" fill={clothDark} opacity="0.45" />
    </g>
  );
}

function Backpack({ id, cloth, side = -1 }) {
  return (
    <g transform={`translate(${side * 54} 4)`}>
      <rect x="92" y="112" width="38" height="52" rx="15" fill={`url(#${id}-cloth)`} opacity="0.92" />
      <rect x="92" y="112" width="38" height="52" rx="15" fill="#000000" opacity="0.12" />
      <rect x="98" y="124" width="26" height="10" rx="5" fill="#ffffff" opacity="0.25" />
      <path d="M111 112c-8 0-13 5-13 12" stroke={cloth} strokeWidth="3" fill="none" opacity="0.6" />
    </g>
  );
}

function Straps({ id }) {
  return (
    <g stroke={`url(#${id}-cloth)`} strokeWidth="7" strokeLinecap="round" fill="none" opacity="0.95">
      <path d="M96 122c-4 14-4 30-2 44" />
      <path d="M124 122c4 14 4 30 2 44" />
    </g>
  );
}

/* An arm is a rounded stroke with its own gradient, so it reads as a tube in space. */
function Sleeve({ id, d }) {
  return <path d={d} stroke={`url(#${id}-cloth)`} strokeWidth="15" strokeLinecap="round" fill="none" />;
}

/* The hand is its own node because it is the part that actually moves. Everything animated here
   pivots on its own bounding box, never on a joint offset, so the motion survives a browser that
   disagrees about transform-origin. */
function Hand({ x, y, skin, rotate = 0, wave }) {
  const hand = (
    <g>
      <circle cx="0" cy="0" r="9.5" fill={skin.base} />
      <circle cx="-3" cy="-4" r="5" fill={skin.lit} opacity="0.55" />
      <ellipse cx="8" cy="3" rx="4" ry="5.5" fill={skin.base} transform="rotate(28 8 3)" />
      <path d="M-6 5h11" stroke={skin.shade} strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
    </g>
  );
  if (!wave) return <g transform={`translate(${x} ${y}) rotate(${rotate})`}>{hand}</g>;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={wave}>
        <g transform={`rotate(${rotate})`}>{hand}</g>
      </g>
    </g>
  );
}

function Legs({ id, bottom, shoes, seated }) {
  if (seated) {
    return (
      <g>
        <rect x="78" y="178" width="64" height="18" rx="9" fill={bottom} />
        <rect x="84" y="190" width="17" height="30" rx="8.5" fill={bottom} />
        <rect x="119" y="190" width="17" height="30" rx="8.5" fill={bottom} />
        <rect x="84" y="190" width="17" height="30" rx="8.5" fill="#ffffff" opacity="0.08" />
        <ellipse cx="92" cy="224" rx="15" ry="7.5" fill={shoes} />
        <ellipse cx="128" cy="224" rx="15" ry="7.5" fill={shoes} />
        <path d="M79 224h26M115 224h26" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    );
  }
  return (
    <g>
      <rect x="86" y="176" width="19" height="44" rx="9.5" fill={bottom} />
      <rect x="115" y="176" width="19" height="44" rx="9.5" fill={bottom} />
      <rect x="86" y="176" width="19" height="44" rx="9.5" fill={`url(#${id}-halo)`} opacity="0.35" />
      <rect x="127" y="176" width="7" height="44" rx="3.5" fill="#000000" opacity="0.13" />
      <ellipse cx="92" cy="224" rx="15" ry="7.5" fill={shoes} />
      <ellipse cx="128" cy="224" rx="15" ry="7.5" fill={shoes} />
      <path d="M79 224h26M115 224h26" stroke={BRAND.navy} strokeOpacity="0.35" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function Ground() {
  return (
    <g>
      <ellipse cx="110" cy="232" rx="60" ry="9" fill="#0b1626" opacity="0.18" />
      <ellipse cx="110" cy="231" rx="34" ry="5" fill="#0b1626" opacity="0.14" />
    </g>
  );
}

/* ------------------------------------------------------------------- props */

export function Book({ open = true, tint = BRAND.cream, cover = BRAND.blueDark }) {
  return open ? (
    <g>
      <path d="M68 148c17-9 30-9 42 0 12-9 25-9 42 0v36c-17-9-30-9-42 0-12-9-25-9-42 0z" fill={tint} stroke="#cbb894" strokeWidth="2" strokeLinejoin="round" />
      <path d="M68 184c17-9 30-9 42 0 12-9 25-9 42 0v6c-17-9-30-9-42 0-12-9-25-9-42 0z" fill={cover} />
      <path d="M110 148v36" stroke="#cbb894" strokeWidth="2" />
      <g stroke="#b9a988" strokeWidth="2" strokeLinecap="round" opacity="0.75">
        <path d="M78 158h18M78 166h18M124 158h18M124 166h18" />
      </g>
      {/* one page lifts and settles — the only motion inside the book itself */}
      <path className="ob-leaf" d="M110 148c12-9 25-9 42 0v36c-17-9-30-9-42 0z" fill="#ffffff" opacity="0.88" />
    </g>
  ) : (
    <g>
      <rect x="78" y="146" width="64" height="42" rx="5" fill={cover} />
      <rect x="84" y="150" width="52" height="34" rx="3" fill={tint} />
    </g>
  );
}

function BookStack({ tones = [BRAND.blue, BRAND.gold, BRAND.teal], x = -6, y = 6 }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {tones.map((tone, i) => (
        <g key={i}>
          <rect x={50 + i * 2} y={152 + i * 9} width={44 - i} height="9" rx="3" fill={tone} />
          <rect x={50 + i * 2} y={152 + i * 9} width={44 - i} height="3.5" rx="1.7" fill="#ffffff" opacity="0.22" />
        </g>
      ))}
    </g>
  );
}

function Laptop({ skin, id }) {
  return (
    <g>
      {/* screen tilted away from the viewer, keyboard plate in perspective */}
      <g transform="translate(74 128)">
        <rect x="0" y="0" width="72" height="46" rx="5" fill={BRAND.navy} />
        <rect x="3.5" y="3.5" width="65" height="39" rx="3" fill="#a9d4ff" />
        <rect x="9" y="9" width="40" height="4" rx="2" fill={BRAND.blue} />
        <rect x="9" y="17" width="54" height="3" rx="1.5" fill="#ffffff" opacity="0.75" />
        <rect x="9" y="23" width="46" height="3" rx="1.5" fill="#ffffff" opacity="0.6" />
        <rect x="9" y="29" width="30" height="3" rx="1.5" fill={BRAND.gold} opacity="0.8" />
        <path d="M0 0h72v8z" fill="#ffffff" opacity="0.1" />
      </g>
      <path d="M68 174h84l10 12H58z" fill="#dfe7f1" />
      <path d="M68 174h84l4 5H64z" fill={BRAND.navyLift} opacity="0.35" />
      <rect x="76" y="180" width="68" height="4" rx="2" fill="#c7d3e2" />
      <g>
        <path d="M76 150c-6 12-4 22 6 26" stroke={`url(#${id}-cloth)`} strokeWidth="14" strokeLinecap="round" fill="none" />
        <path d="M144 150c6 12 4 22-6 26" stroke={`url(#${id}-cloth)`} strokeWidth="14" strokeLinecap="round" fill="none" />
        <ellipse cx="86" cy="178" rx="8" ry="5.5" fill={skin.base} />
        <ellipse cx="134" cy="178" rx="8" ry="5.5" fill={skin.base} />
      </g>
    </g>
  );
}

function Phone({ skin, tone = BRAND.blue }) {
  /* drawn at the size the rest of the figure implies, not the size a phone is drawn at for its own
     sake: at full scale this prop was a fifth of the figure's height, so it read as a tablet */
  return (
    <g transform="translate(128 140) rotate(-10) scale(0.62)">
      <rect x="-16" y="-30" width="32" height="58" rx="7" fill={BRAND.navy} />
      <rect x="-13" y="-26" width="26" height="48" rx="4" fill="#b7dcff" />
      <rect x="-9" y="-22" width="18" height="5" rx="2.5" fill={tone} />
      <rect className="ob-fill" x="-9" y="-13" width="18" height="4" rx="2" fill={BRAND.gold} />
      <rect x="-9" y="-6" width="13" height="4" rx="2" fill="#ffffff" opacity="0.8" />
      <rect x="-9" y="1" width="17" height="4" rx="2" fill="#ffffff" opacity="0.6" />
      <circle cx="0" cy="22" r="3" fill="#ffffff" opacity="0.55" />
      <ellipse cx="-17" cy="26" rx="8" ry="6" fill={skin.base} transform="rotate(16 -17 26)" />
    </g>
  );
}

/* Floating cards share the figure's coordinate space, so a card parked at x 216 sits just outside
   the student's shoulder on a 5-inch phone and on a 10-inch tablet alike.

   Placement and motion live on separate groups on purpose: a CSS transform replaces an SVG
   transform attribute rather than adding to it, so a node that is animated can never be the node
   that carries its position. */
function CardShadow({ w, h }) {
  return <ellipse cx="0" cy={h / 2 + 5} rx={w / 2.4} ry="4" fill="#0b1626" opacity="0.12" />;
}

function Drift({ x, y, r = 0, className, delay, children }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className} style={{ animationDelay: `${delay}s` }}>
        <g transform={r ? `rotate(${r})` : undefined}>{children}</g>
      </g>
    </g>
  );
}

function DocChip({ x, y, r = 0, tone = BRAND.blue, delay = 0, label = "PDF" }) {
  return (
    <Drift x={x} y={y} r={r} className="ob-float" delay={delay}>
      <CardShadow w={34} h={44} />
      <rect x="-17" y="-22" width="34" height="44" rx="7" fill="#ffffff" stroke={BRAND.line} strokeWidth="1.4" />
      <path d="M6-22h11v11z" fill={tone} opacity="0.2" />
      <rect x="-12" y="-8" width="24" height="3" rx="1.5" fill={BRAND.text} />
      <rect x="-12" y="0" width="18" height="3" rx="1.5" fill={BRAND.text} opacity="0.75" />
      <rect x="-12" y="8" width="21" height="3" rx="1.5" fill={BRAND.text} opacity="0.55" />
      <rect x="-16" y="12" width="17" height="10" rx="3" fill={tone} />
      <text x="-7.5" y="19.4" textAnchor="middle" fontSize="6.6" fontWeight="700" fill="#ffffff" fontFamily="system-ui, sans-serif">
        {label}
      </text>
    </Drift>
  );
}

function CourseChip({ x, y, tone = BRAND.gold, delay = 0, lines = 2 }) {
  return (
    <Drift x={x} y={y} className="ob-float" delay={delay}>
      <CardShadow w={48} h={30} />
      <rect x="-24" y="-15" width="48" height="30" rx="9" fill="#ffffff" stroke={BRAND.line} strokeWidth="1.4" />
      <rect x="-24" y="-15" width="7" height="30" rx="3.5" fill={tone} />
      <rect x="-12" y="-8" width="26" height="4.5" rx="2.2" fill="#9fb0c6" />
      {Array.from({ length: lines }, (_, i) => (
        <rect key={i} x="-12" y={1 + i * 6} width={23 - i * 8} height="3.4" rx="1.7" fill={BRAND.text} opacity="0.7" />
      ))}
    </Drift>
  );
}

function NotifChip({ x, y, tone = BRAND.blue, delay = 0, dot }) {
  return (
    <Drift x={x} y={y} className="ob-slide" delay={delay}>
      <CardShadow w={56} h={22} />
      <rect x="-28" y="-11" width="56" height="22" rx="9" fill="#ffffff" stroke={BRAND.line} strokeWidth="1.4" />
      <circle cx="-18" cy="0" r="6.5" fill={tone} />
      <path d="M-20.5-1.5h5M-20.5 1.5h5" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="-7" y="-4" width="28" height="3.4" rx="1.7" fill="#b1c0d3" />
      <rect x="-7" y="2" width="18" height="3.4" rx="1.7" fill={BRAND.text} opacity="0.65" />
      {dot ? <circle cx="26" cy="-8" r="4.5" fill={BRAND.gold} stroke="#ffffff" strokeWidth="1.8" /> : null}
    </Drift>
  );
}

function FolderChip({ x, y, tone = BRAND.gold, delay = 0 }) {
  return (
    <Drift x={x} y={y} className="ob-float" delay={delay}>
      <CardShadow w={44} h={30} />
      <path d="M-20-13h14l4 5h22a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3h-40a3 3 0 0 1-3-3v-23a3 3 0 0 1 3-3z" fill={tone} />
      <path d="M-20-13h14l4 5h-18z" fill="#ffffff" opacity="0.3" />
      <rect x="-17" y="-2" width="34" height="13" rx="3" fill="#ffffff" opacity="0.6" />
    </Drift>
  );
}

function GradCap({ x, y, delay = 0 }) {
  return (
    <Drift x={x} y={y} className="ob-float" delay={delay}>
      <path d="M0-9 18 0 0 9-18 0z" fill={BRAND.navy} />
      <path d="M-9 4v6c0 3 18 3 18 0V4" fill={BRAND.navyLift} />
      <path d="M12 2 18 6v9" stroke={BRAND.gold} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="18" cy="16" r="2.6" fill={BRAND.gold} />
    </Drift>
  );
}

function ProgressPill({ x, y, tone = BRAND.blue, delay = 0 }) {
  return (
    <Drift x={x} y={y} className="ob-float" delay={delay}>
      <CardShadow w={54} h={13} />
      <rect x="-27" y="-6.5" width="54" height="13" rx="6.5" fill="#ffffff" stroke={BRAND.line} strokeWidth="1.2" />
      <rect className="ob-progress" x="-24" y="-4" width="48" height="8" rx="4" fill={tone} />
    </Drift>
  );
}

function DropArrow({ x, y, delay = 0 }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="ob-drop" style={{ animationDelay: `${delay}s` }}>
        <path d="M0-10v15M-6.5 0 0 6.5 6.5 0" stroke={BRAND.blue} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </g>
  );
}

/* ------------------------------------------------------------------ student */

export function Student({
  id,
  skin = SKIN.warm,
  hair = "curly",
  glasses,
  cloth = BRAND.blue,
  clothDark = BRAND.blueDark,
  collar,
  hood,
  bottom = BRAND.navy,
  shoes = "#e9eef5",
  backpack,
  pose = "stand",
  blush = true,
  lashes,
  x = 0,
  y = 0,
  scale = 1,
  children
}) {
  const female = hair === "curly" || hair === "bun";
  const showLashes = lashes ?? female;
  const holding = pose === "book";
  const waving = pose === "wave";
  const seated = pose === "laptop";
  const celebrating = pose === "cheer";
  const usingPhone = pose === "phone";
  const hasRaster = useContext(RasterCtx);

  /* A dropped-in render carries the figure, so the vector body stands down — but scene props
     passed in as children still belong to the animated overlay layer. */
  if (hasRaster) {
    return children ? <g transform={`translate(${x} ${y}) scale(${scale})`}>{children}</g> : null;
  }

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* outer group carries position, inner one carries the breathing so the two never fight */}
      <g className="ob-figure">
        <Defs id={id} skin={skin} cloth={cloth} clothDark={clothDark} hair={hair} />
        {backpack ? <Backpack id={id} cloth={cloth} side={-1} /> : null}
        <Ground />
        <Legs id={id} bottom={bottom} shoes={shoes} seated={seated} />
        {/* behind the torso so only the sliver between chin and collar survives, and the jaw shadow
            is what separates the head from it when the figure nods */}
        <ellipse cx="110" cy="110" rx="14" ry="5" fill={skin.dark} opacity="0.28" />
        <path d="M100 106h20l2 14h-24z" fill={skin.shade} />
        <Torso id={id} cloth={cloth} clothDark={clothDark} collar={collar} hood={hood} />
        {backpack ? <Straps id={id} /> : null}

        {waving ? (
          <g>
            <Sleeve id={id} d="M78 128c-10 12-12 26-10 40" />
            <Hand x={68} y={170} skin={skin} rotate={10} />
            <Sleeve id={id} d="M142 128c14-6 24-22 26-40" />
            {/* only the hand travels — a wrist-wide arc is enough to read as a wave, and it cannot
                slip off a pivot the way a whole arm would */}
            <Hand x={170} y={84} skin={skin} rotate={-16} wave="ob-wave" />
          </g>
        ) : null}

        {celebrating ? (
          <g>
            <Sleeve id={id} d="M78 128c-12-8-20-24-22-40" />
            <Hand x={54} y={86} skin={skin} rotate={14} wave="ob-cheer-l" />
            <Sleeve id={id} d="M142 128c12-8 20-24 22-40" />
            <Hand x={166} y={86} skin={skin} rotate={-14} wave="ob-cheer-r" />
          </g>
        ) : null}

        {holding ? (
          <g>
            <Sleeve id={id} d="M78 128c-8 14-6 26 6 32l16 4" />
            <Sleeve id={id} d="M142 128c8 14 6 26-6 32l-16 4" />
            <Book />
            <ellipse cx="80" cy="166" rx="9" ry="6" fill={skin.base} transform="rotate(18 80 166)" />
            <ellipse cx="140" cy="166" rx="9" ry="6" fill={skin.base} transform="rotate(-18 140 166)" />
          </g>
        ) : null}

        {usingPhone ? (
          <g>
            <Sleeve id={id} d="M78 128c-10 12-12 26-10 40" />
            <Hand x={68} y={170} skin={skin} rotate={10} />
            <Sleeve id={id} d="M142 130c6 12 2 22-10 26" />
            <Hand x={133} y={152} skin={skin} rotate={-14} />
            <Phone skin={skin} />
          </g>
        ) : null}

        {pose === "stand" ? (
          <g>
            <Sleeve id={id} d="M78 128c-10 12-12 26-10 40" />
            <Hand x={68} y={170} skin={skin} rotate={10} />
            <Sleeve id={id} d="M142 128c10 12 12 26 10 40" />
            <Hand x={152} y={170} skin={skin} rotate={-10} />
          </g>
        ) : null}

        {seated ? <Laptop skin={skin} id={id} /> : null}
        {/* held props sit in front of the arm they rest on, which is what makes a stack of books
            look carried instead of pasted on */}
        {children}

        {hair === "curly" ? <CurlyHair id={id} /> : null}
        {hair === "bun" ? <BunHair id={id} /> : null}
        {hair === "short" ? <ShortHair id={id} /> : null}
        <Face id={id} skin={skin} glasses={glasses} blush={blush} lashes={showLashes} />
      </g>
    </g>
  );
}

/* -------------------------------------------------------------- the cast */

/* One definition per student. Six screens reuse them, so the person on screen 1 is the same
   person on screen 5 instead of a stranger in the same colours. */
export const CAST = {
  selam: {
    skin: SKIN.warm,
    hair: "curly",
    glasses: true,
    cloth: BRAND.cream,
    clothDark: BRAND.creamDark,
    collar: BRAND.blue,
    bottom: BRAND.navy,
    backpack: true
  },
  biruk: {
    skin: SKIN.deep,
    hair: "short",
    cloth: BRAND.blue,
    clothDark: BRAND.blueDark,
    hood: true,
    bottom: BRAND.navy,
    backpack: true
  },
  hanna: {
    skin: SKIN.rich,
    hair: "bun",
    cloth: "#E3B23C",
    clothDark: "#B8862A",
    collar: BRAND.navy,
    bottom: BRAND.navy
  },
  daniel: {
    skin: SKIN.warm,
    hair: "short",
    cloth: BRAND.navy,
    clothDark: BRAND.navyDeep,
    collar: BRAND.gold,
    bottom: "#3C4A5C",
    backpack: true
  }
};

export { DocChip, CourseChip, NotifChip, FolderChip, GradCap, BookStack, ProgressPill, DropArrow };

/* A real 3D render for any screen is picked up the moment it is dropped into
   src/assets/images/onboarding/screen-<n>.png — no code change, and the vector cast stays as the
   animated prop layer and the offline fallback. */
const RENDERED = import.meta.glob("../assets/images/onboarding/screen-*.{png,webp,jpg}", {
  eager: true,
  import: "default"
});

/* Contact shadow per render, as [cx, cy, rx, ry] in viewBox units. The default suits a single
   standing figure; the finale carries three, so its pool has to be wider and sit further out. */
const GROUND = {
  4: [137, 241, 48, 8],
  6: [150, 240, 100, 11]
};

export function Scene({ screen, title, children }) {
  const match = Object.keys(RENDERED).find((key) => new RegExp(`/screen-${screen}\\.(png|webp|jpg)$`).test(key));
  const [gx, gy, grx, gry] = GROUND[screen] || [130, 243, 62, 9];
  return (
    <>
      <svg className="ob-art-svg" viewBox="0 0 300 300" role="img" aria-label={title}>
        <defs>
          <radialGradient id={`disc-${screen}`} cx="50%" cy="44%" r="54%">
            <stop offset="0%" stopColor="var(--ob-disc-a, #ffffff)" stopOpacity="0.98" />
            <stop offset="58%" stopColor="var(--ob-disc-b, #e8f1fb)" stopOpacity="0.92" />
            <stop offset="100%" stopColor="var(--ob-disc-c, #cfe0f5)" stopOpacity="0.22" />
          </radialGradient>
          <linearGradient id={`rim-${screen}`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor={BRAND.gold} stopOpacity="0.9" />
            <stop offset="100%" stopColor={BRAND.blue} stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <circle className="ob-halo" cx="150" cy="146" r="132" fill={`url(#disc-${screen})`} />
        <circle cx="150" cy="146" r="118" fill="none" stroke={`url(#rim-${screen})`} strokeWidth="1.6" opacity="0.55" />
        {/* behind the render, not in front of it — as a pool of shade on the disc it grounds her,
            painted over the image it just darkens her shoes. */}
        {match ? <ellipse cx={gx} cy={gy} rx={grx} ry={gry} fill="#0d1a2b" opacity="0.14" /> : null}
        {/* the render lives inside the SVG so paint order is real: disc behind her, prop chips in
            front. As a sibling <img> it sat under the whole SVG and the disc washed it out. */}
        {match ? (
          <image className="ob-art-img" href={RENDERED[match]} x="0" y="0" width="300" height="300" preserveAspectRatio="xMidYMid meet" />
        ) : null}
        <RasterCtx.Provider value={!!match}>
          <g transform="translate(52 30) scale(0.9)">{children}</g>
        </RasterCtx.Provider>
      </svg>
    </>
  );
}
