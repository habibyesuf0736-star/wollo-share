import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';

interface SimulationSandboxProps {
  type: 'electromagnetism' | 'vascular_bohr' | 'calculus_riemann' | 'galvanic_cell';
}

export const SimulationSandbox: React.FC<SimulationSandboxProps> = ({ type }) => {
  // 1. Electromagnetism & Wave Superposition state
  const [currentAmp, setCurrentAmp] = useState<number>(2.4);
  const [turnDensity, setTurnDensity] = useState<number>(2000);
  const [phaseDiffDeg, setPhaseDiffDeg] = useState<number>(0);

  // 2. Biology Vascular & Bohr Shift state
  const [bloodPh, setBloodPh] = useState<number>(7.4);
  const [transpirationRate, setTranspirationRate] = useState<number>(65);

  // 3. Calculus Riemann Sum & Tangent state
  const [riemannN, setRiemannN] = useState<number>(6);
  const [tangentX, setTangentX] = useState<number>(2.0);

  // 4. Chemistry Galvanic Cell Nernst state
  const [znMolarity, setZnMolarity] = useState<number>(1.0);
  const [cuMolarity, setCuMolarity] = useState<number>(1.0);

  if (type === 'electromagnetism') {
    const mu0 = 4 * Math.PI * 1e-7;
    const magneticFieldMt = mu0 * turnDensity * currentAmp * 1000; // in mT
    const phaseRad = (phaseDiffDeg * Math.PI) / 180;
    const resultantFactor = Math.abs(2 * Math.cos(phaseRad / 2));

    // Generate wave paths
    const points1: string[] = [];
    const points2: string[] = [];
    const pointsSum: string[] = [];
    for (let x = 0; x <= 360; x += 6) {
      const rad = (x * Math.PI) / 90;
      const y1 = 75 - 24 * Math.sin(rad);
      const y2 = 75 - 24 * Math.sin(rad + phaseRad);
      const ySum = 75 - 24 * (Math.sin(rad) + Math.sin(rad + phaseRad));
      points1.push(`${x + 20},${y1.toFixed(1)}`);
      points2.push(`${x + 20},${y2.toFixed(1)}`);
      pointsSum.push(`${x + 20},${ySum.toFixed(1)}`);
    }

    return (
      <div className="border border-slate-200 bg-white rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-5 border-b border-slate-200">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Interactive Physics Sandbox · Solenoid Flux & Wave Superposition
            </p>
            <h4 className="text-base font-semibold text-slate-900 mt-0.5">
              Solenoid Magnetic Field & Two-Source Wave Interference
            </h4>
          </div>
          <button
            type="button"
            onClick={() => {
              setCurrentAmp(2.4);
              setTurnDensity(2000);
              setPhaseDiffDeg(0);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Parameters</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left 7 cols: Interactive Stage */}
          <div className="lg:col-span-7 bg-slate-900 text-white rounded-lg p-4 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 pb-3 border-b border-slate-800">
              <span className="font-mono tabular-nums">
                B = μ₀·n·I = <strong className="text-sky-400">{magneticFieldMt.toFixed(2)} mT</strong>
              </span>
              <span>·</span>
              <span className="font-mono tabular-nums">
                Resultant Amplitude = <strong className="text-amber-400">{resultantFactor.toFixed(2)} A</strong>
              </span>
              <span>·</span>
              <span className="font-mono">
                {resultantFactor > 1.4
                  ? '● CONSTRUCTIVE'
                  : resultantFactor < 0.4
                  ? '▲ DESTRUCTIVE NODE'
                  : '◆ PARTIAL OVERLAP'}
              </span>
            </div>

            <div className="my-3">
              <svg viewBox="0 0 400 150" className="w-full h-40 overflow-visible">
                {/* Grid axes */}
                <line x1="20" y1="75" x2="380" y2="75" stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="20" y1="15" x2="20" y2="135" stroke="#475569" strokeWidth="1.5" />
                {/* Wave 1 */}
                <polyline
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="1.75"
                  strokeOpacity="0.7"
                  points={points1.join(' ')}
                />
                {/* Wave 2 */}
                <polyline
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="1.75"
                  strokeOpacity="0.7"
                  points={points2.join(' ')}
                />
                {/* Resultant Sum Wave */}
                <polyline
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2.75"
                  points={pointsSum.join(' ')}
                />
                <text x="28" y="24" fill="#94A3B8" fontSize="10" fontFamily="monospace">
                  Cyan: S₁(x) · Amber: S₂(x + Δφ) · Emerald: Resultant y_net
                </text>
              </svg>
            </div>

            <div className="text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <span>Solenoid Core Flux Density: {magneticFieldMt >= 6 ? '▲ HIGH FLUX' : '● NOMINAL FLUX'}</span>
              <span className="font-mono tabular-nums">Phase Shift Δφ = {phaseDiffDeg}°</span>
            </div>
          </div>

          {/* Right 5 cols: Control Deck */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <label htmlFor="slider-current">Solenoid Current (I)</label>
                  <span className="font-mono tabular-nums text-slate-900">{currentAmp.toFixed(1)} A</span>
                </div>
                <input
                  id="slider-current"
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.1"
                  value={currentAmp}
                  onChange={(e) => setCurrentAmp(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <label htmlFor="slider-turns">Coil Turn Density (n = N/L)</label>
                  <span className="font-mono tabular-nums text-slate-900">{turnDensity} turns/m</span>
                </div>
                <input
                  id="slider-turns"
                  type="range"
                  min="500"
                  max="4000"
                  step="100"
                  value={turnDensity}
                  onChange={(e) => setTurnDensity(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <label htmlFor="slider-phase">Wave Phase Difference (Δφ)</label>
                  <span className="font-mono tabular-nums text-slate-900">{phaseDiffDeg}°</span>
                </div>
                <input
                  id="slider-phase"
                  type="range"
                  min="0"
                  max="360"
                  step="15"
                  value={phaseDiffDeg}
                  onChange={(e) => setPhaseDiffDeg(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 text-xs text-slate-600 leading-relaxed">
              <strong className="text-slate-900">Concept Check:</strong> Set Δφ = 180° to observe complete destructive
              interference (0.00 A), or Δφ = 0° / 360° for maximum constructive reinforcement (2.00 A).
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'vascular_bohr') {
    // Calculate hemoglobin saturation curve based on blood pH (Bohr shift)
    // P50 is ~26.6 mmHg at pH 7.4, increases to ~36 mmHg at pH 7.2 (right shift)
    const p50 = 26.6 * Math.pow(10, -0.48 * (bloodPh - 7.4));
    const curvePoints: string[] = [];
    const baselinePoints: string[] = [];
    for (let po2 = 0; po2 <= 100; po2 += 5) {
      const x = 30 + po2 * 3.3;
      const sat = (Math.pow(po2, 2.7) / (Math.pow(p50, 2.7) + Math.pow(po2, 2.7))) * 100;
      const baseSat = (Math.pow(po2, 2.7) / (Math.pow(26.6, 2.7) + Math.pow(po2, 2.7))) * 100;
      const y = 135 - sat * 1.1;
      const yBase = 135 - baseSat * 1.1;
      curvePoints.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      baselinePoints.push(`${x.toFixed(1)},${yBase.toFixed(1)}`);
    }

    const tissuePo2 = 40;
    const satAt40 = (Math.pow(tissuePo2, 2.7) / (Math.pow(p50, 2.7) + Math.pow(tissuePo2, 2.7))) * 100;
    const xylemVelocity = (transpirationRate * 0.42).toFixed(1);

    return (
      <div className="border border-slate-200 bg-white rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-5 border-b border-slate-200">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Interactive Biology Sandbox · Physiological Bohr Effect & Xylem Tension
            </p>
            <h4 className="text-base font-semibold text-slate-900 mt-0.5">
              Hemoglobin O₂ Dissociation Curve & Vascular Transpiration Flow
            </h4>
          </div>
          <button
            type="button"
            onClick={() => {
              setBloodPh(7.4);
              setTranspirationRate(65);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Parameters</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 bg-slate-900 text-white rounded-lg p-4 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 pb-3 border-b border-slate-800">
              <span className="font-mono tabular-nums">
                HbO₂ at 40 mmHg: <strong className="text-emerald-400">{satAt40.toFixed(1)}%</strong>
              </span>
              <span>·</span>
              <span className="font-mono tabular-nums">
                Xylem Sap Ascent: <strong className="text-sky-400">{xylemVelocity} cm/hr</strong>
              </span>
              <span>·</span>
              <span className="font-mono">
                {bloodPh < 7.35 ? '▲ ACIDIC BOHR RIGHT-SHIFT' : '● RESTING NOMINAL pH'}
              </span>
            </div>

            <div className="my-3">
              <svg viewBox="0 0 390 155" className="w-full h-40 overflow-visible">
                <line x1="30" y1="135" x2="365" y2="135" stroke="#475569" strokeWidth="1.5" />
                <line x1="30" y1="20" x2="30" y2="135" stroke="#475569" strokeWidth="1.5" />
                {/* Baseline pH 7.4 dashed */}
                <polyline
                  fill="none"
                  stroke="#64748B"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  points={baselinePoints.join(' ')}
                />
                {/* Active pH curve */}
                <polyline
                  fill="none"
                  stroke={bloodPh < 7.35 ? '#F97316' : '#0EA5E9'}
                  strokeWidth="2.75"
                  points={curvePoints.join(' ')}
                />
                <text x="40" y="28" fill="#94A3B8" fontSize="10" fontFamily="monospace">
                  Dashed: pH 7.4 Baseline · Solid: Active Blood pH {bloodPh.toFixed(2)}
                </text>
                <text x="160" y="150" fill="#94A3B8" fontSize="10" fontFamily="monospace">
                  Partial Pressure pO₂ (0 → 100 mmHg)
                </text>
              </svg>
            </div>

            <div className="text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <span>Half-Saturation P₅₀ = {p50.toFixed(1)} mmHg</span>
              <span className="font-mono tabular-nums">Stomatal Transpiration Pull: {transpirationRate}%</span>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col justify-between space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <label htmlFor="slider-ph">Blood Plasma pH Level</label>
                  <span className="font-mono tabular-nums text-slate-900">pH {bloodPh.toFixed(2)}</span>
                </div>
                <input
                  id="slider-ph"
                  type="range"
                  min="7.15"
                  max="7.60"
                  step="0.05"
                  value={bloodPh}
                  onChange={(e) => setBloodPh(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <label htmlFor="slider-transpiration">Leaf Transpiration Rate</label>
                  <span className="font-mono tabular-nums text-slate-900">{transpirationRate}%</span>
                </div>
                <input
                  id="slider-transpiration"
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={transpirationRate}
                  onChange={(e) => setTranspirationRate(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 text-xs text-slate-600 leading-relaxed">
              <strong className="text-slate-900">Observation:</strong> Lowering pH to 7.20 simulates high CO₂ in
              exercising muscle, shifting the dissociation curve right and unloading more O₂ into cells.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'calculus_riemann') {
    // Function f(x) = x^2 + 1 on [0, 3], exact integral = 12.00
    const a = 0;
    const b = 3;
    const dx = (b - a) / riemannN;
    let riemannSum = 0;
    const rects: { x: number; w: number; y: number; h: number }[] = [];
    for (let i = 0; i < riemannN; i++) {
      const xMid = a + (i + 0.5) * dx;
      const fx = xMid * xMid + 1;
      riemannSum += fx * dx;
      const svgX = 35 + (i * dx / 3) * 310;
      const svgW = (dx / 3) * 310;
      const svgH = (fx / 10) * 110;
      rects.push({
        x: svgX,
        w: svgW,
        y: 135 - svgH,
        h: svgH,
      });
    }

    const slopeAtX = 2 * tangentX;

    return (
      <div className="border border-slate-200 bg-white rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-5 border-b border-slate-200">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Interactive Mathematics Sandbox · Riemann Partitions & Derivatives
            </p>
            <h4 className="text-base font-semibold text-slate-900 mt-0.5">
              Definite Integral Approximation ∫₀³ (x² + 1) dx & Instantaneous Slope
            </h4>
          </div>
          <button
            type="button"
            onClick={() => {
              setRiemannN(6);
              setTangentX(2.0);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Partitions</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 bg-slate-900 text-white rounded-lg p-4 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 pb-3 border-b border-slate-800">
              <span className="font-mono tabular-nums">
                Riemann Sum S_n = <strong className="text-amber-400">{riemannSum.toFixed(3)}</strong>
              </span>
              <span>·</span>
              <span className="font-mono tabular-nums">
                Exact ∫₀³ f(x)dx = <strong className="text-emerald-400">12.000</strong>
              </span>
              <span>·</span>
              <span className="font-mono tabular-nums">
                Tangent f′({tangentX.toFixed(1)}) = <strong className="text-sky-400">{slopeAtX.toFixed(2)}</strong>
              </span>
            </div>

            <div className="my-3">
              <svg viewBox="0 0 380 150" className="w-full h-40 overflow-visible">
                <line x1="35" y1="135" x2="355" y2="135" stroke="#475569" strokeWidth="1.5" />
                <line x1="35" y1="15" x2="35" y2="135" stroke="#475569" strokeWidth="1.5" />
                {rects.map((r, idx) => (
                  <rect
                    key={idx}
                    x={r.x}
                    y={r.y}
                    width={Math.max(1, r.w - 1)}
                    height={r.h}
                    fill="rgba(245, 158, 11, 0.28)"
                    stroke="#F59E0B"
                    strokeWidth="1"
                  />
                ))}
                {/* Smooth curve y = x^2 + 1 */}
                <path
                  d="M 35 124 Q 190 118 345 25"
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="2.5"
                />
                <text x="45" y="28" fill="#94A3B8" fontSize="10" fontFamily="monospace">
                  f(x) = x² + 1 on [0, 3] · n = {riemannN} partitions · Error ={' '}
                  {Math.abs(12 - riemannSum).toFixed(4)}
                </text>
              </svg>
            </div>

            <div className="text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <span>Partition Width Δx = {(3 / riemannN).toFixed(3)}</span>
              <span className="font-mono tabular-nums">
                Convergence: {Math.abs(12 - riemannSum) < 0.05 ? '● HIGH PRECISION' : '◆ APPROXIMATE'}
              </span>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col justify-between space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <label htmlFor="slider-riemann">Number of Sub-Intervals (n)</label>
                  <span className="font-mono tabular-nums text-slate-900">{riemannN} rectangles</span>
                </div>
                <input
                  id="slider-riemann"
                  type="range"
                  min="2"
                  max="24"
                  step="1"
                  value={riemannN}
                  onChange={(e) => setRiemannN(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <label htmlFor="slider-tangent">Tangent Point x₀ on Curve</label>
                  <span className="font-mono tabular-nums text-slate-900">x₀ = {tangentX.toFixed(1)}</span>
                </div>
                <input
                  id="slider-tangent"
                  type="range"
                  min="0.0"
                  max="3.0"
                  step="0.2"
                  value={tangentX}
                  onChange={(e) => setTangentX(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 text-xs text-slate-600 leading-relaxed">
              <strong className="text-slate-900">Limit Insight:</strong> Increase n from 2 to 24 rectangles to watch the
              Riemann sum converge rapidly toward the exact definite integral value of 12.000.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default: Chemistry Galvanic Cell Nernst simulator
  const eStd = 1.10;
  const qRatio = znMolarity / cuMolarity;
  const eCell = eStd - (0.0592 / 2) * Math.log10(qRatio);

  return (
    <div className="border border-slate-200 bg-white rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-5 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Interactive Electrochemistry Sandbox · Daniell Cell & Nernst Potential
          </p>
          <h4 className="text-base font-semibold text-slate-900 mt-0.5">
            Zn(s) | Zn²⁺(aq) || Cu²⁺(aq) | Cu(s) Non-Standard Cell EMF
          </h4>
        </div>
        <button
          type="button"
          onClick={() => {
            setZnMolarity(1.0);
            setCuMolarity(1.0);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Standard State (1.0 M)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-slate-900 text-white rounded-lg p-4 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 pb-3 border-b border-slate-800">
            <span className="font-mono tabular-nums">
              Voltmeter Reading E_cell = <strong className="text-emerald-400">+{eCell.toFixed(3)} V</strong>
            </span>
            <span>·</span>
            <span className="font-mono tabular-nums">
              Reaction Quotient Q = [Zn²⁺]/[Cu²⁺] = <strong className="text-amber-400">{qRatio.toFixed(2)}</strong>
            </span>
          </div>

          <div className="my-4 grid grid-cols-3 gap-3 items-center text-center">
            <div className="p-3 rounded-lg bg-slate-800/90 border border-slate-700">
              <p className="text-xs text-slate-400">Anode (Oxidation)</p>
              <p className="text-sm font-semibold text-white mt-1">Zn(s) → Zn²⁺ + 2e⁻</p>
              <p className="text-xs font-mono text-sky-400 mt-1">[Zn²⁺] = {znMolarity.toFixed(2)} M</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-700/60">
              <p className="text-xs text-emerald-300 font-mono">e⁻ Flow ⟶</p>
              <p className="text-xl font-mono font-bold text-emerald-400 tabular-nums mt-1">
                {eCell.toFixed(3)} V
              </p>
              <p className="text-[11px] text-slate-300 mt-1">KCl Salt Bridge Active</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/90 border border-slate-700">
              <p className="text-xs text-slate-400">Cathode (Reduction)</p>
              <p className="text-sm font-semibold text-white mt-1">Cu²⁺ + 2e⁻ → Cu(s)</p>
              <p className="text-xs font-mono text-amber-400 mt-1">[Cu²⁺] = {cuMolarity.toFixed(2)} M</p>
            </div>
          </div>

          <div className="text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
            <span className="font-mono">E = E° - (0.0592 / 2)·log₁₀([Zn²⁺] / [Cu²⁺])</span>
            <span>● SPONTANEOUS REDOX</span>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col justify-between space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                <label htmlFor="slider-zn">Anode [Zn²⁺] Concentration</label>
                <span className="font-mono tabular-nums text-slate-900">{znMolarity.toFixed(2)} mol/L</span>
              </div>
              <input
                id="slider-zn"
                type="range"
                min="0.05"
                max="2.00"
                step="0.05"
                value={znMolarity}
                onChange={(e) => setZnMolarity(parseFloat(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                <label htmlFor="slider-cu">Cathode [Cu²⁺] Concentration</label>
                <span className="font-mono tabular-nums text-slate-900">{cuMolarity.toFixed(2)} mol/L</span>
              </div>
              <input
                id="slider-cu"
                type="range"
                min="0.05"
                max="2.00"
                step="0.05"
                value={cuMolarity}
                onChange={(e) => setCuMolarity(parseFloat(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 text-xs text-slate-600 leading-relaxed">
            <strong className="text-slate-900">Le Chatelier & Nernst:</strong> Increasing reactant [Cu²⁺] or decreasing
            product [Zn²⁺] drives the forward reaction and raises cell voltage above +1.100 V.
          </div>
        </div>
      </div>
    </div>
  );
};
