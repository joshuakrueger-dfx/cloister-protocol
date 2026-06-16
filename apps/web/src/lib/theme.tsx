// Theme store for the Console. Two themes: the default dark "console" look and a
// light "finance" mode that feels familiar to controlling/treasury teams used to
// ERP and banking back-office UIs. Same external-store pattern as i18n: persisted,
// re-renders subscribers, and drives a `data-theme` attribute the CSS keys off of.

import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";
const KEY = "cloister.theme";

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

let theme: Theme = read();
function apply(t: Theme) {
  if (typeof document !== "undefined") document.documentElement.dataset.theme = t;
}
apply(theme);

const subs = new Set<() => void>();

export function getTheme(): Theme {
  return theme;
}

export function setTheme(t: Theme) {
  theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
  apply(t);
  subs.forEach((f) => f());
}

export function toggleTheme() {
  setTheme(theme === "dark" ? "light" : "dark");
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => theme,
  );
}
