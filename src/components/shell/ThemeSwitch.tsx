"use client";

import { useEffect, useState } from "react";
import { cn } from "../ui/cn";
import { THEME_STORAGE_KEY, THEMES, type Theme } from "./theme";

const LABEL: Record<Theme, string> = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice still holds for this page view.
  }
}

/** A three-way radio group: native radios give arrow-key navigation for free. */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    // Sync with the value the pre-paint script already applied.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(readStoredTheme());
  }, []);

  return (
    <fieldset className="flex items-center gap-2 text-xs text-muted">
      <legend className="sr-only">Color theme</legend>
      <div className="flex rounded-md border border-line p-0.5">
        {THEMES.map((t) => (
          <label
            key={t}
            className={cn(
              "cursor-pointer rounded px-2 py-0.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
              theme === t ? "bg-raised text-fg" : "hover:text-fg",
            )}
          >
            <input
              type="radio"
              name="theme"
              value={t}
              checked={theme === t}
              onChange={() => {
                setTheme(t);
                applyTheme(t);
              }}
              className="sr-only"
            />
            {LABEL[t]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
