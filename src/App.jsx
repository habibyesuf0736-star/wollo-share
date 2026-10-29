import React, { Suspense, lazy } from "react";
import { AppProvider, useApp } from "./store/AppContext.jsx";
import TopBar from "./components/TopBar.jsx";
import Footer from "./components/Footer.jsx";
import ToastStack from "./components/ToastStack.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import ShareMaterialModal from "./components/ShareMaterialModal.jsx";
import AdGateModal from "./components/AdGateModal.jsx";
import UpgradeGateModal from "./components/UpgradeGateModal.jsx";
import QuickRegisterModal from "./components/QuickRegisterModal.jsx";
import VideoPlayerModal from "./components/VideoPlayerModal.jsx";
import LibraryPage from "./pages/LibraryPage.jsx";
import SublistPage from "./pages/SublistPage.jsx";
import universityEmblem from "./assets/images/wollo-university-emblem.jpg";

// Everything a student is unlikely to hit on the first paint — the admin workspace, the
// support desk, sign-in, profile, premium — ships as its own chunk, so the library loads
// without the QR code, review-queue or video-player code in the same bundle.
const ProfilePage = lazy(() => import("./pages/ProfilePage.jsx"));
const LoginPage = lazy(() => import("./pages/LoginPage.jsx"));
const DeviceLoginPage = lazy(() => import("./pages/DeviceLoginPage.jsx"));
const AdminPage = lazy(() => import("./pages/AdminPage.jsx"));
const SupportPage = lazy(() => import("./pages/SupportPage.jsx"));
const PremiumPage = lazy(() => import("./pages/PremiumPage.jsx"));

function PageFallback() {
  return (
    <div className="ws-page py-5 text-center" role="status">
      <div className="ws-boot-track mx-auto">
        <span className="ws-boot-bar" />
      </div>
    </div>
  );
}

function Shell() {
  const { booting, view } = useApp();

  if (booting) {
    return (
      <div className="ws-page text-center py-5">
        <span className="ws-brand-mark mx-auto mb-3" aria-hidden="true">
          <img src={universityEmblem} alt="" />
        </span>
        <div className="ws-boot-track mx-auto" role="status" aria-label="Loading the library">
          <span className="ws-boot-bar" />
        </div>
        <p className="small text-secondary mt-3 mb-0">Loading the Wollo Share course library…</p>
      </div>
    );
  }

  return (
    <>
      <TopBar />
      <main id="main">
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            {view.name === "sublist" ? <SublistPage key={`${view.courseId}|${view.query || ""}`} /> : null}
            {view.name === "login" ? <LoginPage /> : null}
            {view.name === "deviceLogin" ? <DeviceLoginPage key={view.qrId} qrId={view.qrId} /> : null}
            {view.name === "profile" ? <ProfilePage /> : null}
            {view.name === "support" ? <SupportPage /> : null}
            {view.name === "premium" ? <PremiumPage /> : null}
            {view.name === "admin" ? <AdminPage /> : null}
            {view.name === "library" ? <LibraryPage /> : null}
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <ShareMaterialModal />
      <AdGateModal />
      <UpgradeGateModal />
      <QuickRegisterModal />
      <VideoPlayerModal />
      <ToastStack />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
