"use client";

export function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function formatCost(usd) {
  if (!usd) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(n) {
  if (!n) return "0";
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString();
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export function maskKey(key) {
  if (!key) return "Not configured";
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** Splits report prose into paragraphs, tolerating single-newline formatting. */
export function paragraphs(text) {
  if (!text) return [];
  return String(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function bullets(text) {
  if (!text) return [];
  return String(text)
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
