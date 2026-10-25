import React from "react";
import { useApp } from "../store/AppContext.jsx";

export default function StarRating({ course, mat }) {
  const { session, myRatingFor, rateMaterial, goLogin } = useApp();
  const avg = typeof mat.ratingAvg === "number" && mat.ratingAvg > 0 ? mat.ratingAvg : 0;
  const count = Number(mat.ratingCount) || 0;
  const mine = myRatingFor(mat.id);
  const shown = mine > 0 ? mine : Math.round(avg);

  return (
    <div className="d-flex align-items-center flex-wrap gap-1">
      <div className={`d-flex ${session ? "can-rate" : ""}`} role="group" aria-label={`Rating for ${mat.name}`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={`star-btn ${star <= shown ? "filled" : ""}`}
            title={session ? `Rate ${star} of 5` : "Sign in as a student to rate"}
            aria-label={`Rate ${mat.name} ${star} out of 5 stars`}
            onClick={() => (session ? rateMaterial(course.id, mat.id, star) : goLogin())}
          >
            ★
          </button>
        ))}
      </div>
      <span className="mat-meta">{avg > 0 ? `${avg.toFixed(1)} avg` : "Unrated"}</span>
      <span className="mat-meta">
        ({count} {count === 1 ? "rating" : "ratings"})
      </span>
      {mine > 0 ? <span className="tag">Your rating: {mine}★</span> : null}
    </div>
  );
}
