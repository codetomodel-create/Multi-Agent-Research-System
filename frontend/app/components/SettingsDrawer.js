"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Check, Key, Loader2, Search, Settings2, X } from "lucide-react";

import { FALLBACK_MODELS, PROVIDERS, api } from "../lib/api";
import { maskKey } from "../lib/format";
import { useDebounced, useFocusTrap } from "../lib/hooks";

function ModelPicker({ id, provider, apiKey, value, onChange }) {
  const [fetched, setFetched] = useState({ provider: null, key: null, models: null });
  const [search, setSearch] = useState("");
  const debouncedKey = useDebounced(apiKey, 600);

  // Ollama is reachable without a key; every other provider needs one before a
  // live list is possible, so the built-in list stands in until then.
  const canFetch = provider === "ollama" || Boolean(debouncedKey);
  const isCurrent = fetched.provider === provider && fetched.key === debouncedKey;
  const loading = canFetch && !isCurrent;
  const models = canFetch && isCurrent ? fetched.models : null;

  useEffect(() => {
    if (!canFetch) return undefined;
    const controller = new AbortController();
    api
      .models({ provider, api_key: debouncedKey || undefined }, controller.signal)
      .then((data) =>
        setFetched({
          provider,
          key: debouncedKey,
          models: data.models?.map((m) => m.id || m.name).filter(Boolean) ?? [],
        }),
      )
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setFetched({ provider, key: debouncedKey, models: null });
      });
    return () => controller.abort();
  }, [provider, debouncedKey, canFetch]);

  const options = models?.length ? models : FALLBACK_MODELS[provider] ?? [];
  const filtered = search
    ? options.filter((m) => m.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div className="field">
      <label htmlFor={id}>Model</label>
      {options.length > 8 ? (
        <div className="row" style={{ gap: "var(--sp-1)" }}>
          <Search size={14} aria-hidden="true" />
          <input
            className="input"
            type="search"
            value={search}
            placeholder="Filter models…"
            aria-label="Filter models"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      ) : null}
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {!filtered.includes(value) && value ? <option value={value}>{value} (custom)</option> : null}
        {filtered.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <input
        className="input"
        type="text"
        value={value}
        aria-label="Custom model name"
        placeholder="…or type a model name"
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="hint">
        {loading ? "Fetching models…" : models?.length ? `${models.length} models from ${provider}` : "Using the built-in list"}
      </span>
    </div>
  );
}

function TierSection({ tier, title, description, settings, onChange }) {
  const [health, setHealth] = useState(null);
  const [testing, setTesting] = useState(false);

  const test = useCallback(async () => {
    setTesting(true);
    try {
      const result = await api.testProvider({
        provider: settings.provider,
        api_key: settings.apiKey || undefined,
      });
      setHealth(result);
    } catch (err) {
      setHealth({ reachable: false, latency_ms: 0, model_count: 0, detail: err.message });
    } finally {
      setTesting(false);
    }
  }, [settings.provider, settings.apiKey]);

  return (
    <section>
      <h3 style={{ marginBottom: "var(--sp-1)" }}>{title}</h3>
      <p className="hint" style={{ marginBottom: "var(--sp-4)" }}>
        {description}
      </p>

      <div className="field" style={{ marginBottom: "var(--sp-4)" }}>
        <label htmlFor={`${tier}-provider`}>Provider</label>
        <select
          id={`${tier}-provider`}
          className="input"
          value={settings.provider}
          onChange={(e) => onChange({ ...settings, provider: e.target.value })}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: "var(--sp-4)" }}>
        <ModelPicker
          id={`${tier}-model`}
          provider={settings.provider}
          apiKey={settings.apiKey}
          value={settings.model}
          onChange={(model) => onChange({ ...settings, model })}
        />
      </div>

      <div className="field">
        <label htmlFor={`${tier}-key`}>
          <Key size={14} aria-hidden="true" /> API key
        </label>
        <input
          id={`${tier}-key`}
          className="input"
          type="password"
          autoComplete="off"
          value={settings.apiKey}
          placeholder={
            settings.provider === "bedrock"
              ? "ACCESS_KEY:SECRET_KEY:REGION[:SESSION_TOKEN]"
              : "Paste provider API key"
          }
          onChange={(e) => onChange({ ...settings, apiKey: e.target.value })}
        />
        <span className="hint">
          Stored in this browser only · currently {maskKey(settings.apiKey)}
        </span>
      </div>

      <div className="row" style={{ marginTop: "var(--sp-3)" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={test} disabled={testing}>
          {testing ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Activity size={14} aria-hidden="true" />}
          Test connection
        </button>
        {health ? (
          <span className={`badge ${health.reachable ? "success" : "failed"}`}>
            {health.reachable ? `${health.latency_ms}ms · ${health.model_count} models` : "unreachable"}
          </span>
        ) : null}
      </div>
      {health && !health.reachable ? (
        <p className="hint error" role="status" style={{ marginTop: "var(--sp-2)" }}>
          {health.detail}
        </p>
      ) : null}
    </section>
  );
}

export default function SettingsDrawer({ open, settings, onChange, onClose, onSave, saving }) {
  const trapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="overlay-scrim" onClick={onClose} role="presentation" />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Model and provider settings"
        ref={trapRef}
      >
        <header className="drawer-head">
          <Settings2 size={18} aria-hidden="true" />
          <h2 style={{ fontSize: "var(--t-lg)" }}>Settings</h2>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close settings">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="drawer-body">
          <TierSection
            tier="light"
            title="Light tier"
            description="Runs the four parallel research agents: general, competitor, pricing and trends."
            settings={settings.light}
            onChange={(next) => onChange({ ...settings, light: next })}
          />
          <TierSection
            tier="heavy"
            title="Heavy tier"
            description="Runs the coordinator, the executive writer and the fact-checking audit."
            settings={settings.heavy}
            onChange={(next) => onChange({ ...settings, heavy: next })}
          />
        </div>

        <footer className="drawer-foot">
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
            Save settings
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </footer>
      </aside>
    </>
  );
}
