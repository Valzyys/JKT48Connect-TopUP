import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

function current(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(current);

  useEffect(() => {
    // Follow the OS while the visitor has not chosen a theme themselves.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem("jc.theme");
      } catch {
        // ignore
      }
      if (stored) return;
      const next: Theme = mq.matches ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("jc.theme", next);
    } catch {
      // ignore
    }
    setTheme(next);
  }, []);

  return [theme, toggle];
}
