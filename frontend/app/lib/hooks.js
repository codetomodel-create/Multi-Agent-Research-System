"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/* ---------------------------------------------------------------------------
   External-store helpers

   Everything the app reads from outside React — media queries, GPU capability,
   localStorage, the URL hash — is exposed through useSyncExternalStore rather
   than a mount effect. That keeps the static export hydrating against a stable
   server snapshot instead of writing state during the first commit.
--------------------------------------------------------------------------- */

const noopSubscribe = () => () => {};
const serverFalse = () => false;

function mediaStore(query) {
  return {
    subscribe(onChange) {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    get() {
      if (typeof window === "undefined") return false;
      return window.matchMedia(query).matches;
    },
  };
}

const reducedMotion = mediaStore("(prefers-reduced-motion: reduce)");
const smallScreen = mediaStore("(max-width: 860px)");
const coarsePointer = mediaStore("(pointer: coarse)");

export function usePrefersReducedMotion() {
  return useSyncExternalStore(reducedMotion.subscribe, reducedMotion.get, serverFalse);
}

export function useIsSmallScreen() {
  return useSyncExternalStore(smallScreen.subscribe, smallScreen.get, serverFalse);
}

export function useIsTouch() {
  return useSyncExternalStore(coarsePointer.subscribe, coarsePointer.get, serverFalse);
}

/* ---------------------------------------------------------------------------
   WebGL capability
--------------------------------------------------------------------------- */

let webglCache = null;

export function detectWebGL() {
  if (webglCache !== null) return webglCache;
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    webglCache = Boolean(gl);
    // Free the probe context immediately; browsers cap the number of live ones.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

export function useHasWebGL() {
  return useSyncExternalStore(noopSubscribe, detectWebGL, serverFalse);
}

/* ---------------------------------------------------------------------------
   localStorage-backed state

   Snapshots are cached per key so useSyncExternalStore sees a stable reference
   for object values; writing through `set` updates the cache and notifies every
   hook bound to that key.
--------------------------------------------------------------------------- */

const storeCache = new Map();
const storeSubs = new Map();

function subscribeKey(key, callback) {
  if (!storeSubs.has(key)) storeSubs.set(key, new Set());
  storeSubs.get(key).add(callback);

  const onStorage = (e) => {
    if (e.key !== key) return;
    storeCache.delete(key);
    callback();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  return () => {
    storeSubs.get(key)?.delete(callback);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

function snapshotKey(key, fallback) {
  if (storeCache.has(key)) return storeCache.get(key);
  let value = fallback;
  try {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(key);
    if (raw !== null) value = JSON.parse(raw);
  } catch {
    value = fallback;
  }
  storeCache.set(key, value);
  return value;
}

export function readStored(key, fallback) {
  return snapshotKey(key, fallback);
}

export function writeStored(key, value) {
  storeCache.set(key, value);
  try {
    if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or quota — the value still applies for this session */
  }
  storeSubs.get(key)?.forEach((cb) => cb());
}

export function usePersistentState(key, fallback) {
  const value = useSyncExternalStore(
    useCallback((cb) => subscribeKey(key, cb), [key]),
    useCallback(() => snapshotKey(key, fallback), [key, fallback]),
    useCallback(() => fallback, [fallback]),
  );

  const set = useCallback(
    (next) => {
      const resolved = typeof next === "function" ? next(snapshotKey(key, fallback)) : next;
      writeStored(key, resolved);
    },
    [key, fallback],
  );

  return [value, set];
}

/* ---------------------------------------------------------------------------
   URL hash — the shareable deep link (#run=<id>&tab=<tab>)
--------------------------------------------------------------------------- */

const EMPTY_HASH = { run: null, tab: null };
let hashCache = { raw: null, value: EMPTY_HASH };

function subscribeHash(callback) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function snapshotHash() {
  if (typeof window === "undefined") return EMPTY_HASH;
  const raw = window.location.hash;
  if (hashCache.raw !== raw) {
    const params = new URLSearchParams(raw.replace(/^#/, ""));
    hashCache = { raw, value: { run: params.get("run"), tab: params.get("tab") } };
  }
  return hashCache.value;
}

const serverHash = () => EMPTY_HASH;

export function useHashParams() {
  return useSyncExternalStore(subscribeHash, snapshotHash, serverHash);
}

/** True when the URL carries `?perf=1`; opts a production build into the HUD. */
export function usePerfFlag() {
  return useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get("perf") === "1",
    serverFalse,
  );
}

/** True when the URL carries `?demo=1`; presenter mode for the LinkedIn script. */
export function useDemoFlag() {
  return useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get("demo") === "1",
    serverFalse,
  );
}

export function writeHash(run, tab) {
  if (typeof window === "undefined" || !run) return;
  const next = `#run=${encodeURIComponent(run)}&tab=${encodeURIComponent(tab)}`;
  if (window.location.hash !== next) {
    window.history.replaceState(null, "", next);
    hashCache = { raw: next, value: { run, tab } };
  }
}

/* ---------------------------------------------------------------------------
   Misc
--------------------------------------------------------------------------- */

export function useDebounced(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Traps Tab inside a container and restores focus to the opener on unmount. */
export function useFocusTrap(active) {
  const ref = useRef(null);

  useEffect(() => {
    if (!active || !ref.current) return undefined;
    const root = ref.current;
    const opener = document.activeElement;
    const selector =
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

    const focusables = () =>
      Array.from(root.querySelectorAll(selector)).filter((el) => el.offsetParent !== null);
    focusables()[0]?.focus();

    const onKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [active]);

  return ref;
}
