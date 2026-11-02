import React, { useRef, useState } from "react";
import {
  BRAND,
  BookStack,
  CAST,
  CourseChip,
  DocChip,
  DropArrow,
  FolderChip,
  GradCap,
  NotifChip,
  ProgressPill,
  Scene,
  Student,
  useHasRaster
} from "./OnboardingArt.jsx";

/* Six welcome screens, one cast. Everything here is drawn and animated in the bundle, so the
   first launch a student ever sees arrives complete on a phone with no connection at all. */

function Welcome() {
  /* A render carries her silhouette, so the stack and folder slide clear of where her body is. */
  const raster = useHasRaster();
  return (
    <>
      <Student id="s1" title="Welcome" pose="wave" {...CAST.selam}>
        <BookStack x={raster ? -40 : -6} y={raster ? 44 : 6} />
      </Student>
      <GradCap x={232} y={72} delay={0.2} />
      <DocChip x={226} y={188} r={9} tone={BRAND.teal} delay={0.7} label="DOC" />
      <FolderChip x={raster ? 10 : 30} y={raster ? 64 : 96} tone={BRAND.gold} delay={0.45} />
      <g className="ob-orbit" aria-hidden="true">
        <circle cx="110" cy="6" r="3" fill={BRAND.gold} opacity="0.9" />
        <circle cx="212" cy="150" r="2.4" fill={BRAND.blue} opacity="0.55" />
        <circle cx="8" cy="150" r="2.4" fill={BRAND.blue} opacity="0.5" />
      </g>
    </>
  );
}

function Materials() {
  return (
    <>
      <Student id="s2" title="Materials" pose="book" {...CAST.biruk} />
      <DocChip x={16} y={58} r={-9} delay={0} />
      <DocChip x={212} y={52} r={8} tone={BRAND.teal} delay={0.5} label="DOC" />
      <DocChip x={222} y={186} r={-6} tone={BRAND.gold} delay={1} label="PPT" />
      <FolderChip x={24} y={198} tone={BRAND.blueDark} delay={0.75} />
      <DocChip x={226} y={118} r={5} tone={BRAND.blue} delay={1.4} label="EXAM" />
    </>
  );
}

function Courses() {
  return (
    <>
      <Student id="s3" title="Courses" pose="laptop" {...CAST.hanna} />
      <CourseChip x={24} y={44} tone={BRAND.blue} delay={0} />
      <CourseChip x={222} y={70} tone={BRAND.gold} delay={0.18} lines={1} />
      <CourseChip x={228} y={206} tone={BRAND.teal} delay={0.36} />
      <CourseChip x={22} y={212} tone={BRAND.blueDark} delay={0.54} lines={1} />
      <FolderChip x={230} y={140} tone={BRAND.gold} delay={0.8} />
    </>
  );
}

function Offline() {
  return (
    <>
      <Student id="s4" title="Offline" pose="phone" {...CAST.daniel} />
      <ProgressPill x={224} y={58} delay={0} />
      <DropArrow x={224} y={92} />
      <DocChip x={224} y={128} r={4} tone={BRAND.teal} delay={0.3} />
      <DocChip x={20} y={60} r={-8} tone={BRAND.blue} delay={0.2} />
      <DocChip x={18} y={200} r={6} tone={BRAND.gold} delay={0.6} label="PPT" />
      {/* the offline badge has to stay out of his sleeve: a chip crossing the figure reads as depth,
          but a status icon crossing it reads as a mistake sitting on top of an arm */}
      <g className="ob-offline" transform="translate(6 150)">
        <path d="M-22 0a22 22 0 0 1 44 0" stroke={BRAND.blue} strokeWidth="4.4" fill="none" strokeLinecap="round" opacity="0.75" />
        <path d="M-13 8a13 13 0 0 1 26 0" stroke={BRAND.blue} strokeWidth="4.4" fill="none" strokeLinecap="round" opacity="0.9" />
        <circle cx="0" cy="15" r="3" fill={BRAND.blue} />
        <path className="ob-slash" d="M-24 16 24 -8" stroke={BRAND.navy} strokeWidth="5" strokeLinecap="round" />
      </g>
    </>
  );
}

function News() {
  return (
    <>
      <Student id="s5" title="News" pose="phone" {...CAST.selam} />
      <NotifChip x={210} y={44} tone={BRAND.blue} delay={0} dot />
      <NotifChip x={216} y={84} tone={BRAND.gold} delay={0.3} />
      <NotifChip x={206} y={196} tone={BRAND.teal} delay={0.6} dot />
      <DocChip x={18} y={92} r={-10} tone={BRAND.blueDark} delay={0.45} label="!" />
      <GradCap x={30} y={196} delay={0.9} />
    </>
  );
}

/* The shower is laid out on the upper arc of the scene disc rather than on a flat row,
   so the pieces at the edges start low enough to stay inside the rim as they fall. */
const CONFETTI = Array.from({ length: 12 }, (_, i) => {
  const angle = ((-152 + i * (124 / 11)) * Math.PI) / 180;
  const radius = 96 + (i % 3) * 12;
  return [
    Math.round(109 + radius * Math.cos(angle)),
    Math.round(129 + radius * Math.sin(angle)),
    [BRAND.gold, BRAND.blue, "#CFE0F5", BRAND.teal][i % 4]
  ];
});

