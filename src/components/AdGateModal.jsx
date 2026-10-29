import React, { useEffect, useMemo, useState } from "react";
import { Lock, Sparkles, Timer, Zap } from "lucide-react";
import Modal from "./Modal.jsx";
import { useApp } from "../store/AppContext.jsx";

const SPOTS = [
  { brand: "Wollo Share Premium", headline: "Every note, exam and slide — no waiting.", price: "from 100 Birr" },
  { brand: "Wollo Share Premium", headline: "Your department's past exams, one click away.", price: "one-time 500 Birr" },
  { brand: "Wollo Share Premium", headline: "Study at 2am without counting downloads.", price: "100 Birr / month" }
];

function pad(value) {
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(value % 60).padStart(2, "0")}`;
}

export default function AdGateModal() {
  const { gate, closeGate, completeAdGate, setGate, downloadStatus, downloadPolicy } = useApp();
  const open = Boolean(gate && gate.type === "ad");
  const seconds = downloadPolicy.adSeconds;
  const [left, setLeft] = useState(seconds);

  const spot = useMemo(() => {
    const seed = String((gate && gate.title) || "").length;
    return SPOTS[Number(seed) % SPOTS.length];
  }, [gate]);

  const finishRef = React.useRef(completeAdGate);
  finishRef.current = completeAdGate;
  const materialKey = `${(gate && gate.courseId) || ""}::${(gate && gate.materialId) || ""}::${(gate && gate.sideMaterialId) || ""}`;

  useEffect(() => {
    if (!open) return undefined;
    setLeft(seconds);
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const remaining = Math.max(0, seconds - elapsed);
      setLeft(remaining);
      if (remaining === 0) {
        clearInterval(timer);
        finishRef.current();
      }
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, materialKey, seconds]);

  if (!open) return null;

  const watched = seconds - left;
  const percent = seconds > 0 ? Math.round((watched / seconds) * 100) : 100;

  return (
    <Modal
      open={open}
      onClose={closeGate}
      title="A quick word before your file"
      size="narrow"
    >
      <div className="ad-break card card-body p-0 overflow-hidden">
        <div className="d-flex justify-content-between align-items-center px-3 py-2">
          <span className="badge text-bg-dark rounded-pill px-2">Advertisement</span>
          <span className="small text-secondary mono">
            <Timer size={13} className="me-1 align-text-bottom" aria-hidden="true" />
            {left > 0 ? pad(left) : "ready"}
          </span>
        </div>

        <div className="px-3 pb-3 pt-2 text-center">
          <div className="ad-break-mark mx-auto mb-3">
            <Sparkles size={22} aria-hidden="true" />
          </div>
          <span className="ws-section-kicker">{spot.brand}</span>
          <h4 className="h5 mt-1 mb-2">{spot.headline}</h4>
          <span className="badge rounded-pill text-bg-light border">{spot.price}</span>
        </div>

        <div className="px-3 pb-3">
          <div
            className="progress"
            role="progressbar"
            aria-label="Sponsor spot progress"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{ height: 8 }}
          >
            <div className="progress-bar w-100" style={{ width: `${percent}%`, transition: "width .25s linear" }} />
          </div>
          <p className="small text-secondary text-center mt-2 mb-0">
            {left > 0 ? <>Your download starts in {left}s</> : <>Starting your download…</>}
          </p>
        </div>
      </div>

      <div className="alert alert-light border small mt-3 mb-0 d-flex align-items-start gap-2">
        <Lock size={15} className="mt-1 flex-shrink-0" aria-hidden="true" />
        <div>
          {downloadStatus.premium ? (
            <>Premium members never see this spot.</>
          ) : downloadPolicy.mode === "credits" && downloadStatus.plan === "unpaid" ? (
            <>
              Costs 1 credit · <strong>{Math.max(0, downloadStatus.credits - 1)}</strong> left after this.
            </>
          ) : (
            <>Free download · no credit used.</>
          )}
        </div>
      </div>

      <div className="d-flex flex-wrap justify-content-between gap-2 mt-3">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => {
            setGate({ ...gate, type: "upgrade" });
          }}
        >
          <Zap size={14} className="me-1 align-text-bottom" aria-hidden="true" />
          Skip the ads — see Premium
        </button>
        <button type="button" className="btn btn-sm btn-soft" onClick={closeGate}>
          Cancel download
        </button>
      </div>
    </Modal>
  );
}
