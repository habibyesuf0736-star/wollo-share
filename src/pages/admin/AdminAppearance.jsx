import React, { useEffect, useState } from "react";
import { DEFAULT_TEXTS, useApp } from "../../store/AppContext.jsx";
import { safeAdLink, AdCard, AD_STYLES } from "../../components/AdSlot.jsx";
import { uniqueId } from "../../lib/utils.js";

const BLANK_AD = {
  id: "",
  title: "",
  text: "",
  linkUrl: "",
  imageUrl: "",
  placement: "hero",
  active: true,
  style: "banner",
  color: "",
  inkColor: "",
  imageFit: "cover",
  badge: "",
  ctaLabel: ""
};

function readImage(file, maxBytes, onError, onDone) {
  if (!file) return;
  if (file.size > maxBytes) {
    onError(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB) — keep it under ${maxBytes / 1024 / 1024} MB.`);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onDone(String(reader.result));
  reader.onerror = () => onError("That image could not be read.");
  reader.readAsDataURL(file);
}

export default function AdminAppearance() {
  const { pageTexts, appearanceSettings, commitPageTexts, commitAppearance, banner, saveBanner, clearBanner, ads, saveAd, toggleAd, deleteAd, toast } =
    useApp();

  const [brand, setBrand] = useState({
    siteTitle: "",
    siteSubtitle: "",
    footerText: "",
    welcomeTitle: "",
    welcomeDesc: "",
    loginTitle: "",
    loginLines: "",
    premiumPayment: "",
    primaryColor: "#1d624f",
    fontSize: "16px",
    fontStyle: "sans",
    modules: { stats: true, topics: true, docs: true }
  });
  const [bannerForm, setBannerForm] = useState({ enabled: false, text: "", theme: "info" });
  const [adForm, setAdForm] = useState(BLANK_AD);
  const [error, setError] = useState("");

  useEffect(() => {
    setBrand({
      siteTitle: pageTexts.siteTitle || "",
      siteSubtitle: pageTexts.siteSubtitle || "",
      footerText: pageTexts.footerText || "",
      welcomeTitle: pageTexts.welcomeTitle || "",
      welcomeDesc: pageTexts.welcomeDesc || "",
      loginTitle: pageTexts.loginTitle ?? DEFAULT_TEXTS.loginTitle,
      loginLines: pageTexts.loginLines ?? DEFAULT_TEXTS.loginLines,
      premiumPayment: pageTexts.premiumPayment || "",
      primaryColor: appearanceSettings.primaryColor || "#1d624f",
      fontSize: appearanceSettings.fontSize || "16px",
      fontStyle: appearanceSettings.fontStyle || "sans",
      modules: { stats: true, topics: true, docs: true, ...(appearanceSettings.modules || {}) }
    });
    setBannerForm({ enabled: Boolean(banner.enabled), text: banner.text || "", theme: banner.theme || "info" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveBranding = (event) => {
    event.preventDefault();
    commitPageTexts({
      siteTitle: brand.siteTitle,
      siteSubtitle: brand.siteSubtitle,
      footerText: brand.footerText,
      welcomeTitle: brand.welcomeTitle,
      welcomeDesc: brand.welcomeDesc,
      loginTitle: brand.loginTitle,
      loginLines: brand.loginLines,
      premiumPayment: brand.premiumPayment
    });
    commitAppearance({
      primaryColor: brand.primaryColor,
      fontSize: brand.fontSize,
      fontStyle: brand.fontStyle,
      modules: brand.modules
    });
    toast("Branding saved — every visitor sees the new look.");
  };

  const uploadLogo = (event) => {
    const file = event.target.files && event.target.files[0];
    readImage(file, 1.5 * 1024 * 1024, setError, (dataUrl) => {
      commitAppearance({ logoUrl: dataUrl });
      toast("Site logo updated.");
    });
  };

  const submitAd = (event) => {
    event.preventDefault();
    if (!adForm.title.trim() && !adForm.text.trim()) {
      setError("Give the ad a title or a message.");
      return;
    }
    setError("");
    saveAd({
      id: adForm.id || uniqueId("ad"),
      title: adForm.title.trim(),
      text: adForm.text.trim(),
      linkUrl: safeAdLink(adForm.linkUrl),
      imageUrl: adForm.imageUrl,
      placement: adForm.placement,
      active: adForm.active,
      style: adForm.style,
      color: adForm.color,
      inkColor: adForm.inkColor,
      imageFit: adForm.imageFit,
      badge: adForm.badge.trim(),
      ctaLabel: adForm.ctaLabel.trim()
    });
    toast(adForm.id ? "Ad updated and live." : "Ad published to the page.");
    setAdForm(BLANK_AD);
  };

  const editAd = (ad) =>
    setAdForm({
      ...BLANK_AD,
      ...ad,
      title: ad.title || "",
      text: ad.text || "",
      linkUrl: ad.linkUrl || "",
      imageUrl: ad.imageUrl || "",
      placement: ad.placement || "hero",
      style: ad.style || "banner",
      badge: ad.badge || "",
      ctaLabel: ad.ctaLabel || ""
    });

  return (
    <div className="row g-3">
      <div className="col-12 col-lg-6">
        <form className="card p-3 d-flex flex-column gap-3" onSubmit={saveBranding}>
          <div>
            <h3 className="h6 mb-1">Branding & page text</h3>
            <p className="small text-secondary mb-0">Copy and colours apply to the whole site instantly.</p>
          </div>
          <div className="row g-2">
            <div className="col-12 col-sm-6">
              <label className="form-label small fw-semibold">Site title</label>
              <input className="form-control" value={brand.siteTitle} onChange={(e) => setBrand({ ...brand, siteTitle: e.target.value })} />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label small fw-semibold">Tagline under the title</label>
              <input className="form-control" value={brand.siteSubtitle} onChange={(e) => setBrand({ ...brand, siteSubtitle: e.target.value })} />
            </div>
            <div className="col-12">
              <label className="form-label small fw-semibold">Hero headline</label>
              <input className="form-control" value={brand.welcomeTitle} onChange={(e) => setBrand({ ...brand, welcomeTitle: e.target.value })} />
            </div>
            <div className="col-12">
              <label className="form-label small fw-semibold">Hero description</label>
              <textarea className="form-control" rows={2} value={brand.welcomeDesc} onChange={(e) => setBrand({ ...brand, welcomeDesc: e.target.value })} />
            </div>
            <div className="col-12">
              <label className="form-label small fw-semibold">Sign-in panel headline</label>
              <input
                className="form-control"
                placeholder="One account for the whole library"
                value={brand.loginTitle}
                onChange={(e) => setBrand({ ...brand, loginTitle: e.target.value })}
              />
            </div>
            <div className="col-12">
              <label className="form-label small fw-semibold">Sign-in panel lines</label>
              <textarea
                className="form-control"
                rows={3}
                placeholder={"Notes, exams and slides.\nFree for verified students."}
                value={brand.loginLines}
                onChange={(e) => setBrand({ ...brand, loginLines: e.target.value })}
              />
              <p className="form-text">One line each, shown under the headline. Clear both to drop the dark panel and widen the form.</p>
            </div>
            <div className="col-12">
              <label className="form-label small fw-semibold">Footer text</label>
              <input className="form-control" value={brand.footerText} onChange={(e) => setBrand({ ...brand, footerText: e.target.value })} />
            </div>
            <div className="col-12">
              <label className="form-label small fw-semibold">Premium payment note</label>
              <textarea
                className="form-control"
                rows={2}
                placeholder="Telebirr 1000 1234 5678 · Wollo Share"
                value={brand.premiumPayment}
                onChange={(e) => setBrand({ ...brand, premiumPayment: e.target.value })}
              />
              <p className="form-text">Shows on the Premium page. Leave empty and it says payment comes from the team.</p>
            </div>
            <div className="col-4">
              <label className="form-label small fw-semibold">Accent colour</label>
              <input type="color" className="form-control form-control-color w-100" value={brand.primaryColor} onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })} />
            </div>
            <div className="col-4">
              <label className="form-label small fw-semibold">Base size</label>
              <select className="form-select" value={brand.fontSize} onChange={(e) => setBrand({ ...brand, fontSize: e.target.value })}>
                {["15px", "16px", "17px", "18px"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="col-4">
              <label className="form-label small fw-semibold">Type style</label>
              <select className="form-select" value={brand.fontStyle} onChange={(e) => setBrand({ ...brand, fontStyle: e.target.value })}>
                <option value="sans">Sans (DM Sans)</option>
                <option value="serif">Serif</option>
                <option value="mono">Mono</option>
              </select>
            </div>
          </div>

          <div>
            <label className="form-label small fw-semibold">Site logo (PNG/SVG under 1.5 MB)</label>
            <div className="d-flex align-items-center gap-3">
              {appearanceSettings.logoUrl ? (
                <img src={appearanceSettings.logoUrl} alt="Current logo" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 12 }} />
              ) : (
                <span className="tag">Default mark</span>
              )}
              <input type="file" accept="image/*" className="form-control form-control-sm" onChange={uploadLogo} />
              {appearanceSettings.logoUrl ? (
                <button
                  type="button"
                  className="btn btn-sm btn-coral"
                  onClick={() => {
                    commitAppearance({ logoUrl: "" });
                    toast("Logo reset to the default mark.");
                  }}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>

          <div>
            <label className="form-label small fw-semibold mb-2">Page sections</label>
            <div className="d-flex flex-wrap gap-3">
              {[
                ["topics", "Topic filter chips"],
                ["docs", "Shared document search"]
              ].map(([key, label]) => (
                <div className="form-check form-switch" key={key}>
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id={`module-${key}`}
                    checked={brand.modules[key]}
                    onChange={(e) => setBrand({ ...brand, modules: { ...brand.modules, [key]: e.target.checked } })}
                  />
                  <label className="form-check-label small" htmlFor={`module-${key}`}>
                    {label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="d-flex justify-content-end">
            <button type="submit" className="btn btn-primary btn-sm">
              Save branding
            </button>
          </div>
        </form>
      </div>

      <div className="col-12 col-lg-6 d-flex flex-column gap-3">
        <div className="card p-3 d-flex flex-column gap-3">
          <div>
            <h3 className="h6 mb-1">Announcement banner</h3>
            <p className="small text-secondary mb-0">One-line notice shown above the library until students dismiss it.</p>
          </div>
          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              id="bannerEnabled"
              checked={bannerForm.enabled}
              onChange={(e) => setBannerForm({ ...bannerForm, enabled: e.target.checked })}
            />
            <label className="form-check-label small" htmlFor="bannerEnabled">
              Show banner
            </label>
          </div>
          <textarea
            className="form-control"
            rows={2}
            placeholder="e.g. 2nd semester past exams for Year III are now published."
            value={bannerForm.text}
            onChange={(e) => setBannerForm({ ...bannerForm, text: e.target.value })}
          />
          <div className="d-flex flex-wrap gap-2 align-items-center">
            {["info", "warn", "lime"].map((theme) => (
              <button
                key={theme}
                type="button"
                className={`btn btn-sm ${bannerForm.theme === theme ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setBannerForm({ ...bannerForm, theme })}
              >
                {theme === "info" ? "Green" : theme === "warn" ? "Coral" : "Lime"}
              </button>
            ))}
            <span className="flex-grow-1" />
            <button
              type="button"
              className="btn btn-sm btn-soft"
              onClick={() => {
                saveBanner({ ...bannerForm, id: banner.id || uniqueId("banner") });
                toast(bannerForm.enabled && bannerForm.text ? "Banner published." : "Banner saved.");
              }}
            >
              Save banner
            </button>
            <button
              type="button"
              className="btn btn-sm btn-coral"
              onClick={() => {
                clearBanner();
                setBannerForm({ enabled: false, text: "", theme: "info" });
                toast("Banner cleared for everyone.");
              }}
            >
              Clear
            </button>
          </div>
        </div>

        <form className="card p-3 d-flex flex-column gap-3" onSubmit={submitAd}>
          <div>
            <h3 className="h6 mb-1">Advertisement slot</h3>
            <p className="small text-secondary mb-0">Publish an image or text promo in the hero, middle or footer slot.</p>
          </div>
          {error ? <div className="alert alert-danger py-2 small mb-0">{error}</div> : null}

          <div>
            <label className="form-label small fw-semibold">Layout style</label>
            <div className="d-flex flex-wrap gap-2">
              {AD_STYLES.map((s) => (
                <div key={s.key}>
                  <input
                    className="btn-check"
                    type="radio"
                    name="adStyle"
                    id={`ad-style-${s.key}`}
                    value={s.key}
                    autoComplete="off"
                    checked={adForm.style === s.key}
                    onChange={() => setAdForm({ ...adForm, style: s.key })}
                  />
                  <label className="btn btn-sm btn-outline-primary" htmlFor={`ad-style-${s.key}`} title={s.hint}>
                    {s.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <input className="form-control" placeholder="Ad title" value={adForm.title} onChange={(e) => setAdForm({ ...adForm, title: e.target.value })} />
          <textarea className="form-control" rows={2} placeholder="Message" value={adForm.text} onChange={(e) => setAdForm({ ...adForm, text: e.target.value })} />

          <div className="row g-2">
            <div className="col-12 col-md-6">
              <label className="form-label small fw-semibold">Badge / kicker</label>
              <input className="form-control" placeholder="Advertisement" value={adForm.badge} onChange={(e) => setAdForm({ ...adForm, badge: e.target.value })} />
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label small fw-semibold">Button label</label>
              <input className="form-control" placeholder="Learn more" value={adForm.ctaLabel} onChange={(e) => setAdForm({ ...adForm, ctaLabel: e.target.value })} />
            </div>
          </div>

          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-7">
              <label className="form-label small fw-semibold">Link (https://)</label>
              <input className="form-control" placeholder="https://…" value={adForm.linkUrl} onChange={(e) => setAdForm({ ...adForm, linkUrl: e.target.value })} />
            </div>
            <div className="col-12 col-md-5">
              <label className="form-label small fw-semibold">Placement</label>
              <select className="form-select" value={adForm.placement} onChange={(e) => setAdForm({ ...adForm, placement: e.target.value })}>
                <option value="hero">Hero (top)</option>
                <option value="middle">Middle of library</option>
                <option value="footer">Footer</option>
              </select>
            </div>
          </div>

          <div className="row g-2 align-items-end">
            <div className="col-6 col-md-4">
              <label className="form-label small fw-semibold mb-1">Colour</label>
              <div className="d-flex align-items-center gap-2">
                <input
                  type="color"
                  className="form-control form-control-color"
                  value={adForm.color || "#1d624f"}
                  onChange={(e) => setAdForm({ ...adForm, color: e.target.value })}
                />
                <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setAdForm({ ...adForm, color: "" })}>
                  Auto
                </button>
              </div>
            </div>
            <div className="col-6 col-md-4">
              <label className="form-label small fw-semibold mb-1">Text colour</label>
              <div className="d-flex align-items-center gap-2">
                <input
                  type="color"
                  className="form-control form-control-color"
                  value={adForm.inkColor || "#ffffff"}
                  onChange={(e) => setAdForm({ ...adForm, inkColor: e.target.value })}
                />
                <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setAdForm({ ...adForm, inkColor: "" })}>
                  Auto
                </button>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label small fw-semibold">Image crop</label>
              <select className="form-select" value={adForm.imageFit} onChange={(e) => setAdForm({ ...adForm, imageFit: e.target.value })}>
                <option value="cover">Fill (crop)</option>
                <option value="contain">Fit (show all)</option>
              </select>
            </div>
          </div>

          <div className="d-flex align-items-center gap-3">
            {adForm.imageUrl ? (
              <img src={adForm.imageUrl} alt="Ad preview" style={{ width: 92, height: 60, objectFit: "cover", borderRadius: 10 }} />
            ) : (
              <span className="tag">No image</span>
            )}
            <input
              type="file"
              accept="image/*"
              className="form-control form-control-sm"
              onChange={(event) => {
                const file = event.target.files && event.target.files[0];
                readImage(file, 2 * 1024 * 1024, setError, (dataUrl) => setAdForm((prev) => ({ ...prev, imageUrl: dataUrl })));
              }}
            />
            {adForm.imageUrl ? (
              <button type="button" className="btn btn-sm btn-coral" onClick={() => setAdForm({ ...adForm, imageUrl: "" })}>
                ✕
              </button>
            ) : null}
          </div>

          <div>
            <label className="form-label small fw-semibold">Live preview</label>
            <AdCard ad={adForm} preview />
          </div>

          <div className="d-flex justify-content-end gap-2">
            {adForm.id ? (
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setAdForm(BLANK_AD)}>
                Cancel edit
              </button>
            ) : null}
            <button type="submit" className="btn btn-primary btn-sm">
              {adForm.id ? "Update ad" : "Publish ad"}
            </button>
          </div>
        </form>

        <div className="card p-3">
          <h3 className="h6 mb-2">Live ads ({ads.filter((a) => a.active).length} active)</h3>
          {ads.length === 0 ? (
            <p className="small text-secondary">Nothing published yet.</p>
          ) : (
            <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
              {ads.map((ad) => (
                <li key={ad.id} className="d-flex align-items-center gap-3">
                  {ad.imageUrl ? <img src={ad.imageUrl} alt="" style={{ width: 54, height: 40, objectFit: "cover", borderRadius: 8 }} /> : <span className="tag">Text</span>}
                  <span className="flex-grow-1" style={{ minWidth: 0 }}>
                    <span className="d-block small fw-semibold text-truncate">{ad.title || "Untitled ad"}</span>
                    <span className="d-block mono text-secondary" style={{ fontSize: 11 }}>
                      {ad.placement} · {ad.style || "banner"} · {ad.active ? "live" : "paused"}
                    </span>
                  </span>
                  <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => toggleAd(ad.id)}>
                    {ad.active ? "Pause" : "Publish"}
                  </button>
                  <button type="button" className="btn btn-sm btn-soft py-0" onClick={() => editAd(ad)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-sm btn-coral py-0" onClick={() => deleteAd(ad.id)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