function Join() {
  return (
    <>
      <g className="ob-confetti" aria-hidden="true">
        {CONFETTI.map(([cx, cy, fill], i) => (
          /* Timing goes on the rect itself: each piece is the only child of its rotated
             wrapper, so an nth-child stagger rule would never match and the whole shower
             would fall in one lockstep block. */
          <g key={i} transform={`rotate(${(i * 34) % 90 - 45} ${cx} ${cy})`}>
            <rect
              x={cx}
              y={cy}
              width={i % 3 === 0 ? 7 : 5.5}
              height={i % 3 === 0 ? 12 : 9}
              rx="2.5"
              fill={fill}
              opacity="0.9"
              style={{ animationDelay: `${(i % 6) * 0.34}s`, animationDuration: `${2.2 + (i % 4) * 0.3}s` }}
            />
          </g>
        ))}
      </g>
      <Student id="s6a" title="Join" pose="wave" {...CAST.selam} x={-66} y={70} scale={0.56} />
      <Student id="s6b" title="Join" pose="cheer" {...CAST.biruk} x={4} y={24} scale={0.72} />
      <Student id="s6c" title="Join" pose="book" {...CAST.hanna} x={72} y={76} scale={0.54} />
    </>
  );
}

const SCENES = [
  { Art: Welcome, tone: "navy" },
  { Art: Materials, tone: "light" },
  { Art: Courses, tone: "navy" },
  { Art: Offline, tone: "light" },
  { Art: News, tone: "navy" },
  { Art: Join, tone: "gold" }
];

const LAST = SCENES.length - 1;

export default function Onboarding({ t, lang, onLang, onFinish }) {
  const [step, setStep] = useState(0);
  const touch = useRef(null);

  const onward = () => {
    if (step < LAST) setStep(step + 1);
    else onFinish("signup");
  };

  return (
    <div
      className={`ob ob--${SCENES[step].tone}`}
      onTouchStart={(event) => {
        touch.current = event.touches[0].clientX;
      }}
      onTouchEnd={(event) => {
        const from = touch.current;
        if (from === null) return;
        touch.current = null;
        const dx = event.changedTouches[0].clientX - from;
        if (dx < -44) onward();
        else if (dx > 44) setStep((value) => Math.max(0, value - 1));
      }}
    >
      <div className="ob-bg" aria-hidden="true">
        <span className="ob-sky ob-sky--deep" />
        <span className="ob-sky ob-sky--light" />
        <span className="ob-sky ob-sky--warm" />
        <span className="ob-blob ob-blob--a" />
        <span className="ob-blob ob-blob--b" />
        <span className="ob-grain" />
      </div>

      <div className="ob-top">
        <span className="ob-mark">
          <span className="ob-mark-dot" aria-hidden="true" />
          {t.brand}
        </span>
        <div className="ob-actions">
          <button type="button" className="ob-lang" onClick={() => onLang(lang === "en" ? "am" : "en")}>
            {lang === "en" ? "አማ" : "EN"}
          </button>
          <button type="button" className="ob-skip" onClick={() => onFinish()}>
            {t.skip}
          </button>
        </div>
      </div>

      <div className="ob-view">
        <div className="ob-track" style={{ transform: `translateX(-${step * 100}%)` }}>
          {SCENES.map(({ Art }, index) => (
            <section className="ob-page" key={index} aria-hidden={index !== step}>
              <span className="ob-step">
                {index + 1}
                <i>/{SCENES.length}</i>
              </span>
              <div className="ob-art">
                <span className="ob-art-glow" aria-hidden="true" />
                <Scene screen={index + 1} title={t[`ob${index + 1}Title`]}>
                  <Art />
                </Scene>
              </div>
              <div className="ob-copy">
                <h1 className="ob-title">{t[`ob${index + 1}Title`]}</h1>
                <p className="ob-body">{t[`ob${index + 1}Body`]}</p>
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="ob-foot">
        <div className="ob-dots" role="tablist" aria-label={t.brand}>
          {SCENES.map(({ Art }, index) => (
            <button
              key={index}
              type="button"
              className={index === step ? "on" : ""}
              aria-label={`${index + 1}`}
              aria-current={index === step ? "true" : undefined}
              onClick={() => setStep(index)}
            />
          ))}
        </div>

        {step === LAST ? (
          <div className="ob-final">
            <button type="button" className="a-btn primary ob-cta" onClick={() => onFinish("signup")}>
              {t.createAccount}
            </button>
            <button type="button" className="ob-quiet" onClick={() => onFinish("signin")}>
              {t.signIn}
            </button>
          </div>
        ) : (
          <div className="ob-nav">
            <button type="button" className={`a-btn quiet ob-back${step === 0 ? " ob-hide" : ""}`} onClick={() => setStep((value) => Math.max(0, value - 1))}>
              {t.back}
            </button>
            <button type="button" className="a-btn primary" onClick={onward}>
              {step === 0 ? t.getStarted : t.next}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M9.5 5.5 16 12l-6.5 6.5" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
