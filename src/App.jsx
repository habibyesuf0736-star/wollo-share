import { useEffect, useRef, useState } from "react";
import { resources, videos } from "./resources.js";
import * as localDatabase from "./lib/localDatabase.js";
import { ADMIN_EMAIL } from "./lib/localDatabase.js";
import { supabase } from "./lib/supabase.js";
import AdminDashboard from "./components/AdminDashboard.jsx";
import ResourceCard from "./components/ResourceCard.jsx";

const filters = [
  { id: "all", label: "All" },
  { id: "video", label: "Videos" },
  { id: "code", label: "Code" },
  { id: "material", label: "Materials" }
];

function getRateLimitSeconds(message) {
  const match = message.match(/only request this after (\d+) seconds?/i);
  return match ? Number(match[1]) : 0;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [accountLoading, setAccountLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [completedVideos, setCompletedVideos] = useState(() => new Set());
  const [authMode, setAuthMode] = useState("signin");
  const [showAuthPanel, setShowAuthPanel] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState(false);
  const [appMessage, setAppMessage] = useState("");
  const [appError, setAppError] = useState(false);
  const [currentView, setCurrentView] = useState("library");
  const [categories, setCategories] = useState([]);
  const [customMaterials, setCustomMaterials] = useState([]);
  const [materialError, setMaterialError] = useState("");
  const [materialMessage, setMaterialMessage] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [categoryMessage, setCategoryMessage] = useState("");
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingSubcategory, setAddingSubcategory] = useState(false);
  const [removingMaterialId, setRemovingMaterialId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [categoryFilterId, setCategoryFilterId] = useState("");
  const [subcategoryFilterId, setSubcategoryFilterId] = useState("");
  const [savingVideo, setSavingVideo] = useState(null);
  const [learners, setLearners] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [updatingAccessId, setUpdatingAccessId] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const localFileUrls = useRef(new Map());

  const userId = session?.user?.id;
  const isAdmin = profile?.id === userId &&
    profile?.role === "admin" &&
    session?.user?.email?.toLowerCase() === ADMIN_EMAIL;
  const hasAppAccess = isAdmin || profile?.access_granted === true;
  const progressCount = completedVideos.size;
  const libraryResources = [
    ...resources,
    ...customMaterials.map((material) => {
      const category = categories.find((item) => item.id === material.categoryId);
      const subcategory = category?.subcategories.find((item) => item.id === material.subcategoryId);
      return {
        ...material,
        categoryName: category?.name || "Uncategorized",
        subcategoryName: subcategory?.name || "Uncategorized"
      };
    })
  ];

  useEffect(() => {
    let active = true;

    if (!supabase) {
      try {
        setCategories(localDatabase.getCategories());
        const storedMaterials = localDatabase.getCustomMaterials();
        const localFileIds = new Set(storedMaterials.filter((material) => material.localFile).map((material) => material.id));
        for (const [materialId, url] of localFileUrls.current) {
          if (!localFileIds.has(materialId)) {
            URL.revokeObjectURL(url);
            localFileUrls.current.delete(materialId);
          }
        }
        Promise.all(storedMaterials.map(async (material) => {
          if (!material.localFile) return material;
          let url = localFileUrls.current.get(material.id);
          if (!url) {
            url = await localDatabase.getLocalFileUrl(material.id);
            if (!active) {
              URL.revokeObjectURL(url);
              return material;
            }
            localFileUrls.current.set(material.id, url);
          }
          return { ...material, url };
        })).then((materials) => {
          if (active) setCustomMaterials(materials);
        }).catch((error) => {
          if (active) {
            setAppError(true);
            setAppMessage(error.message || "Could not load local learning files.");
          }
        });
      } catch (error) {
        setAppError(true);
        setAppMessage(error.message || "Could not load learning materials.");
      }
    }

    return () => {
      active = false;
    };
  }, [dashboardRefresh]);

  useEffect(() => () => {
    for (const url of localFileUrls.current.values()) URL.revokeObjectURL(url);
    localFileUrls.current.clear();
  }, []);

  useEffect(() => {
    if (!isAdmin && currentView === "admin") setCurrentView("library");
  }, [isAdmin, currentView]);

  useEffect(() => {
    if (resendCooldown === 0) return undefined;
    const timeout = window.setTimeout(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [resendCooldown]);

  function applySession(nextSession) {
    setSession(nextSession);
    setProfile(null);
    setCompletedVideos(new Set());
    setAccountLoading(Boolean(nextSession?.user));
    if (nextSession?.user) setShowAuthPanel(false);
  }

  useEffect(() => {
    if (!supabase) {
      try {
        applySession(localDatabase.getSession());
      } catch (error) {
        setAppError(true);
        setAppMessage(error.message || "Could not open the local database.");
      } finally {
        setSessionLoading(false);
      }
      return undefined;
    }

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      queueMicrotask(() => {
        if (active) {
          applySession(nextSession);
          setSessionLoading(false);
        }
      });
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setAuthError(true);
        setAuthMessage(error.message);
      } else {
        applySession(data.session);
      }
      setSessionLoading(false);
    }).catch((error) => {
      if (active) {
        setAuthError(true);
        setAuthMessage(error.message || "Could not connect to Supabase.");
        setSessionLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setCompletedVideos(new Set());
      setAccountLoading(false);
      return undefined;
    }

    let active = true;
    setAccountLoading(true);
    setAppMessage("");

    if (!supabase) {
      try {
        const nextProfile = localDatabase.getProfile(userId);
        setProfile(nextProfile);
        setCompletedVideos(
          nextProfile.role === "admin" || nextProfile.access_granted
            ? new Set(localDatabase.getProgress(userId))
            : new Set()
        );
      } catch (error) {
        setProfile(null);
        setAppError(true);
        setAppMessage(error.message || "Could not load your local progress.");
      } finally {
        setAccountLoading(false);
      }
      return () => { active = false; };
    }

    supabase.from("profiles").select("id,role,access_granted").eq("id", userId).single().then(async (profileResult) => {
      if (profileResult.error) throw profileResult.error;
      if (!active) return;
      setProfile(profileResult.data);

      if (profileResult.data.role !== "admin" && !profileResult.data.access_granted) {
        setCompletedVideos(new Set());
        return;
      }

      const progressResult = await supabase.from("video_progress").select("video_id").eq("user_id", userId);
      if (progressResult.error) throw progressResult.error;
      if (!active) return;
      setCompletedVideos(new Set(progressResult.data.map((item) => item.video_id)));
    }).catch((error) => {
      if (active) {
        setProfile(null);
        setAppError(true);
        setAppMessage(["PGRST204", "PGRST205", "42703"].includes(error.code)
          ? "Run the latest supabase.sql in your Supabase SQL Editor to set up account access and progress."
          : error.message || "Could not load your progress.");
      }
    }).finally(() => {
      if (active) setAccountLoading(false);
    });

    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!isAdmin) {
      setLearners([]);
      setRecentActivity([]);
      return undefined;
    }

    let active = true;
    setDashboardLoading(true);
    setDashboardError("");

    const dashboardRequest = supabase
      ? Promise.all([
        supabase.from("profiles").select("id,email,role,access_granted,created_at").order("email"),
        supabase.from("video_progress").select("user_id,video_id"),
        supabase.from("user_activity").select("id,user_id,event_type,resource_id,created_at").order("created_at", { ascending: false }).limit(50)
      ])
      : Promise.resolve().then(() => {
        const dashboard = localDatabase.getDashboardData();
        return [
          { data: dashboard.profiles, error: null },
          { data: dashboard.progress, error: null },
          { data: dashboard.activity, error: null }
        ];
      });

    dashboardRequest.then(([profilesResult, progressResult, activityResult]) => {
      if (profilesResult.error) throw profilesResult.error;
      if (progressResult.error) throw progressResult.error;
      if (activityResult.error) throw activityResult.error;
      if (!active) return;

      const completedByUser = new Map();
      for (const record of progressResult.data) {
        completedByUser.set(record.user_id, (completedByUser.get(record.user_id) || 0) + 1);
      }
      const profileById = new Map(profilesResult.data.map((profileItem) => [profileItem.id, profileItem]));
      const catalogTitles = new Map(libraryResources.map((resource) => [resource.id, resource.title]));
      for (const category of categories) {
        catalogTitles.set(category.id, category.name);
        for (const subcategory of category.subcategories) catalogTitles.set(subcategory.id, subcategory.name);
      }
      const latestActivityByUser = new Map();
      const activityWithLearners = activityResult.data.map((event) => {
        const learner = profileById.get(event.user_id);
        if (!latestActivityByUser.has(event.user_id)) latestActivityByUser.set(event.user_id, event.created_at);
        return {
          ...event,
          email: learner?.email,
          resourceTitle: catalogTitles.get(event.resource_id)
        };
      });
      setLearners(profilesResult.data.map((learner) => ({
        ...learner,
        completed: completedByUser.get(learner.id) || 0,
        lastActive: latestActivityByUser.get(learner.id) || learner.created_at
      })));
      setRecentActivity(activityWithLearners);
    }).catch((error) => {
      if (active) setDashboardError(["PGRST204", "PGRST205", "42703"].includes(error.code)
        ? "Run the latest supabase.sql to set up access controls and activity logging."
        : error.message || "Could not load user activity.");
    }).finally(() => {
      if (active) setDashboardLoading(false);
    });

    return () => { active = false; };
  }, [isAdmin, dashboardRefresh, categories, customMaterials]);

  async function recordActivity(eventType, resourceId = null, actorId = userId) {
    if (!actorId) return;
    if (!supabase) {
      try {
        localDatabase.recordActivity(actorId, eventType, resourceId);
        if (isAdmin) setDashboardRefresh((current) => current + 1);
      } catch (error) {
        setAppError(true);
        setAppMessage(error.message || "Could not save activity to the local database.");
      }
      return;
    }

    const { error } = await supabase.from("user_activity").insert({
      user_id: actorId,
      event_type: eventType,
      resource_id: resourceId
    });
    if (error) {
      setAppError(true);
      setAppMessage(error.code === "PGRST205"
        ? "Activity logging needs the latest supabase.sql. Ask your project admin to run it."
        : "Your action completed, but its activity could not be recorded.");
      return;
    }
    if (isAdmin) setDashboardRefresh((current) => current + 1);
  }

  function handleResourceOpen(resource) {
    if (userId && hasAppAccess) void recordActivity("resource_open", resource.id);
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();

    setAuthBusy(true);
    setAuthMessage("");
    setAuthError(false);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email")).trim();
    const password = String(formData.get("password"));

    try {
      if (!supabase) {
        const nextSession = authMode === "signup"
          ? await localDatabase.createAccount(email, password)
          : await localDatabase.signIn(email, password);
        applySession(nextSession);
        setAppMessage(authMode === "signup"
          ? "Local account created. Your data stays in this browser."
          : "Signed in to your local account.");
        setAppError(false);
        await recordActivity("sign_in", null, nextSession.user.id);
        return;
      }

      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin }
        });
        if (error) throw error;
        if (data.session) {
          applySession(data.session);
          void recordActivity("sign_in", null, data.session.user.id);
        } else {
          setAuthMessage("Account created. Check your email to confirm it, then sign in.");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        applySession(data.session);
        void recordActivity("sign_in", null, data.session.user.id);
      }
    } catch (error) {
      const message = error.message || "Unable to sign in. Try again.";
      setResendCooldown(getRateLimitSeconds(message));
      setAuthError(true);
      setAuthMessage(/email not confirmed/i.test(message)
        ? "Email not confirmed. Use the resend option below, then check your inbox and spam folder."
        : message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleResendConfirmation() {
    if (!supabase) return;
    const email = authEmail.trim();
    if (!email) {
      setAuthError(true);
      setAuthMessage("Enter your email address first.");
      return;
    }

    setResendBusy(true);
    setAuthMessage("");
    setAuthError(false);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: window.location.origin }
      });
      if (error) throw error;
      setAuthMessage("If this account needs confirmation, Supabase sent a new email. Check your inbox and spam folder.");
    } catch (error) {
      const message = error.message || "Could not resend the confirmation email. Try again shortly.";
      setResendCooldown(getRateLimitSeconds(message));
      setAuthError(true);
      setAuthMessage(message);
    } finally {
      setResendBusy(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) {
      try {
        localDatabase.signOut();
        applySession(null);
        setAppMessage("");
        setAppError(false);
      } catch (error) {
        setAppError(true);
        setAppMessage(error.message || "Could not sign out.");
      }
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      setAppError(true);
      setAppMessage(error.message || "Could not sign out.");
    }
  }

  async function handleProgressChange(videoId, isComplete) {
    if (!userId || !hasAppAccess) return;

    setSavingVideo(videoId);
    setAppMessage("");
    try {
      if (!supabase) {
        localDatabase.setVideoCompleted(userId, videoId, isComplete);
        setCompletedVideos((current) => {
          const next = new Set(current);
          if (isComplete) next.add(videoId);
          else next.delete(videoId);
          return next;
        });
        if (isAdmin) setDashboardRefresh((current) => current + 1);
        return;
      }

      const result = isComplete
        ? await supabase.from("video_progress").insert({ user_id: userId, video_id: videoId })
        : await supabase.from("video_progress").delete().eq("user_id", userId).eq("video_id", videoId);
      if (result.error) throw result.error;

      setCompletedVideos((current) => {
        const next = new Set(current);
        if (isComplete) next.add(videoId);
        else next.delete(videoId);
        return next;
      });
      await recordActivity(isComplete ? "video_completed" : "video_uncompleted", videoId);
    } catch (error) {
      setAppError(true);
      setAppMessage(error.message || "Could not save progress. Try again.");
    } finally {
      setSavingVideo(null);
    }
  }

  async function handleToggleAccess(learner) {
    if (!isAdmin || learner.role === "admin") return;

    setUpdatingAccessId(learner.id);
    setDashboardError("");
    try {
      if (!supabase) {
        localDatabase.setUserAccess(learner.id, !learner.access_granted);
        setDashboardRefresh((current) => current + 1);
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ access_granted: !learner.access_granted })
        .eq("id", learner.id);
      if (error) throw error;
      setDashboardRefresh((current) => current + 1);
    } catch (error) {
      setDashboardError(error.message || "Could not update learner access.");
    } finally {
      setUpdatingAccessId(null);
    }
  }

  async function handleAddMaterial(material) {
    if (!isAdmin || supabase) {
      setMaterialError(supabase
        ? "Adding custom materials is currently supported in local mode only."
        : "Only an admin can add materials.");
      return false;
    }

    setAddingMaterial(true);
    setMaterialError("");
    setMaterialMessage("");
    try {
      const addedMaterial = material.file
        ? await localDatabase.addCustomFileMaterial(userId, material)
        : localDatabase.addCustomMaterial(userId, material);
      setMaterialMessage(`${addedMaterial.title} was added to the course library.`);
      setDashboardRefresh((current) => current + 1);
      return true;
    } catch (error) {
      setMaterialError(error.message || "Could not add the learning material.");
      return false;
    } finally {
      setAddingMaterial(false);
    }
  }

  function handleAddCategory(name) {
    if (!isAdmin || supabase) {
      setCategoryError(supabase
        ? "Category management is currently supported in local mode only."
        : "Only an admin can create categories.");
      return null;
    }

    setAddingCategory(true);
    setCategoryError("");
    setCategoryMessage("");
    try {
      const category = localDatabase.addCategory(userId, name);
      setCategories(localDatabase.getCategories());
      setCategoryMessage(`Category "${category.name}" was created.`);
      setDashboardRefresh((current) => current + 1);
      return category;
    } catch (error) {
      setCategoryError(error.message || "Could not create the category.");
      return null;
    } finally {
      setAddingCategory(false);
    }
  }

  function handleAddSubcategory(categoryId, name) {
    if (!isAdmin || supabase) {
      setCategoryError(supabase
        ? "Subcategory management is currently supported in local mode only."
        : "Only an admin can create subcategories.");
      return null;
    }

    setAddingSubcategory(true);
    setCategoryError("");
    setCategoryMessage("");
    try {
      const subcategory = localDatabase.addSubcategory(userId, categoryId, name);
      setCategories(localDatabase.getCategories());
      setCategoryMessage(`Subcategory "${subcategory.name}" was created.`);
      setDashboardRefresh((current) => current + 1);
      return subcategory;
    } catch (error) {
      setCategoryError(error.message || "Could not create the subcategory.");
      return null;
    } finally {
      setAddingSubcategory(false);
    }
  }

  async function handleRemoveMaterial(materialId) {
    if (!isAdmin || supabase) {
      setMaterialError(supabase
        ? "Managing custom materials is currently supported in local mode only."
        : "Only an admin can remove materials.");
      return;
    }

    setRemovingMaterialId(materialId);
    setMaterialError("");
    setMaterialMessage("");
    try {
      await localDatabase.removeCustomMaterial(userId, materialId);
      setMaterialMessage("The learning material was removed from the library.");
    } catch (error) {
      setMaterialError(error.message || "Could not remove the learning material.");
    } finally {
      setRemovingMaterialId(null);
      setDashboardRefresh((current) => current + 1);
    }
  }

  const visibleResources = libraryResources.filter((resource) => {
    const matchesFilter = categoryFilterId
      ? resource.type === "material" && resource.categoryId === categoryFilterId
      : filter === "all" || resource.type === filter;
    const matchesSubcategory = !subcategoryFilterId || resource.subcategoryId === subcategoryFilterId;
    const matchesQuery = `${resource.title} ${resource.id} ${resource.categoryName || ""} ${resource.subcategoryName || ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    return matchesFilter && matchesSubcategory && matchesQuery;
  });
  const selectedCategory = categories.find((category) => category.id === categoryFilterId);

  const progressPercent = Math.round((progressCount / videos.length) * 100);

  if (showAuthPanel && !session) {
    return (
      <main className="login-page">
        <div className="login-topline">
          <div className="brand"><span className="brand-mark" aria-hidden="true" />Evangadi Learning</div>
          <button className="text-button" type="button" onClick={() => setShowAuthPanel(false)}>Back to courses</button>
        </div>
        <div className="login-layout">
          <section className="login-intro">
            <div className="login-kicker">Evangadi Resources</div>
            <h1>{authMode === "signup" ? "Start learning." : "Welcome back."}</h1>
            <p>{authMode === "signup" ? "Create an account to save course progress and pick up where you left off." : "Sign in to continue your courses and keep your progress in sync."}</p>
            <div className="login-course-count"><strong>48</strong><span>courses, in your order</span></div>
          </section>
          <section className="login-card" aria-labelledby="auth-title">
            <div className="resource-kind"><span className="kind-dot" aria-hidden="true" />Learner account</div>
            <h2 id="auth-title">{authMode === "signup" ? "Create your account" : "Sign in"}</h2>
            <p className="auth-copy">
              {!supabase
                ? authMode === "signup"
                  ? `Your account is stored only in this browser. ${ADMIN_EMAIL} is the only local admin; other accounts are learners.`
                  : "Sign in to the account stored in this browser."
                : authMode === "signup"
                  ? "Use your email and a password with at least 6 characters."
                  : "Enter your email and password to continue."}
            </p>
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label>Email address<input name="email" type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required /></label>
              <label>Password<input name="password" type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength="6" required /></label>
              <button className="primary-button login-submit" type="submit" disabled={authBusy}>
                {authBusy ? "Please wait..." : authMode === "signup" ? "Create account" : "Sign in"}
              </button>
              <div className="login-secondary-actions">
                <button className="text-button" type="button" onClick={() => {
                  setAuthMode((current) => current === "signin" ? "signup" : "signin");
                  setAuthMessage("");
                  setAuthError(false);
                }}>
                  {authMode === "signup" ? "Back to sign in" : "Create account"}
                </button>
                {supabase && (
                  <button className="text-button resend-button" type="button" onClick={handleResendConfirmation} disabled={resendBusy || authBusy || resendCooldown > 0}>
                    {resendBusy ? "Sending..." : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend confirmation"}
                  </button>
                )}
              </div>
              {authMessage && <p className={`message ${authError ? "error" : ""}`} role="status">{authMessage}</p>}
            </form>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="topline">
        <div className="brand"><span className="brand-mark" aria-hidden="true" />Evangadi Learning</div>
        {session && (
          <div className="session-bar">
            {isAdmin && (
              <button
                className={`text-button admin-nav-button ${currentView === "admin" ? "admin-nav-button-active" : ""}`}
                type="button"
                aria-current={currentView === "admin" ? "page" : undefined}
                onClick={() => {
                  setCurrentView((view) => view === "admin" ? "library" : "admin");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                {currentView === "admin" ? "Course library" : "Admin panel"}
              </button>
            )}
            <span>{session.user.email}</span>
            <button className="text-button" type="button" onClick={handleSignOut}>Sign out</button>
          </div>
        )}
        {!session && (
          <button className="text-button" type="button" onClick={() => setShowAuthPanel((visible) => !visible)}>
            {showAuthPanel ? "Close sign in" : "Sign in"}
          </button>
        )}
      </div>

      {currentView === "library" && (
        <header className="intro">
          <h1>Evangadi Resources</h1>
          <p>A collection of learning videos and code resources, all in one place. Sign in to save your progress.</p>
        </header>
      )}

      {session && appMessage && <p className={`message ${appError ? "error" : ""}`} role="status">{appMessage}</p>}

      {currentView === "admin" && isAdmin ? (
        <AdminDashboard
          learners={learners}
          recentActivity={recentActivity}
          customMaterials={customMaterials}
          categories={categories}
          loading={dashboardLoading}
          error={dashboardError}
          updatingAccessId={updatingAccessId}
          materialError={materialError}
          materialMessage={materialMessage}
          categoryError={categoryError}
          categoryMessage={categoryMessage}
          addingMaterial={addingMaterial}
          addingCategory={addingCategory}
          addingSubcategory={addingSubcategory}
          removingMaterialId={removingMaterialId}
          onAddCategory={handleAddCategory}
          onAddSubcategory={handleAddSubcategory}
          onAddMaterial={handleAddMaterial}
          onRemoveMaterial={handleRemoveMaterial}
          onToggleAccess={handleToggleAccess}
          onRefresh={() => setDashboardRefresh((current) => current + 1)}
          onBackToLibrary={() => setCurrentView("library")}
        />
      ) : (
        <>
          {!supabase && (
            <section className="setup-note" role="status">
              <strong>Local mode:</strong> accounts, progress, and activity are saved in this browser only. {ADMIN_EMAIL} is the only local admin; all other accounts are learners. No cloud connection or email confirmation is needed.
            </section>
          )}
          {session && accountLoading && <p className="message" role="status">Loading your progress...</p>}
          {session && !accountLoading && profile && !hasAppAccess && (
            <section className="access-notice" role="status">
              <strong>Your account is awaiting approval.</strong>
              <span>You can browse the courses now. Progress tracking will be available after an admin grants access.</span>
            </section>
          )}
          <section aria-label="Browse resources">
            <div className="progress-overview">
              {session && hasAppAccess ? (
                <>
                  <div>
                    <strong>{progressCount} of {videos.length} videos complete</strong>
                    <span>{progressPercent}% · Progress saved to your account</span>
                  </div>
                  <progress max={videos.length} value={progressCount} aria-label={`${progressCount} of ${videos.length} videos complete`} />
                </>
              ) : (
                <>
                  <div>
                    <strong>{session ? "Access approval pending" : "Browse all learning resources"}</strong>
                    <span>{session ? "Progress tracking will unlock after an admin approves your account." : "Sign in any time to save your video progress."}</span>
                  </div>
                  {!session && supabase && <button className="primary-button" type="button" onClick={() => setShowAuthPanel(true)}>Sign in to track progress</button>}
                </>
              )}
            </div>
            <div className="toolbar">
              <div className="filters" role="group" aria-label="Filter resources">
                {filters.map((option) => (
                  <button
                    className="filter"
                    type="button"
                    key={option.id}
                    aria-pressed={filter === option.id}
                    onClick={() => {
                      setFilter(option.id);
                      setCategoryFilterId("");
                      setSubcategoryFilterId("");
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {categories.length > 0 && (
                <div className="category-filters" aria-label="Filter learning materials by category">
                  <label>
                    <span className="visually-hidden">Filter by category</span>
                    <select
                      value={categoryFilterId}
                      onChange={(event) => {
                        setCategoryFilterId(event.target.value);
                        setSubcategoryFilterId("");
                        setFilter(event.target.value ? "material" : "all");
                      }}
                    >
                      <option value="">All categories</option>
                      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="visually-hidden">Filter by subcategory</span>
                    <select
                      value={subcategoryFilterId}
                      disabled={!selectedCategory?.subcategories.length}
                      onChange={(event) => {
                        setSubcategoryFilterId(event.target.value);
                        setFilter(event.target.value ? "material" : categoryFilterId ? "material" : "all");
                      }}
                    >
                      <option value="">All subcategories</option>
                      {selectedCategory?.subcategories.map((subcategory) => (
                        <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <label className="search-wrap">
                <span className="visually-hidden">Search resources</span>
                <input
                  className="search"
                  type="search"
                  placeholder="Search by video or link ID"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
            <div className="results-line" aria-live="polite">
              <span><strong>{visibleResources.length}</strong> resources</span>
              <span>Open any item to visit its source</span>
            </div>
            <div className="grid">
              {visibleResources.map((resource) => (
                <ResourceCard
                  key={resource.id}
                  resource={resource}
                  completed={completedVideos.has(resource.id)}
                  onProgressChange={handleProgressChange}
                  onRequestAuth={() => setShowAuthPanel(true)}
                  onResourceOpen={handleResourceOpen}
                  saving={savingVideo === resource.id}
                  signedIn={Boolean(session && hasAppAccess)}
                  accessPending={Boolean(session && !hasAppAccess)}
                />
              ))}
            </div>
            {visibleResources.length === 0 && <div className="empty">No resources match that search.</div>}
          </section>
        </>
      )}

      <footer>
        <span>{currentView === "admin" ? "Evangadi Admin" : "Evangadi Resources"}</span>
        <span>{currentView === "admin" ? "Admin workspace · Learner access and activity" : "Videos open on YouTube · Code opens on GitHub"}</span>
      </footer>
    </main>
  );
}
