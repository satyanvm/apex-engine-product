"use client";

import { Moon, Sun } from "lucide-react";

export const themeScript = `try{var t=localStorage.getItem("apex-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const current =
      root.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("apex-theme", next);
    } catch {
      // The toggle still applies for this page view.
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark"
      className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:text-ink"
    >
      <Sun aria-hidden className="icon-sun size-4" />
      <Moon aria-hidden className="icon-moon size-4" />
    </button>
  );
}
