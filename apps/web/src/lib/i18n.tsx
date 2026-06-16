// Lightweight i18n for the Console. Inline translator t("English","Deutsch")
// with an English fallback, a persisted language, and a tiny external store so a
// language switch re-renders subscribed components. No key management — the
// English string IS the source, the German is supplied at the call site.

import { useSyncExternalStore } from "react";

export type Lang = "en" | "de";
const KEY = "cloister.lang";

function read(): Lang {
  try {
    return localStorage.getItem(KEY) === "de" ? "de" : "en";
  } catch {
    return "en";
  }
}

let lang: Lang = read();
if (typeof document !== "undefined") document.documentElement.lang = lang;

const subs = new Set<() => void>();

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") document.documentElement.lang = l;
  subs.forEach((f) => f());
}

/** Inline translator. Reads the current language at call time. */
export function t(en: string, de: string): string {
  return lang === "de" ? de : en;
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => lang,
  );
}

/** Subscribe + return the translator. Usage: const tr = useT(); tr("Save","Speichern"). */
export function useT() {
  useLang();
  return t;
}
