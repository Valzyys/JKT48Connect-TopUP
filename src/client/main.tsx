import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router";
import { Toaster } from "sonner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { useSmoothScroll } from "./lib/smoothScroll";
import { useTheme } from "./lib/theme";
import { Shop } from "./pages/Shop";
import "./styles.css";

// Only the shop is in the first download; other pages load when visited.
const Admin = lazy(() => import("./pages/Admin").then((m) => ({ default: m.Admin })));
const Order = lazy(() => import("./pages/Order").then((m) => ({ default: m.Order })));
const Lookup = lazy(() => import("./pages/Lookup").then((m) => ({ default: m.Lookup })));

/** Holds the page's height while its code loads, so the footer does not jump up. */
const pageFallback = <div className="min-h-[70dvh]" />;

function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <h1 className="text-xl font-semibold">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-ink-2">Alamat ini tidak ada.</p>
      <Link to="/" className="mt-4 inline-block font-medium text-accent underline-offset-4 hover:underline">
        Kembali ke top-up
      </Link>
    </div>
  );
}

function Pages() {
  const { pathname } = useLocation();
  const shop = pathname === "/" || pathname.startsWith("/game/");
  useSmoothScroll();
  return (
    // Keyed by page: an error on one page never blanks the next one. Switching
    // games stays inside the shop, so its state and catalog survive.
    <ErrorBoundary key={shop ? "shop" : pathname}>
      <Routes>
        <Route path="/" element={<Shop />} />
        <Route path="/game/:slug" element={<Shop />} />
        <Route path="/pesanan/:ref" element={<Suspense fallback={pageFallback}><Order /></Suspense>} />
        <Route path="/cek" element={<Suspense fallback={pageFallback}><Lookup /></Suspense>} />
        <Route path="/admin" element={<Suspense fallback={pageFallback}><Admin /></Suspense>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}

function App() {
  const [theme] = useTheme();
  return (
    <BrowserRouter>
      <Layout>
        <Pages />
      </Layout>
      <Toaster theme={theme} position="bottom-center" offset={88} mobileOffset={96} />
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
