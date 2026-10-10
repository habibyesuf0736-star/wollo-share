import { useState } from "react";
import { videos } from "../resources.js";
import AdminMaterials from "./AdminMaterials.jsx";

export default function AdminDashboard({
  learners,
  recentActivity,
  customMaterials,
  categories,
  loading,
  error,
  updatingAccessId,
  materialError,
  materialMessage,
  categoryError,
  categoryMessage,
  addingMaterial,
  addingCategory,
  addingSubcategory,
  removingMaterialId,
  onAddCategory,
  onAddSubcategory,
  onAddMaterial,
  onRemoveMaterial,
  onToggleAccess,
  onRefresh,
  onBackToLibrary
}) {
  const [activeSection, setActiveSection] = useState("overview");
  const [learnerSearch, setLearnerSearch] = useState("");
  const eventLabels = {
    sign_in: "Signed in",
    resource_open: "Opened resource",
    video_completed: "Completed video",
    video_uncompleted: "Unmarked video",
    material_added: "Material added",
    material_removed: "Material removed",
    category_added: "Category created",
    subcategory_added: "Subcategory created"
  };
  const pendingLearners = learners.filter((learner) => learner.role !== "admin" && !learner.access_granted);
  const approvedCount = learners.length - pendingLearners.length;
  const completedCount = learners.reduce((total, learner) => total + learner.completed, 0);
  const filteredLearners = learners.filter((learner) => (
    learner.email || ""
  ).toLowerCase().includes(learnerSearch.trim().toLowerCase()));

  function renderLearnerRows(items) {
    return items.map((learner) => (
      <tr key={learner.id}>
        <td className="admin-learner-cell">
          <strong>{learner.email || "No email"}</strong>
          {learner.role === "admin" && <span className="access-status">Administrator</span>}
        </td>
        <td>{learner.completed} / {videos.length}</td>
        <td>
          <progress
            max={videos.length}
            value={learner.completed}
            aria-label={`${learner.completed} of ${videos.length} videos complete for ${learner.email || "learner"}`}
          />
        </td>
        <td>{learner.lastActive ? new Date(learner.lastActive).toLocaleString() : "No activity yet"}</td>
        <td>
          {learner.role === "admin" ? (
            <span className="access-status">Always active</span>
          ) : (
            <button
              className={`access-button ${learner.access_granted ? "access-button-revoke" : ""}`}
              type="button"
              disabled={updatingAccessId === learner.id}
              onClick={() => onToggleAccess(learner)}
            >
              {updatingAccessId === learner.id ? "Saving..." : learner.access_granted ? "Revoke" : "Grant access"}
            </button>
          )}
        </td>
      </tr>
    ));
  }

  function renderActivityRows(items) {
    return items.map((event) => (
      <tr key={event.id}>
        <td>{event.email || "Unknown learner"}</td>
        <td><span className="activity-type">{eventLabels[event.event_type] || event.event_type}</span></td>
        <td>{event.resourceTitle || "-"}</td>
        <td>{new Date(event.created_at).toLocaleString()}</td>
      </tr>
    ));
  }

  function renderPendingLearnerRows(items) {
    return items.map((learner) => (
      <tr key={learner.id}>
        <td><strong>{learner.email || "No email"}</strong></td>
        <td>{learner.created_at ? new Date(learner.created_at).toLocaleDateString() : "Unknown"}</td>
        <td>
          <button
            className="access-button"
            type="button"
            disabled={updatingAccessId === learner.id}
            onClick={() => onToggleAccess(learner)}
          >
            {updatingAccessId === learner.id ? "Saving..." : "Grant access"}
          </button>
        </td>
      </tr>
    ));
  }

  return (
    <section className="admin-panel" aria-labelledby="admin-title">
      <div className="admin-heading">
        <div>
          <div className="resource-kind"><span className="kind-dot" aria-hidden="true" />Workspace administration</div>
          <h1 id="admin-title">Admin dashboard</h1>
          <p className="admin-heading-copy">Manage learners and organize course materials.</p>
        </div>
        <div className="admin-heading-actions">
          <button className="text-button admin-back-button" type="button" onClick={onBackToLibrary}>
            Back to courses
          </button>
          <button className="primary-button admin-refresh-button" type="button" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh data"}
          </button>
        </div>
      </div>
      {error && <p className="message error" role="status">{error}</p>}

      <nav className="admin-tabs" aria-label="Admin sections">
        {[
          { id: "overview", label: "Overview" },
          { id: "learners", label: "Learners", count: learners.length },
          { id: "activity", label: "Activity", count: recentActivity.length },
          { id: "materials", label: "Materials", count: customMaterials.length }
        ].map((section) => (
          <button
            className="admin-tab"
            type="button"
            key={section.id}
            aria-current={activeSection === section.id ? "page" : undefined}
            onClick={() => setActiveSection(section.id)}
          >
            {section.label}
            {section.count !== undefined && <span>{section.count}</span>}
          </button>
        ))}
      </nav>

      <div className="admin-content" aria-live="polite">
        {loading && <p className="message">Loading dashboard data...</p>}
        {activeSection === "overview" && (
          <>
            <div className="admin-stats">
              <article className="admin-stat">
                <span>Total accounts</span>
                <strong>{learners.length}</strong>
                <small>Registered learners and admins</small>
              </article>
              <article className="admin-stat">
                <span>Access granted</span>
                <strong>{approvedCount}</strong>
                <small>Accounts ready to track progress</small>
              </article>
              <article className={`admin-stat ${pendingLearners.length ? "admin-stat-attention" : ""}`}>
                <span>Awaiting approval</span>
                <strong>{pendingLearners.length}</strong>
                <small>{pendingLearners.length ? "Review access requests" : "Everyone is up to date"}</small>
              </article>
              <article className="admin-stat">
                <span>Extra materials</span>
                <strong>{customMaterials.length}</strong>
                <small>Additional resources in your library</small>
              </article>
              <article className="admin-stat">
                <span>Videos completed</span>
                <strong>{completedCount}</strong>
                <small>Across all accounts</small>
              </article>
            </div>
            <div className="admin-overview-grid">
              <section className="admin-card" aria-labelledby="pending-title">
                <div className="admin-card-heading">
                  <div>
                    <h2 id="pending-title">Access requests</h2>
                    <p>Grant access so learners can save course progress.</p>
                  </div>
                  <button className="text-button" type="button" onClick={() => setActiveSection("learners")}>All learners</button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th scope="col">Learner</th><th scope="col">Joined</th><th scope="col">Action</th></tr></thead>
                    <tbody>
                      {renderPendingLearnerRows(pendingLearners.slice(0, 5))}
                      {!loading && pendingLearners.length === 0 && (
                        <tr><td className="admin-empty" colSpan="3">No pending access requests.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="admin-card" aria-labelledby="recent-activity-title">
                <div className="admin-card-heading">
                  <div>
                    <h2 id="recent-activity-title">Recent activity</h2>
                    <p>The latest actions across your learning library.</p>
                  </div>
                  <button className="text-button" type="button" onClick={() => setActiveSection("activity")}>View all</button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th scope="col">Learner</th><th scope="col">Activity</th><th scope="col">Time</th></tr></thead>
                    <tbody>
                      {recentActivity.slice(0, 5).map((event) => (
                        <tr key={event.id}>
                          <td>{event.email || "Unknown learner"}</td>
                          <td>{eventLabels[event.event_type] || event.event_type}</td>
                          <td>{new Date(event.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                      {!loading && recentActivity.length === 0 && (
                        <tr><td className="admin-empty" colSpan="3">No activity recorded yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        )}

        {activeSection === "learners" && (
          <section className="admin-card" aria-labelledby="learners-title">
            <div className="admin-card-heading admin-learners-heading">
              <div>
                <h2 id="learners-title">Learner accounts</h2>
                <p>Review progress and approve or revoke course access.</p>
              </div>
              <label className="admin-search">
                <span className="visually-hidden">Search learners by email</span>
                <input
                  type="search"
                  placeholder="Search learners..."
                  value={learnerSearch}
                  onChange={(event) => setLearnerSearch(event.target.value)}
                />
              </label>
            </div>
            <div className="table-wrap">
              <table className="admin-learners-table">
                <thead><tr><th scope="col">Learner</th><th scope="col">Videos complete</th><th scope="col">Progress</th><th scope="col">Last active</th><th scope="col">Access</th></tr></thead>
                <tbody>
                  {renderLearnerRows(filteredLearners)}
                  {!loading && learners.length === 0 && <tr><td className="admin-empty" colSpan="5">No learner accounts yet.</td></tr>}
                  {!loading && learners.length > 0 && filteredLearners.length === 0 && <tr><td className="admin-empty" colSpan="5">No learners match that email.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeSection === "activity" && (
          <section className="admin-card" aria-labelledby="activity-title">
            <div className="admin-card-heading">
              <div>
                <h2 id="activity-title">Activity log</h2>
                <p>Sign-ins, resource opens, and course progress changes.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Learner</th><th scope="col">Activity</th><th scope="col">Resource</th><th scope="col">Time</th></tr></thead>
                <tbody>
                  {renderActivityRows(recentActivity)}
                  {!loading && recentActivity.length === 0 && <tr><td className="admin-empty" colSpan="4">No activity recorded yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <AdminMaterials
          active={activeSection === "materials"}
          categories={categories}
          customMaterials={customMaterials}
          materialError={materialError}
          materialMessage={materialMessage}
          categoryError={categoryError}
          categoryMessage={categoryMessage}
          addingMaterial={addingMaterial}
          addingCategory={addingCategory}
          addingSubcategory={addingSubcategory}
          removingMaterialId={removingMaterialId}
          onAddCategory={onAddCategory}
          onAddSubcategory={onAddSubcategory}
          onAddMaterial={onAddMaterial}
          onRemoveMaterial={onRemoveMaterial}
        />
      </div>
    </section>
  );
}
