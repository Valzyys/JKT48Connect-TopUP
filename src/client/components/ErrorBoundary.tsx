import { Component, type ErrorInfo, type ReactNode } from "react";

const RELOAD_KEY = "jc.chunk-reload";

/**
 * A redeploy replaces the hashed JS chunks. A tab opened before it still points
 * at the old files, so the next lazy import fails. One reload picks up the new
 * build; the timestamp stops a reload loop if the file is truly missing.
 */
function isStaleChunk(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(error.message);
}

function reloadOnce(): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
}

/**
 * Without a boundary, any render error unmounts the whole app and leaves an
 * empty page. This keeps the header and footer, says what happened, and lets
 * the visitor retry. Give it a `key` that changes on navigation so the next
 * page renders fresh.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("render failed", error, info.componentStack);
    if (isStaleChunk(error)) reloadOnce();
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl px-4 py-14" role="alert">
        <h1 className="text-xl font-semibold">Halaman ini gagal ditampilkan</h1>
        <p className="mt-2 text-ink-2">Muat ulang halaman. Kalau masih terjadi, kirim teks di bawah ini ke admin.</p>
        <pre className="mt-4 overflow-x-auto rounded-control border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink-2">{error.message || error.name}</pre>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => window.location.reload()} className="press h-10 rounded-button bg-ink px-4 text-sm font-medium text-bg">
            Muat ulang
          </button>
          <a href="/" className="press inline-flex h-10 items-center rounded-button border border-line-strong px-4 text-sm font-medium text-ink">
            Ke halaman utama
          </a>
        </div>
      </div>
    );
  }
}
