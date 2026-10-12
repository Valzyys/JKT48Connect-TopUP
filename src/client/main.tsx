import { StrictMode, Suspense, lazy, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { Toaster } from "sonner";
import { Layout } from "./components/Layout";
import { useTheme } from "./lib/theme";
import { Game } from "./pages/Game";
import { Home } from "./pages/Home";
import { Lookup } from "./pages/Lookup";
import { Order } from "./pages/Order";
import "./styles.css";

// Operators only: keep the console out of the storefront bundle.
const Admin = lazy(() => import("./pages/Admin").then((m) => ({ default: m.Admin })));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-ink-2">Alamat ini tidak ada. Kembali ke daftar game untuk mulai top-up.</p>
    </div>
  );
}

function App() {
  const [theme] = useTheme();
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/game/:slug" element={<Game />} />
          <Route path="/pesanan/:ref" element={<Order />} />
          <Route path="/cek" element={<Lookup />} />
          <Route path="/admin" element={<Suspense fallback={null}><Admin /></Suspense>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
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
