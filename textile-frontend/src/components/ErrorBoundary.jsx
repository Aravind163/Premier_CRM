// src/components/ErrorBoundary.jsx
//
// Catches render/lifecycle errors anywhere below it in the tree and shows
// a recoverable message instead of letting React unmount the whole app
// (the "blank white screen" failure mode).
import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Still surface it in the console for debugging — we're just stopping
    // it from taking the whole page down.
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            style={{
              padding: "20px 22px",
              borderRadius: 12,
              border: "1px solid rgba(178,58,58,0.3)",
              background: "rgba(178,58,58,0.06)",
              color: "#B23A3A",
              fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
              fontSize: 13.5,
            }}
          >
            <p style={{ margin: "0 0 8px", fontWeight: 700 }}>Something didn't render correctly here.</p>
            <p style={{ margin: 0, opacity: 0.85 }}>The rest of the page is unaffected. Try refreshing — if it keeps happening, let us know what you were doing.</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              style={{ marginTop: 12, padding: "6px 14px", borderRadius: 8, border: "1px solid #B23A3A", background: "transparent", color: "#B23A3A", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}