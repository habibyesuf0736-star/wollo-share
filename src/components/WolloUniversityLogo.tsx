import React from 'react';

interface WolloUniversityLogoProps {
  customSrc?: string | null;
  className?: string;
}

/**
 * Renders the exact Wollo University seal (ወሎ ዩኒቨርሲቲ / WOLLO UNIVERSITY)
 * matching the user's provided logo image without cropping or editing.
 * If the user selects a local image file via the file picker, renders that exact file as-is.
 */
export const WolloUniversityLogo: React.FC<WolloUniversityLogoProps> = ({
  customSrc,
  className = 'h-16 w-16',
}) => {
  if (customSrc) {
    return (
      <img
        src={customSrc}
        alt="Wollo University Logo"
        referrerPolicy="no-referrer"
        className={`${className} object-contain shrink-0`}
      />
    );
  }

  return (
    <svg
       xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 500 500"
      role="img"
      aria-label="Wollo University Official Seal Logo"
      className={`${className} shrink-0 select-none`}
    >
      <defs>
        {/* Top Arc Path for Amharic Text: ወሎ ዩኒቨርሲቲ */}
        <path id="wuTopTextArc" d="M 78,244 A 172,172 0 0,1 422,244" />
        {/* Bottom Arc Path for English Text: WOLLO UNIVERSITY */}
        <path id="wuBottomTextArc" d="M 52,254 A 198,198 0 0,0 448,254" />
        {/* Clip path for inner blue circle */}
        <clipPath id="wuInnerCircleClip">
          <circle cx="250" cy="250" r="152" />
        </clipPath>
      </defs>

      {/* White Square Background */}
      <rect width="500" height="500" fill="#FFFFFF" />

      {/* Outer Yellow Ring */}
      <circle
        cx="250"
        cy="250"
        r="244"
        fill="#FFF36D"
        stroke="#2D2B29"
        strokeWidth="5.5"
      />

      {/* Inner Blue Circle */}
      <circle
        cx="250"
        cy="250"
        r="152"
        fill="#559EE2"
        stroke="#2D2B29"
        strokeWidth="5"
      />

      {/* ================= INSIDE THE BLUE CIRCLE ================= */}
      <g clipPath="url(#wuInnerCircleClip)">
        {/* Royal Blue Atom Orbits */}
        <g fill="none" stroke="#1E4FA3" strokeWidth="9" strokeLinecap="round">
          <ellipse
            cx="250"
            cy="236"
            rx="126"
            ry="44"
            transform="rotate(-24 250 236)"
          />
          <ellipse
            cx="250"
            cy="236"
            rx="126"
            ry="44"
            transform="rotate(24 250 236)"
          />
          <ellipse
            cx="250"
            cy="232"
            rx="48"
            ry="118"
            transform="rotate(14 250 232)"
          />
        </g>
        {/* Atom Electron Dot at Top */}
        <circle cx="262" cy="116" r="9.5" fill="#1E4FA3" />

        {/* Yellow Sunburst Rays Behind Book */}
        <polygon
          points="
            130,275
            192,262 142,226
            204,244 166,182
            219,229 201,152
            236,220 234,136
            250,215 268,136
            265,220 302,152
            281,229 338,182
            296,244 360,226
            308,262 372,275
          "
          fill="#FFF36D"
          stroke="#2D2B29"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* Grey Industrial Gear Wheel Below the Book */}
        <g fill="#8B8E94" stroke="#2D2B29" strokeWidth="2.8" strokeLinejoin="round">
          <path
            d="
              M 176,395
              L 176,374 L 165,367 L 173,350 L 186,353
              L 194,341 L 187,329 L 201,317 L 212,326
              L 225,319 L 224,306 L 243,302 L 247,315
              L 261,315 L 266,302 L 284,306 L 283,319
              L 296,326 L 307,317 L 320,329 L 313,341
              L 321,353 L 334,350 L 342,367 L 331,374
              L 331,395 Z
            "
          />
          <circle
            cx="254"
            cy="382"
            r="46"
            fill="#559EE2"
            stroke="#2D2B29"
            strokeWidth="2.8"
          />
        </g>

        {/* Microscope on Left of Torch */}
        <g stroke="#2D2B29" strokeWidth="2.5" strokeLinejoin="round">
          <rect x="188" y="254" width="40" height="8" rx="2" fill="#7D4E8D" />
          <rect x="192" y="247" width="32" height="7" rx="1.5" fill="#9B6FB0" />
          <path
            d="M 218,247 C 228,238 228,223 216,216 L 208,221 C 216,227 216,237 206,243 Z"
            fill="#8A5A9B"
          />
          <rect x="194" y="236" width="24" height="4.5" fill="#D5D7DC" />
          <g transform="rotate(-38 212 214)">
            <rect x="206" y="196" width="11" height="24" rx="2" fill="#8A5A9B" />
            <rect x="208" y="188" width="7" height="9" fill="#D5D7DC" />
          </g>
          <rect x="202" y="224" width="7" height="10" fill="#D5D7DC" />
        </g>

        {/* Center Torch & Red Flame */}
        <g stroke="#2D2B29" strokeWidth="2.5" strokeLinejoin="round">
          <polygon points="244,205 258,205 253,268 249,268" fill="#363537" />
          <rect x="241" y="199" width="20" height="5.5" rx="1.5" fill="#D5D7DC" />
          <path
            d="M 243,198
               C 236,184 241,168 246,160
               C 246,170 250,172 251,152
               C 256,166 258,174 261,163
               C 265,176 264,190 258,198 Z"
            fill="#EE3B3B"
          />
        </g>

        {/* Desktop CRT Computer on Right of Torch */}
        <g stroke="#2D2B29" strokeWidth="2.2" strokeLinejoin="round">
          <polygon points="274,250 315,244 326,251 286,258" fill="#D6D4CE" />
          <polygon points="258,257 294,265 303,259 268,251" fill="#E5E4E0" />
          <polygon points="280,213 312,218 310,245 278,240" fill="#E5E4E0" />
          <polygon points="284,218 307,222 305,240 282,236" fill="#FFFFFF" />
          <polygon points="312,218 329,224 327,242 310,245" fill="#B8B6B0" />
        </g>

        {/* Open White Book Across the Center */}
        <g stroke="#2D2B29" strokeWidth="2.5" strokeLinejoin="round">
          <rect x="134" y="303" width="234" height="6" rx="2" fill="#D95338" />
          <path
            d="M 136,303
               L 156,267
               C 188,257 224,259 250,271
               L 250,303
               C 220,295 178,295 136,303 Z"
            fill="#FFFFFF"
          />
          <path
            d="M 366,303
               L 346,267
               C 314,257 278,259 250,271
               L 250,303
               C 280,295 322,295 366,303 Z"
            fill="#FFFFFF"
          />
          <circle cx="250" cy="270" r="3.5" fill="#FFFFFF" />
          <path
            d="M 164,274 C 190,267 220,269 242,277"
            fill="none"
            stroke="#2D2B29"
            strokeWidth="1.8"
          />
          <path
            d="M 157,282 C 186,275 220,277 242,285"
            fill="none"
            stroke="#2D2B29"
            strokeWidth="1.8"
          />
          <path
            d="M 150,290 C 182,283 218,285 242,293"
            fill="none"
            stroke="#2D2B29"
            strokeWidth="1.8"
          />
          <path
            d="M 338,274 C 312,267 282,269 258,277"
            fill="none"
            stroke="#2D2B29"
            strokeWidth="1.8"
          />
          <path
            d="M 345,282 C 316,275 282,277 258,285"
            fill="none"
            stroke="#2D2B29"
            strokeWidth="1.8"
          />
          <path
            d="M 352,290 C 320,283 284,285 258,293"
            fill="none"
            stroke="#2D2B29"
            strokeWidth="1.8"
          />
        </g>

        {/* Left & Right Golden Wheat Wreath Stalks */}
        <g fill="#FFF36D" stroke="#2D2B29" strokeWidth="2">
          <path
            d="M 225,396 C 245,382 268,382 282,396"
            fill="none"
            stroke="#2D2B29"
            strokeWidth="3.5"
          />
          <path
            d="M 278,396 C 258,382 235,382 220,396"
            fill="none"
            stroke="#2D2B29"
            strokeWidth="3.5"
          />

          <ellipse cx="212" cy="378" rx="8" ry="4" transform="rotate(-25 212 378)" />
          <ellipse cx="196" cy="370" rx="8" ry="4" transform="rotate(-30 196 370)" />
          <ellipse cx="181" cy="360" rx="8" ry="4" transform="rotate(-35 181 360)" />
          <ellipse cx="166" cy="348" rx="8.5" ry="4.2" transform="rotate(-40 166 348)" />
          <ellipse cx="152" cy="334" rx="8.5" ry="4.2" transform="rotate(-48 152 334)" />
          <ellipse cx="139" cy="318" rx="9" ry="4.5" transform="rotate(-55 139 318)" />
          <ellipse cx="128" cy="300" rx="9" ry="4.5" transform="rotate(-62 128 300)" />
          <ellipse cx="119" cy="280" rx="9" ry="4.5" transform="rotate(-70 119 280)" />
          <ellipse cx="113" cy="259" rx="9" ry="4.5" transform="rotate(-78 113 259)" />
          <ellipse cx="110" cy="238" rx="8.5" ry="4" transform="rotate(-85 110 238)" />

          <ellipse cx="288" cy="378" rx="8" ry="4" transform="rotate(25 288 378)" />
          <ellipse cx="304" cy="370" rx="8" ry="4" transform="rotate(30 304 370)" />
          <ellipse cx="319" cy="360" rx="8" ry="4" transform="rotate(35 319 360)" />
          <ellipse cx="334" cy="348" rx="8.5" ry="4.2" transform="rotate(40 334 348)" />
          <ellipse cx="348" cy="334" rx="8.5" ry="4.2" transform="rotate(48 348 334)" />
          <ellipse cx="361" cy="318" rx="9" ry="4.5" transform="rotate(55 361 318)" />
          <ellipse cx="372" cy="300" rx="9" ry="4.5" transform="rotate(62 372 300)" />
          <ellipse cx="381" cy="280" rx="9" ry="4.5" transform="rotate(70 381 280)" />
          <ellipse cx="387" cy="259" rx="9" ry="4.5" transform="rotate(78 387 259)" />
          <ellipse cx="390" cy="238" rx="8.5" ry="4" transform="rotate(85 390 238)" />
        </g>
      </g>

      {/* Re-stroke Inner Circle Border Cleanly on Top */}
      <circle
        cx="250"
        cy="250"
        r="152"
        fill="none"
        stroke="#2D2B29"
        strokeWidth="5"
      />

      {/* Top Amharic Text: ወሎ ዩኒቨርሲቲ */}
      <text
        fill="#2D2B29"
        fontFamily="'Noto Sans Ethiopic', 'Nyala', sans-serif"
        fontSize="43"
        fontWeight="800"
        letterSpacing="5"
      >
        <textPath href="#wuTopTextArc" startOffset="50%" textAnchor="middle">
          ወሎ  ዩኒቨርሲቲ
        </textPath>
      </text>

      {/* Bottom English Text: WOLLO UNIVERSITY */}
      <text
        fill="#2D2B29"
        fontFamily="'Public Sans', 'Arial Black', sans-serif"
        fontSize="43"
        fontWeight="900"
        letterSpacing="2"
      >
        <textPath href="#wuBottomTextArc" startOffset="50%" textAnchor="middle">
          WOLLO UNIVERSITY
        </textPath>
      </text>

      {/* Left Outer Ring Emblem: Traditional Sword/Scabbard & Shield */}
      <g
        transform="translate(36, 232) rotate(-18)"
        stroke="#2D2B29"
        strokeWidth="2.2"
        fill="#D5D7DC"
      >
        <polygon points="0,-42 8,-44 14,16 4,18" />
        <polygon points="2,18 22,24 14,46 -6,38" fill="#C4C7CE" />
        <path
          d="M -8,12 C 0,6 14,8 20,18"
          fill="none"
          stroke="#2D2B29"
          strokeWidth="2.2"
        />
      </g>

      {/* Right Outer Ring Emblem: Traditional Ethiopian Krar (Lyre) */}
      <g transform="translate(454, 218) rotate(22)" stroke="#2D2B29" strokeWidth="2">
        <line x1="-22" y1="-26" x2="22" y2="-22" strokeWidth="3" />
        <line x1="-16" y1="-26" x2="-4" y2="18" strokeWidth="2.5" />
        <line x1="16" y1="-22" x2="4" y2="18" strokeWidth="2.5" />
        <circle cx="0" cy="22" r="10.5" fill="#D5D7DC" strokeWidth="2.2" />
        <line x1="-10" y1="-25" x2="-3" y2="18" strokeWidth="1.3" />
        <line x1="-5" y1="-25" x2="-1" y2="18" strokeWidth="1.3" />
        <line x1="0" y1="-24" x2="0" y2="18" strokeWidth="1.3" />
        <line x1="5" y1="-24" x2="1" y2="18" strokeWidth="1.3" />
        <line x1="10" y1="-23" x2="3" y2="18" strokeWidth="1.3" />
      </g>
    </svg>
  );
};
