import React, { useCallback, useEffect, useRef, useState } from "react";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { useApp } from "../store/AppContext.jsx";
import { approveQrLogin, previewQrLogin } from "../lib/api.js";
import "./scan.css";

/* Recognition stays on the phone: the ML Kit barcode model is compiled into the APK, so camera
   frames and saved pictures are read locally and nothing leaves the device until a Wollo Share
   sign-in code is actually approved. */

const CODE_IN_PATH = /\/authorize\/([A-Za-z0-9_-]{8,64})/;
const BARE_CODE = /^[A-Za-z0-9_-]{8,64}$/;

/* The plugin handle is imported, never fetched. Its methods arrive through a proxy that answers
   any property with a native call, so handing it to `await` would make the promise machinery ask
   it for `then` and the platform would report that method as missing — the scan would never even
   reach the camera. */

export function codeFromScan(value) {
  const text = String(value || "").trim();
  const match = text.match(CODE_IN_PATH);
  if (match) return match[1];
  return BARE_CODE.test(text) ? text : "";
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("unreadable"));
    reader.readAsDataURL(file);
  });
}

export default function Scan({ t }) {
  const { session } = useApp();
  const isNative = typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() === true;

  const [stage, setStage] = useState(isNative ? "wait" : "idle");
  const [note, setNote] = useState("");
  const [card, setCard] = useState(null);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);

  const lens = useRef("BACK");
  const handles = useRef([]);
  const locked = useRef(false);
  const fileRef = useRef(null);
  const wantFile = useRef(false);

  const stop = useCallback(async () => {
    document.documentElement.classList.remove("sc-live");
    setTorch(false);
    try {
      await BarcodeScanner.stopScan();
    } catch {
      /* a camera that already let go needs no second telling */
    }
    const live = handles.current;
    handles.current = [];
    for (const handle of live) {
      try {
        await handle.remove();
      } catch {
        /* a listener that never attached cannot be removed */
      }
    }
  }, []);

  // Walking away from the screen has to free the camera, or the next screen inherits a live
  // preview nobody can see and a permission held for nothing.
  useEffect(() => {
    if (!isNative) return undefined;
    return () => {
      if (document.documentElement.classList.contains("sc-live")) stop();
    };
  }, [isNative, stop]);

  useEffect(() => {
    if (!isNative) return undefined;
    let live = true;
    BarcodeScanner.checkPermissions()
      .then((status) => {
        if (live) setStage(status.camera === "granted" ? "idle" : status.camera === "denied" ? "locked" : "ask");
      })
      .catch(() => {
        if (live) setStage("idle");
      });
    return () => {
      live = false;
    };
  }, [isNative]);

  // A picture asked for while the preview was running opens as soon as the panel is back.
  useEffect(() => {
    if (stage !== "idle" || !wantFile.current) return;
    wantFile.current = false;
    fileRef.current?.click();
  }, [stage]);

  const show = useCallback(
    async (value) => {
      locked.current = true;
      // The browser has no camera session to release, and asking for the native plugin there
      // would hold the whole approval on a module that only exists on the phone.
      if (isNative) await stop();
      setStage("idle");
      setNote("");
      setResult("");
      const code = codeFromScan(value);
      if (!code) {
        setCard({ code: "", value: String(value || ""), state: "other" });
        return;
      }
      if (!session?.authToken) {
        setCard({ code, value, state: "new" });
        setResult(t.scanSignIn);
        return;
      }
      setCard({ code, value, state: "wait" });
      setBusy(true);
      try {
        const res = await previewQrLogin(code, session.authToken);
        if (!res.ok) {
          setResult(res.offline ? t.scanOffline : res.error || t.fail);
          setCard({ code, value, state: "new", offline: !!res.offline });
        } else {
          setCard({
            code,
            value,
            label: res.label || "",
            state: res.expired ? "gone" : res.status === "consumed" ? "taken" : res.status === "approved" ? "sent" : "new"
          });
        }
      } catch {
        setResult(t.scanOffline);
        setCard({ code, value, state: "new", offline: true });
      }
      setBusy(false);
    },
    [isNative, session, stop, t.fail, t.scanOffline, t.scanSignIn]
  );

  const onSeen = useCallback(
    (barcodes) => {
      if (locked.current) return;
      const first = (barcodes || [])[0];
      const value = first?.rawValue || first?.displayValue || "";
      if (!value) return;
      navigator.vibrate?.(28);
      show(value);
    },
    [show]
  );

  const begin = useCallback(async () => {
    setNote("");
    setCard(null);
    setResult("");
    let status = null;
    try {
      status = await BarcodeScanner.checkPermissions();
    } catch {
      setNote(t.scanCam);
      return;
    }
    if (status.camera !== "granted") {
      try {
        status = await BarcodeScanner.requestPermissions();
      } catch {
        setNote(t.scanCam);
        return;
      }
      if (status.camera !== "granted") {
        setStage(status.camera === "denied" ? "locked" : "ask");
        setNote(t.scanDenied);
        return;
      }
    }
    try {
      handles.current = [
        await BarcodeScanner.addListener("barcodesScanned", (event) => onSeen(event.barcodes)),
        await BarcodeScanner.addListener("scanError", () => setNote(t.scanCam)),
      ];
      locked.current = false;
      await BarcodeScanner.startScan({ formats: ["QR_CODE"], lensFacing: lens.current });
    } catch {
      setNote(t.scanCam);
      return;
    }
    document.documentElement.classList.add("sc-live");
    setStage("live");
    const [flash, max] = await Promise.all([
      BarcodeScanner.isTorchAvailable().catch(() => ({ available: false })),
      BarcodeScanner.getMaxZoomRatio().catch(() => ({ zoomRatio: 1 })),
    ]);
    setHasTorch(flash.available === true);
    setZoomMax(Number(max?.zoomRatio) > 1 ? Number(max.zoomRatio) : 1);
    setZoom(1);
  }, [onSeen, t.scanCam, t.scanDenied]);

  const close = useCallback(async () => {
    await stop();
    setStage("idle");
  }, [stop]);

  const flip = useCallback(async () => {
    lens.current = lens.current === "FRONT" ? "BACK" : "FRONT";
    try {
      await BarcodeScanner.stopScan();
      await BarcodeScanner.startScan({ formats: ["QR_CODE"], lensFacing: lens.current });
    } catch {
      setNote(t.scanCam);
    }
  }, [t.scanCam]);

  const light = useCallback(async () => {
    try {
      await BarcodeScanner.toggleTorch();
      const state = await BarcodeScanner.isTorchEnabled();
      setTorch(state.enabled === true);
    } catch {
      setTorch(false);
    }
  }, []);

  const magnify = useCallback(
    async (step) => {
      const next = Math.min(zoomMax, Math.max(1, Math.round((zoom + step) * 10) / 10));
      if (next === zoom) return;
      setZoom(next);
      BarcodeScanner.setZoomRatio({ zoomRatio: next }).catch(() => null);
    },
    [zoom, zoomMax]
  );

  const fromPhoto = useCallback(
    async (file) => {
      if (!file) return;
      setBusy(true);
      setNote("");
      try {
        const data = await readAsBase64(file);
        const wrote = await Filesystem.writeFile({ path: `wollo-scan-${Date.now()}.img`, directory: Directory.Cache, data });
        const found = await BarcodeScanner.readBarcodesFromImage({ path: wrote.uri, formats: ["QR_CODE"] });
        Filesystem.deleteFile({ path: wrote.uri }).catch(() => null);
        const first = (found.barcodes || [])[0];
        const value = first?.rawValue || first?.displayValue || "";
        if (!value) {
          setNote(t.scanNoCode);
          return;
        }
        navigator.vibrate?.(28);
        await show(value);
      } catch {
        setNote(t.scanNoCode);
      }
      setBusy(false);
    },
    [show, t.scanNoCode]
  );

  const approve = useCallback(async () => {
    if (!card?.code || !session?.authToken) return;
    setBusy(true);
    setResult("");
    try {
      const res = await approveQrLogin(card.code, session.authToken);
      if (res.ok) {
        setCard({ ...card, label: res.label || card.label, state: "signed" });
      } else {
        setResult(res.offline ? t.scanOffline : res.error || t.fail);
      }
    } catch {
      setResult(t.scanOffline);
    }
    setBusy(false);
  }, [card, session, t.fail, t.scanOffline]);

  /* ------------------------------------------------------------------ live overlay */

  if (stage === "live") {
    return (
      <div className="sc">
        <div className="sc-top">
          <button type="button" className="sc-pill" onClick={close}>
            {t.scanStop}
          </button>
          <p className="sc-brand">{t.brand}</p>
          <span className="sc-pill sc-ghost">{t.scanTitle}</span>
        </div>

        <div className="sc-frame" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <p className="sc-hint">{t.scanHint}</p>

        <div className="sc-tools">
          {hasTorch ? (
            <button type="button" className={`sc-pill${torch ? " on" : ""}`} onClick={light} aria-pressed={torch}>
              {t.scanLight}
            </button>
          ) : null}
          {zoomMax > 1 ? (
            <span className="sc-zoom">
              <button type="button" className="sc-pill" onClick={() => magnify(-1)} aria-label={t.readerZoom}>
                −
              </button>
              <button type="button" className="sc-pill" onClick={() => magnify(1)} aria-label={t.readerZoom}>
                +
              </button>
            </span>
          ) : null}
          <button type="button" className="sc-pill" onClick={flip}>
            {t.scanFlip}
          </button>
          <button
            type="button"
            className="sc-pill"
            onClick={() => {
              wantFile.current = true;
              close();
            }}
          >
            {t.scanPhoto}
          </button>
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------------- the panel */

  return (
    <main className="a">
      <header className="a-head">
        <div>
          <p className="a-eyebrow">{t.brand}</p>
          <h1 className="a-title">{t.scanTitle}</h1>
        </div>
      </header>

      <p className="a-quiet">{t.scanBody}</p>

      {!card ? (
        stage === "ask" ? (
          <>
            <p className="a-quiet">{t.scanAsk}</p>
            <button className="a-btn primary" type="button" onClick={begin}>
              {t.scanAllow}
            </button>
          </>
        ) : stage === "locked" ? (
          <>
            <p className="a-err">{t.scanDenied}</p>
            <button
              className="a-btn primary"
              type="button"
              onClick={() => {
                BarcodeScanner.openSettings().catch(() => null);
              }}
            >
              {t.scanSettings}
            </button>
          </>
        ) : isNative ? (
          <button className="a-btn primary" type="button" onClick={begin}>
            {t.scanStart}
          </button>
        ) : (
          <p className="a-quiet">{t.scanNative}</p>
        )
      ) : null}

      {note ? <p className="a-err">{note}</p> : null}

      {card ? (
        <>
          <h2 className="a-label">{t.scanFound}</h2>
          <div className="a-panel">
            <div className="a-kv">
              <span>{t.scanDevice}</span>
              <b>{card.label || t.scanUnknown}</b>
            </div>
            {card.code ? null : (
              <div className="a-kv">
                <span>{t.scanCode}</span>
                <b className="sc-code">{card.value}</b>
              </div>
            )}
          </div>

          {busy || card.state === "wait" ? <p className="a-quiet">{t.readerLoading}</p> : null}

          {card.state === "new" ? (
            <button className="a-btn primary" type="button" onClick={approve}>
              {t.scanApprove}
            </button>
          ) : null}
          {card.state === "signed" ? <p className="a-quiet">{t.scanApproved}</p> : null}
          {card.state === "sent" ? <p className="a-quiet">{t.scanSent}</p> : null}
          {card.state === "taken" ? <p className="a-quiet">{t.scanTaken}</p> : null}
          {card.state === "gone" ? <p className="a-quiet">{t.scanExpired}</p> : null}
          {card.state === "other" ? <p className="a-quiet">{t.scanOther}</p> : null}

          {result ? <p className="a-err">{result}</p> : null}

          <button
            className="a-btn quiet"
            type="button"
            onClick={() => {
              setCard(null);
              setResult("");
              setNote("");
              if (isNative) begin();
            }}
          >
            {t.scanAgain}
          </button>
        </>
      ) : null}

      {isNative && !card ? (
        <>
          <h2 className="a-label">{t.scanPhoto}</h2>
          <p className="a-quiet">{t.scanImageNote}</p>
          <button
            className="a-btn quiet"
            type="button"
            onClick={() => {
              wantFile.current = true;
              fileRef.current?.click();
            }}
          >
            {t.scanPick}
          </button>
        </>
      ) : null}

      {!card ? (
        <form
          className="sc-paste"
          onSubmit={(event) => {
            event.preventDefault();
            const field = event.currentTarget.elements.namedItem("code");
            const text = String(field?.value || "").trim();
            if (field) field.value = "";
            if (text) show(text);
          }}
        >
          <label className="a-field">
            <span>{t.scanPaste}</span>
            <input name="code" type="text" placeholder={t.scanPasteBody} autoComplete="off" />
          </label>
          <button className="a-btn primary" type="submit">
            {t.scanUse}
          </button>
        </form>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sc-file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          fromPhoto(file);
        }}
      />
    </main>
  );
}
