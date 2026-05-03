import React from "react";

// Catches React render errors so a single broken component can't blank the
// whole screen. Used around portal pages and the admin app.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  reset = () => {
    this.setState({ error: null, errorInfo: null });
    if (typeof window !== "undefined") window.location.reload();
  };

  goHome = () => {
    if (typeof window !== "undefined") window.location.href = "/";
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F2EE] p-6">
        <div className="w-full max-w-lg rounded-3xl border border-[#E1E3EE] bg-white p-8 text-center shadow-[0_18px_40px_rgba(45,45,45,0.08)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFECEC] text-[#E05353]">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v5M12 16h.01" />
            </svg>
          </div>
          <h2 className="mt-5 premium-font-galdgdersemi text-2xl text-[#412460]">Something went wrong.</h2>
          <p className="mt-3 text-sm leading-relaxed text-[#2D2D2D]/55">
            We hit an unexpected error. Reloading usually clears it. If it keeps happening, please let support know.
          </p>
          {this.state.error?.message && (
            <p className="mt-3 break-words rounded-xl bg-[#F4F2EE] p-3 text-[11px] font-mono text-[#2D2D2D]/55">
              {this.state.error.message}
            </p>
          )}
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex items-center justify-center rounded-full bg-[#412460] px-6 py-3 text-xs font-semibold uppercase tracking-widest text-white hover:bg-[#B99353]"
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={this.goHome}
              className="inline-flex items-center justify-center rounded-full border border-[#D9CEE3] bg-white px-6 py-3 text-xs font-semibold uppercase tracking-widest text-[#412460] hover:bg-[#F4F2EE]"
            >
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
