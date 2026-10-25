import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ws-page">
        <div className="card p-4 mx-auto" style={{ maxWidth: 620 }}>
          <h2 className="h5">This section stopped responding</h2>
          <p className="text-secondary small mb-3">
            {String(this.state.error.message || this.state.error)}
          </p>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              Reload the page
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => this.setState({ error: null })}
            >
              Try again without reloading
            </button>
          </div>
        </div>
      </div>
    );
  }
}
