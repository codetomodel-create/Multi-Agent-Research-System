"use client";

import { useSyncExternalStore } from "react";

export const THEMES = ["dark", "light", "solarized"];
export const THEME_KEY = "mr_theme";

const FALLBACK_TOKENS = {
  bg: "#16162a",
  primary: "#a78bfa",
  secondary: "#f0abfc",
  accent: "#5eead4",
  danger: "#fb7185",
  dim: "#4b4b6a",
  star: "#c7d2fe",
};

/** Applies the theme to the document root; the token layer does the rest. */
export function applyTheme(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", THEMES.includes(theme) ? theme : "dark");
}

/**
 * Reads the 3D bridge tokens for the active theme.
 * These are hex mirrors of the semantic ramp, declared in the same token layer,
 * so the canvas re-themes with the DOM and THREE.Color can parse them directly.
 */
export function readSceneTokens() {
  if (typeof window === "undefined") return FALLBACK_TOKENS;

  const style = getComputedStyle(document.documentElement);
  const read = (name, key) => (style.getPropertyValue(name) || "").trim() || FALLBACK_TOKENS[key];

  return {
    bg: read("--three-bg", "bg"),
    primary: read("--three-primary", "primary"),
    secondary: read("--three-secondary", "secondary"),
    accent: read("--three-accent", "accent"),
    danger: read("--three-danger", "danger"),
    dim: read("--three-dim", "dim"),
    star: read("--three-star", "star"),
  };
}

// Cached per theme so useSyncExternalStore sees a stable object reference.
let tokenCache = { theme: null, tokens: FALLBACK_TOKENS };

function subscribeTheme(callback) {
  if (typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function snapshotTokens() {
  if (typeof window === "undefined") return FALLBACK_TOKENS;
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  if (tokenCache.theme !== theme) {
    tokenCache = { theme, tokens: readSceneTokens() };
  }
  return tokenCache.tokens;
}

const serverTokens = () => FALLBACK_TOKENS;

/** Live 3D token set, re-read whenever the theme attribute changes. */
export function useSceneTokens() {
  return useSyncExternalStore(subscribeTheme, snapshotTokens, serverTokens);
}
