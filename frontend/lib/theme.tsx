"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "yqby.theme";
const EVENT_NAME = "yqby-theme";

export function applyTheme(mode: ThemeMode): void {
  if (mode === "light") {
    document.documentElement.dataset.theme = "light";
  } else {
    delete document.documentElement.dataset.theme;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage 不可用時主題仍生效，只是不記憶。
  }
  window.dispatchEvent(new CustomEvent<ThemeMode>(EVENT_NAME, { detail: mode }));
}

/** 目前主題；跨元件同步（圖表換色、圖示切換都靠它）。 */
export function useThemeMode(): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    setMode(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    const onChange = (event: Event) => {
      setMode((event as CustomEvent<ThemeMode>).detail);
    };
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);

  return mode;
}

/** 深/淺色切換鈕，沿用 header 圖示鈕的材質語言。 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const mode = useThemeMode();
  const next: ThemeMode = mode === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      title={mode === "dark" ? "切換為淺色模式" : "切換為深色模式"}
      aria-label={mode === "dark" ? "切換為淺色模式" : "切換為深色模式"}
      className={`surface lift inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-300 hover:text-ember ${className}`}
    >
      {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
