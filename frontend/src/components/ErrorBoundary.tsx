import React from "react";

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("UI error:", error); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "#191919", color: "#eee", fontFamily: "-apple-system, sans-serif" }}>
          <div style={{ maxWidth: 420, textAlign: "center", padding: 24 }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>◉</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>界面遇到了一个错误</h2>
            <p style={{ fontSize: 12.5, opacity: .7, wordBreak: "break-word" }}>{String(this.state.error?.message || this.state.error)}</p>
            <button onClick={() => location.reload()} style={{ marginTop: 10, padding: "8px 18px", borderRadius: 8, border: "1px solid #444", background: "#2a2a2a", color: "#eee", cursor: "pointer" }}>重新加载</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
