export default function ResourceCard({ resource, completed, onProgressChange, onRequestAuth, onResourceOpen, saving, signedIn, accessPending }) {
  const isCode = resource.type === "code";
  const isAdditionalMaterial = resource.type === "material";
  const isCustomResource = Boolean(resource.categoryId);

  return (
    <article className={`resource ${isCode ? "" : "resource-video"}`}>
      <a
        className="media"
        href={resource.url}
        target={resource.localFile ? undefined : "_blank"}
        rel={resource.localFile ? undefined : "noreferrer"}
        download={resource.localFile ? resource.fileName : undefined}
        onClick={() => onResourceOpen(resource)}
      >
        {isCode ? (
          <div className="repo-art">
            <span>{resource.localFile ? "Uploaded code file" : isCustomResource ? "Code project" : "GitHub repository"}</span>
            <strong>{resource.title}</strong>
          </div>
        ) : isAdditionalMaterial ? (
          <div className="material-art">
            <span>{resource.localFile ? "Uploaded file" : "Additional material"}</span>
            <strong>{resource.title}</strong>
          </div>
        ) : (
          <>
            <img
              src={`https://img.youtube.com/vi/${resource.id}/mqdefault.jpg`}
              alt={`Thumbnail for ${resource.title}`}
              loading="lazy"
              onError={(event) => { event.currentTarget.hidden = true; }}
            />
            <span className="play" aria-hidden="true">&#9654;</span>
          </>
        )}
      </a>
      <div className="resource-info">
        <div className="resource-kind">
          <span className="kind-dot" aria-hidden="true" />
          {isCode
            ? resource.localFile ? "Uploaded code file" : isCustomResource ? "Code project" : "Code repository"
            : isAdditionalMaterial ? resource.localFile ? "Uploaded file" : "Additional material" : "YouTube video"}
        </div>
        <h2>
          <a
            className="resource-link"
            href={resource.url}
            target={resource.localFile ? undefined : "_blank"}
            rel={resource.localFile ? undefined : "noreferrer"}
            download={resource.localFile ? resource.fileName : undefined}
            onClick={() => onResourceOpen(resource)}
          >
            {resource.title}
          </a>
        </h2>
        <div className="resource-id">
          {isCustomResource
            ? resource.localFile ? resource.fileName : new URL(resource.url).hostname
            : resource.id}
        </div>
        {isCustomResource && (
          <p className="material-category-path">
            {resource.categoryName} / {resource.subcategoryName}
          </p>
        )}
        {isCustomResource && resource.description && <p className="resource-description">{resource.description}</p>}
        {!isCode && !isAdditionalMaterial && signedIn && (
          <label className="complete-control">
            <input
              type="checkbox"
              checked={completed}
              disabled={saving}
              aria-label={`Mark ${resource.title} complete`}
              onChange={(event) => onProgressChange(resource.id, event.target.checked)}
            />
            <span>{saving ? "Saving..." : "Mark complete"}</span>
          </label>
        )}
        {!isCode && !isAdditionalMaterial && !signedIn && !accessPending && (
          <button className="text-button complete-control" type="button" onClick={onRequestAuth}>
            Sign in to track
          </button>
        )}
        {!isCode && !isAdditionalMaterial && accessPending && <span className="access-pending-note">Access pending approval</span>}
      </div>
    </article>
  );
}
