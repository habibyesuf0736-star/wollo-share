import React, { Suspense, lazy, useEffect } from "react";
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
import universityEmblem from "./assets/images/wollo-university-emblem.png";

// Everything a student is unlikely to hit on the first paint — the admin workspace, the
// support desk, sign-in, profile, premium — ships as its own chunk, so the library loads
// without the QR code, review-queue or video-player code in the same bundle.
const ProfilePage = lazy(() => import("./pages/ProfilePage.jsx"));
const LoginPage = lazy(() => import("./pages/LoginPage.jsx"));
const DeviceLoginPage = lazy(() => import("./pages/DeviceLoginPage.jsx"));
const AdminPage = lazy(() => import("./pages/AdminPage.jsx"));
const SupportPage = lazy(() => import("./pages/SupportPage.jsx"));
const PremiumPage = lazy(() => import("./pages/PremiumPage.jsx"));
const HelpPage = lazy(() => import("./pages/HelpPage.jsx"));
const NewsPage = lazy(() => import("./pages/NewsPage.jsx"));
const ChatPage = lazy(() => import("./pages/ChatPage.jsx"));
const PracticePage = lazy(() => import("./pages/PracticePage.jsx"));
const DownloadsPage = lazy(() => import("./pages/DownloadsPage.jsx"));

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
  const { booting, view, toast } = useApp();

  // Allow components that don't have direct context access (e.g. inside lazy-loaded pages)
  // to fire a toast by dispatching a custom event — used by the timed exam auto-submit.
  useEffect(() => {
    const handler = (event) => { if (event.detail) toast(String(event.detail)); };
    window.addEventListener("wollo:toast", handler);
    return () => window.removeEventListener("wollo:toast", handler);
  }, [toast]);

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
            {view.name === "login" ? <LoginPage key={view.tab || "signin"} initialTab={view.tab} /> : null}
            {view.name === "deviceLogin" ? <DeviceLoginPage key={view.qrId} qrId={view.qrId} /> : null}
            {view.name === "profile" ? <ProfilePage /> : null}
            {view.name === "support" ? <SupportPage /> : null}
            {view.name === "help" ? <HelpPage /> : null}
            {view.name === "news" ? <NewsPage key={view.slug || "index"} /> : null}
            {view.name === "chat" ? <ChatPage /> : null}
            {view.name === "practice" ? <PracticePage /> : null}
            {view.name === "downloads" ? <DownloadsPage /> : null}
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
