"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from "react";
import { 
  Compass, Settings, Layers, FileText, Terminal, Play, RefreshCw, Eye, Download,
  CheckCircle, AlertTriangle, Clock, Key, Sliders, TrendingUp, Award, Activity,
  History, FileCode, MapPin, Briefcase, Sun, Moon, Palette, XCircle, RotateCw,
  PlayCircle, Trash2, Copy, Loader2, Zap, Globe
} from "lucide-react";

// Lazy-load components so they don't block initial render
const AgentOrb = lazy(() => import("./components/AgentOrb"));
import StatsCard3D from "./components/StatsCard3D";

const API_BASE = typeof window !== "undefined"
  ? (window.location.port === "3000" || window.location.port === "3001" ? "http://localhost:8000" : window.location.origin)
  : "http://localhost:8000";

// Fallback model lists (used when dynamic fetch fails or provider has no API)
const FALLBACK_MODELS = {
  ollama: ["llama3.1:8b", "llama3:8b", "mistral", "gemma2", "qwen2", "phi3"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"],
  deepseek: ["deepseek-chat", "deepseek-coder"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  qwen: ["qwen-max", "qwen-plus", "qwen-turbo"],
  bedrock: [
    "anthropic.claude-3-5-sonnet-20240620-v1:0",
    "anthropic.claude-3-sonnet-20240229-v1:0",
    "anthropic.claude-3-haiku-20240307-v1:0",
    "meta.llama3-70b-instruct-v1:0",
    "meta.llama3-8b-instruct-v1:0"
  ]
};

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sessionId, setSessionId] = useState("");
  const [theme, setTheme] = useState("dark");
  
  const changeTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem("mr_theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };
  
  // LocalStorage Configuration State
  const [lightProviderInput, setLightProviderInput] = useState("ollama");
  const [lightModelInput, setLightModelInput] = useState("llama3.1:8b");
  const [lightApiKeyInput, setLightApiKeyInput] = useState("");
  
  const [heavyProviderInput, setHeavyProviderInput] = useState("ollama");
  const [heavyModelInput, setHeavyModelInput] = useState("llama3.1:8b");
  const [heavyApiKeyInput, setHeavyApiKeyInput] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  
  // Dynamic model lists (fetched from provider APIs)
  const [lightDynamicModels, setLightDynamicModels] = useState(null);
  const [heavyDynamicModels, setHeavyDynamicModels] = useState(null);
  const [lightModelLoading, setLightModelLoading] = useState(false);
  const [heavyModelLoading, setHeavyModelLoading] = useState(false);
  
  // Dynamic config active values
  const [activeConfig, setActiveConfig] = useState({
    api_key_configured: false,
    light_provider: "ollama",
    light_model: "llama3.1:8b",
    light_api_key_masked: "",
    heavy_provider: "ollama",
    heavy_model: "llama3.1:8b",
    heavy_api_key_masked: ""
  });

  const [runs, setRuns] = useState([]);
  
  // Input Form States
  const [businessIdeaInput, setBusinessIdeaInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [customConfigEnabled, setCustomConfigEnabled] = useState(false);
  const [customApiKey, setCustomApiKey] = useState("");
  
  const [activeRunId, setActiveRunId] = useState(null);
  const [runProgress, setRunProgress] = useState(null);
  const [runReport, setRunReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  
  const [viewingReportId, setViewingReportId] = useState(null);
  const [reportMarkdown, setReportMarkdown] = useState("");
  const [reportTab, setReportTab] = useState("summary");
  
  // Research config states
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  
  const pollIntervalRef = useRef(null);
  const logEndRef = useRef(null);
  const sseRef = useRef(null);

  // ── Dynamic Model Fetching ────────────────────────────────────────────────
  const fetchModelsForProvider = useCallback(async (provider, apiKey, setModels, setLoading) => {
    if (!apiKey && provider !== "ollama") {
      setModels(null); // Fall back to static list
      return;
    }
    setLoading(true);
    try {
      const body = { provider, api_key: apiKey || undefined };
      const res = await fetch(`${API_BASE}/api/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
      } else {
        setModels(null); // Use fallback
      }
    } catch {
      setModels(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch models when provider or API key changes
  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchModelsForProvider(lightProviderInput, lightApiKeyInput, setLightDynamicModels, setLightModelLoading);
    }, 500);
    return () => clearTimeout(debounce);
  }, [lightProviderInput, lightApiKeyInput, fetchModelsForProvider]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchModelsForProvider(heavyProviderInput, heavyApiKeyInput, setHeavyDynamicModels, setHeavyModelLoading);
    }, 500);
    return () => clearTimeout(debounce);
  }, [heavyProviderInput, heavyApiKeyInput, fetchModelsForProvider]);

  // Helper: get model options (dynamic > fallback)
  const getModelOptions = (provider, dynamicModels) => {
    if (dynamicModels && dynamicModels.length > 0) {
      return dynamicModels.map(m => m.id || m.name);
    }
    return FALLBACK_MODELS[provider] || [];
  };

  const syncConfigToBackend = async (lightProv, lightModel, lightKey, heavyProv, heavyModel, heavyKey, currentSessId = sessionId) => {
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Session-ID": currentSessId
        },
        body: JSON.stringify({
          light_provider: lightProv,
          light_model: lightModel,
          light_api_key: lightKey,
          heavy_provider: heavyProv,
          heavy_model: heavyModel,
          heavy_api_key: heavyKey
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        setSaveStatus(errData.detail || "Failed to sync configuration with server.");
        setTimeout(() => setSaveStatus(""), 4000);
      }
    } catch (err) {
      setSaveStatus("Offline: saved locally, but server is unreachable.");
      setTimeout(() => setSaveStatus(""), 4000);
    }
  };

  const fetchRuns = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/runs`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data);
      }
    } catch (err) {
      console.error("Failed to fetch runs", err);
    }
  };

  // Sync Settings from LocalStorage on mount
  useEffect(() => {
    // Resolve theme on mount
    const savedTheme = localStorage.getItem("mr_theme") || "dark";
    setTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);

    // Generate or fetch session ID
    let sessId = sessionStorage.getItem("mr_session_id");
    if (!sessId) {
      sessId = "sess_" + Math.random().toString(36).substring(2, 7);
      sessionStorage.setItem("mr_session_id", sessId);
    }
    setSessionId(sessId);

    // Read localstorage
    const localLightProv = localStorage.getItem("mr_light_provider") || "ollama";
    const localLightModel = localStorage.getItem("mr_light_model") || "llama3.1:8b";
    const localLightKey = localStorage.getItem("mr_light_api_key") || "";
    
    const localHeavyProv = localStorage.getItem("mr_heavy_provider") || "ollama";
    const localHeavyModel = localStorage.getItem("mr_heavy_model") || "llama3.1:8b";
    const localHeavyKey = localStorage.getItem("mr_heavy_api_key") || "";
    
    setLightProviderInput(localLightProv);
    setLightModelInput(localLightModel);
    setLightApiKeyInput(localLightKey);
    
    setHeavyProviderInput(localHeavyProv);
    setHeavyModelInput(localHeavyModel);
    setHeavyApiKeyInput(localHeavyKey);
    
    const hasKey = localLightKey.length > 0 || localHeavyKey.length > 0;
    const maskedLight = localLightKey.length > 0 ? `${localLightKey.substring(0, 6)}...${localLightKey.substring(localLightKey.length - 4)}` : "Not Configured";
    const maskedHeavy = localHeavyKey.length > 0 ? `${localHeavyKey.substring(0, 6)}...${localHeavyKey.substring(localHeavyKey.length - 4)}` : "Not Configured";
    
    const initialCfg = {
      api_key_configured: hasKey,
      light_provider: localLightProv,
      light_model: localLightModel,
      light_api_key_masked: maskedLight,
      heavy_provider: localHeavyProv,
      heavy_model: localHeavyModel,
      heavy_api_key_masked: maskedHeavy
    };
    setActiveConfig(initialCfg);
    
    // Sync settings to backend config.json as backup
    syncConfigToBackend(localLightProv, localLightModel, localLightKey, localHeavyProv, localHeavyModel, localHeavyKey, sessId);
    
    fetchRuns();
    
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    };
  }, []);

  // Scroll to bottom of logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [runProgress]);

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setSaveStatus("Saving...");
    
    // Save to LocalStorage
    localStorage.setItem("mr_light_provider", lightProviderInput);
    localStorage.setItem("mr_light_model", lightModelInput);
    localStorage.setItem("mr_light_api_key", lightApiKeyInput);
    localStorage.setItem("mr_heavy_provider", heavyProviderInput);
    localStorage.setItem("mr_heavy_model", heavyModelInput);
    localStorage.setItem("mr_heavy_api_key", heavyApiKeyInput);
    
    const hasKey = lightApiKeyInput.length > 0 || heavyApiKeyInput.length > 0;
    const maskedLight = lightApiKeyInput.length > 0 ? `${lightApiKeyInput.substring(0, 6)}...${lightApiKeyInput.substring(lightApiKeyInput.length - 4)}` : "Not Configured";
    const maskedHeavy = heavyApiKeyInput.length > 0 ? `${heavyApiKeyInput.substring(0, 6)}...${heavyApiKeyInput.substring(heavyApiKeyInput.length - 4)}` : "Not Configured";
    
    setActiveConfig({
      api_key_configured: hasKey,
      light_provider: lightProviderInput,
      light_model: lightModelInput,
      light_api_key_masked: maskedLight,
      heavy_provider: heavyProviderInput,
      heavy_model: heavyModelInput,
      heavy_api_key_masked: maskedHeavy
    });
    
    setSaveStatus("Configuration saved to browser!");
    setTimeout(() => setSaveStatus(""), 3000);
    
    // Sync backend as backup
    await syncConfigToBackend(
      lightProviderInput, lightModelInput, lightApiKeyInput, 
      heavyProviderInput, heavyModelInput, heavyApiKeyInput, sessionId
    );
  };

  // ── SSE-powered progress streaming ────────────────────────────────────────
  const connectSSE = useCallback((taskId) => {
    // Close any existing SSE connection
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    
    const es = new EventSource(`${API_BASE}/api/runs/${taskId}/stream`);
    sseRef.current = es;

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        if (payload.type === "snapshot") {
          // Full state snapshot — initial catch-up
          setRunProgress(payload.data);
        } else if (payload.type === "progress") {
          // Incremental update
          setRunProgress(prev => {
            if (!prev) return { status: payload.status, logs: [payload.entry] };
            return {
              ...prev,
              status: payload.status,
              logs: [...prev.logs, payload.entry],
            };
          });
        } else if (payload.type === "report_ready" || ["success", "failed", "cancelled"].includes(payload.status)) {
          fetchRuns();
          if (payload.status === "success" || payload.type === "report_ready") {
            fetchReport(taskId);
          }
          es.close();
          sseRef.current = null;
        }
      } catch (err) {
        console.error("SSE parse error", err);
      }
    };

    es.onerror = () => {
      // SSE connection dropped — fall back to polling
      es.close();
      sseRef.current = null;
      startPollingProgress(taskId);
    };
  }, []);

  const handleLaunchResearch = async (e) => {
    e.preventDefault();
    if (!businessIdeaInput.trim() || !locationInput.trim()) return;
    
    setErrorMsg("");
    setActiveRunId(null);
    setRunProgress(null);
    setRunReport(null);
    
    // Resolve dynamic configs from localstorage
    const localLightProv = localStorage.getItem("mr_light_provider") || activeConfig.light_provider;
    const localLightModel = localStorage.getItem("mr_light_model") || activeConfig.light_model;
    const localLightKey = localStorage.getItem("mr_light_api_key") || "";
    
    const localHeavyProv = localStorage.getItem("mr_heavy_provider") || activeConfig.heavy_provider;
    const localHeavyModel = localStorage.getItem("mr_heavy_model") || activeConfig.heavy_model;
    const localHeavyKey = localStorage.getItem("mr_heavy_api_key") || "";
    
    const payload = {
      idea: businessIdeaInput,
      location: locationInput,
      enable_web_search: enableWebSearch,
      ui_model_config: {
        light_task: {
          provider: localLightProv,
          model: localLightModel,
          api_key: customConfigEnabled && customApiKey ? customApiKey : localLightKey
        },
        heavy_task: {
          provider: localHeavyProv,
          model: localHeavyModel,
          api_key: customConfigEnabled && customApiKey ? customApiKey : localHeavyKey
        }
      }
    };
    
    try {
      const res = await fetch(`${API_BASE}/research`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Session-ID": sessionId
        },
        body: JSON.stringify(payload),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setActiveRunId(data.task_id);
        setBusinessIdeaInput("");
        setLocationInput("");
        setCustomApiKey("");
        setCustomConfigEnabled(false);
        setActiveTab("tracker");
        // Try SSE first, fall back to polling
        connectSSE(data.task_id);
        fetchRuns();
      } else {
        setErrorMsg(data.detail || "Failed to launch research task.");
      }
    } catch (err) {
      setErrorMsg("Failed to connect to backend server. Make sure it is running on port 8000.");
    }
  };

  // Polling fallback (used if SSE fails)
  const startPollingProgress = (taskId) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollProgress(taskId);
    pollIntervalRef.current = setInterval(() => { pollProgress(taskId); }, 1500);
  };

  const pollProgress = async (taskId) => {
    try {
      const res = await fetch(`${API_BASE}/api/runs/${taskId}/progress`);
      if (!res.ok) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        return;
      }
      const data = await res.json();
      setRunProgress(data);
      
      if (data.status === "success" || data.status === "failed" || data.status === "cancelled") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        fetchRuns();
        if (data.status === "success") { fetchReport(taskId); }
      }
    } catch (err) {
      console.error("Error polling progress", err);
    }
  };

  const handleCancelRun = async (taskId) => {
    try {
      const res = await fetch(`${API_BASE}/api/runs/${taskId}/cancel`, { method: "POST" });
      if (res.ok) { pollProgress(taskId); }
    } catch (err) {
      console.error("Failed to cancel task", err);
    }
  };

  const handleDeleteRun = async (taskId) => {
    if (!window.confirm("Are you sure you want to delete this research?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/runs/${taskId}`, { method: "DELETE" });
      if (res.ok) { fetchRuns(); }
    } catch (err) {
      console.error("Failed to delete task", err);
    }
  };

  const handleRerun = (taskId) => {
    const topicToRerun = runs.find(r => r.task_id === taskId)?.topic || "Market Research";
    setBusinessIdeaInput(topicToRerun);
    setLocationInput("");
    triggerResearch(topicToRerun);
  };
  
  const triggerResearch = async (topicStr) => {
    setRunReport(null);
    setRunProgress(null);
    setErrorMsg("");
    setActiveTab("tracker");
    
    try {
      const payload = { idea: topicStr, location: "", enable_web_search: enableWebSearch };
      const res = await fetch(`${API_BASE}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-id": sessionId },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const err = await res.json();
        setErrorMsg(err.detail || "Failed to start research");
        setActiveTab("dashboard");
        return;
      }
      
      const data = await res.json();
      setActiveRunId(data.task_id);
      connectSSE(data.task_id);
      fetchRuns();
    } catch (err) {
      setErrorMsg("Failed to connect to backend server.");
      setActiveTab("dashboard");
    }
  };

  const fetchReport = async (taskId) => {
    try {
      const res = await fetch(`${API_BASE}/api/runs/${taskId}/report`);
      if (res.ok) {
        const data = await res.json();
        setRunReport(data);
        setViewingReportId(taskId);
        setActiveTab("report");
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Something went wrong while retrieving the report. Please try again.");
        setActiveTab("dashboard");
      }
    } catch (err) {
      setErrorMsg("Failed to connect to backend server. Make sure it is running on port 8000.");
      setActiveTab("dashboard");
    }
  };

  const handleViewReport = (taskId) => {
    setViewingReportId(taskId);
    setActiveRunId(taskId);
    setRunReport(null);
    setRunProgress(null);
    setActiveTab("report");
    
    const runObj = runs.find(r => r.task_id === taskId);
    if (runObj && runObj.status === "success") {
      fetchReport(taskId);
    } else {
      connectSSE(taskId);
      setActiveTab("tracker");
    }
  };

  const handleDownloadMarkdown = () => {
    if (!runReport) return;
    
    const md = `# Market Research Report: ${runReport.topic}
## ${runReport.title}

### Executive Summary
${runReport.executive_summary}

### Market Overview & Trends
${runReport.market_overview}

### Competitor Landscape
${runReport.competitor_analysis}

### SWOT Analysis
${runReport.swot_analysis}

### Strategic Recommendations
${runReport.strategic_recommendations}

---
### Critique & Refinement Log
${runReport.critique_notes}
`;

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `market_research_${runReport.topic.toLowerCase().replace(/[^a-z0-9]/g, "_")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getActiveStageIndex = () => {
    if (!runProgress || !runProgress.logs || runProgress.logs.length === 0) return 0;
    const lastLog = runProgress.logs[runProgress.logs.length - 1];
    
    if (runProgress.status === "success") return 4;
    
    switch (lastLog.stage) {
      case "Queue": return 0;
      case "Researching": return 1;
      case "Critique": return 2;
      case "Refining": return 3;
      case "Polishing": return 4;
      default: return 1;
    }
  };

  // Helper to render a model dropdown with dynamic/fallback options
  const renderModelSelect = (provider, currentModel, setModel, dynamicModels, isLoading) => {
    const options = getModelOptions(provider, dynamicModels);
    const isDynamic = dynamicModels && dynamicModels.length > 0;
    
    return (
      <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
        <div style={{ position: 'relative' }}>
          <select 
            className="input-field"
            value={options.includes(currentModel) ? currentModel : "custom"}
            onChange={(e) => {
              if (e.target.value !== "custom") { setModel(e.target.value); }
              else { setModel(""); }
            }}
          >
            {options.map(model => (
              <option key={model} value={model}>{model}</option>
            ))}
            <option value="custom">Custom Model...</option>
          </select>
          {isLoading && (
            <div style={{ position: 'absolute', right: '40px', top: '50%', transform: 'translateY(-50%)' }}>
              <Loader2 size={16} className="spin" style={{ color: 'var(--primary)' }} />
            </div>
          )}
        </div>
        {isDynamic && (
          <span className="input-hint" style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>
            <Zap size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> {options.length} models fetched live from {provider}
          </span>
        )}
        {(!options.includes(currentModel) || currentModel === "") && (
          <input 
            type="text" 
            className="input-field" 
            placeholder="Type custom model name..."
            value={currentModel}
            onChange={(e) => setModel(e.target.value)}
            required
          />
        )}
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar glass-panel">
        <div className="logo-container">
          <Compass className="logo-icon" />
          <div className="logo-text">
            <h2>MarketAgent</h2>
            <span>Intelligence System</span>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => { setActiveTab("dashboard"); fetchRuns(); }}
          >
            <History size={18} />
            <span>Dashboard</span>
          </button>
          
          <button 
            className={`nav-item ${activeTab === "new_research" ? "active" : ""}`}
            onClick={() => { setActiveTab("new_research"); setErrorMsg(""); }}
          >
            <Play size={18} />
            <span>New Research</span>
          </button>
          
          <button 
            className={`nav-item ${activeTab === "config" ? "active" : ""}`}
            onClick={() => { setActiveTab("config"); }}
          >
            <Settings size={18} />
            <span>LLM Providers</span>
          </button>
        </nav>
        
        <div className="sidebar-footer" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div className="theme-switcher">
            <button type="button" className={`theme-btn ${theme === "dark" ? "active" : ""}`} onClick={() => changeTheme("dark")} title="Dark Theme">
              <Moon size={16} />
            </button>
            <button type="button" className={`theme-btn ${theme === "light" ? "active" : ""}`} onClick={() => changeTheme("light")} title="Light Theme">
              <Sun size={16} />
            </button>
            <button type="button" className={`theme-btn ${theme === "solarized" ? "active" : ""}`} onClick={() => changeTheme("solarized")} title="Solarized Theme">
              <Palette size={16} />
            </button>
          </div>
          <div className="status-badge">
            <span className={`status-dot ${activeConfig.api_key_configured ? "active" : ""}`}></span>
            <span className="status-label">
              API Keys: {activeConfig.api_key_configured ? "Active" : "Disconnected"}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="main-header glass-panel">
          <div className="header-title">
            <h1>
              {activeTab === "dashboard" && "Research Command Center"}
              {activeTab === "new_research" && "Configure Market Research"}
              {activeTab === "config" && "Provider Configuration"}
              {activeTab === "tracker" && "Multi-Agent Routing Progress"}
              {activeTab === "report" && "Structured Intelligence Report"}
            </h1>
            <p>
              {activeTab === "dashboard" && "Launch and audit dynamic config-driven agent workflows."}
              {activeTab === "new_research" && "Route tasks intelligently between Light and Heavy models."}
              {activeTab === "config" && "Manage API credentials and model configurations."}
              {activeTab === "tracker" && `Agent Run: ${activeRunId}`}
              {activeTab === "report" && `Intel generated for: ${runReport?.topic}`}
            </p>
          </div>
          
          <div className="header-actions">
            <button className="btn-secondary" onClick={() => { fetchRuns(); }}>
              <RefreshCw size={16} />
              <span>Sync</span>
            </button>
          </div>
        </header>

        <div className="content-viewport">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="tab-dashboard animate-fade-in">
              <div className="stats-grid">
                <StatsCard3D
                  icon={<Activity size={24} className="stat-icon-active" />}
                  value={runs.length}
                  label="Total Orchestrations"
                  glowColor="var(--primary)"
                />
                <StatsCard3D
                  icon={<CheckCircle size={24} className="stat-icon-success" />}
                  value={runs.filter(r => r.status === "success").length}
                  label="Completed Reports"
                  glowColor="var(--accent)"
                />
                <StatsCard3D
                  icon={<Clock size={24} className="stat-icon-pending" />}
                  value={runs.filter(r => r.status === "running").length}
                  label="Active Agents"
                  glowColor="var(--secondary)"
                />
              </div>
              
              <div className="dashboard-layout">
                <div className="history-section glass-panel">
                  <div className="section-header">
                    <History size={20} />
                    <h2>Research History</h2>
                  </div>
                  
                  {runs.length === 0 ? (
                    <div className="empty-state">
                      <Layers size={48} className="empty-icon" />
                      <h3>No runs recorded</h3>
                      <p>Create and run a new market research workflow to see logs here.</p>
                      <button className="btn-primary" onClick={() => setActiveTab("new_research")}>
                        <Play size={16} /> Get Started
                      </button>
                    </div>
                  ) : (
                    <div className="history-list">
                      {runs.map((run, idx) => (
                        <div key={run.task_id} className="history-row glass-card" style={{ animationDelay: `${idx * 60}ms` }}>
                          <div className="history-info">
                            <h4>{run.topic}</h4>
                            <span className="run-id">ID: {run.task_id.substring(0, 8)}...</span>
                            <span className="run-date">{new Date(run.created_at).toLocaleString()}</span>
                          </div>
                          
                          <div className="history-meta">
                            <span className="model-tag">L: {run.light_model}</span>
                            <span className="model-tag">H: {run.heavy_model}</span>
                          </div>
                          
                          <div className="history-actions">
                            <span className={`status-badge-inline ${run.status}`}>
                              {run.status === "success" && <CheckCircle size={12} />}
                              {run.status === "running" && <Activity size={12} className="spin" />}
                              {run.status === "failed" && <AlertTriangle size={12} />}
                              {run.status}
                            </span>
                            
                            <button className="btn-secondary btn-sm" onClick={() => handleViewReport(run.task_id)}>
                              {run.status === "success" ? <Eye size={14} /> : <Terminal size={14} />}
                              <span>{run.status === "success" ? "View Report" : "Logs"}</span>
                            </button>
                            
                            <button className="btn-secondary btn-sm" onClick={() => handleRerun(run.task_id)} title="Restart / Rerun">
                              <PlayCircle size={14} />
                              <span>Restart</span>
                            </button>
                            
                            <button 
                              className="btn-secondary btn-sm" 
                              style={{ color: '#ef4444', borderColor: '#ef4444', padding: '6px' }}
                              onClick={() => handleDeleteRun(run.task_id)}
                              title="Delete Research"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: NEW RESEARCH */}
          {activeTab === "new_research" && (
            <div className="tab-new-research glass-panel animate-fade-in">
              <form onSubmit={handleLaunchResearch} className="research-form">
                <h2>Create Market Intelligence Task</h2>
                <p className="form-description">
                  Input your target business concept and local market. The system will coordinate 
                  specialized Light and Heavy agents dynamically.
                </p>
                
                {errorMsg && (
                  <div className="alert-message error">
                    <AlertTriangle size={20} />
                    <div>
                      <strong>Error Launching:</strong> {errorMsg}
                    </div>
                  </div>
                )}
                
                <div className="grid-2">
                  <div className="form-group">
                    <label htmlFor="business_idea">
                      <Briefcase size={16} />
                      <span>Business Idea / Concept</span>
                    </label>
                    <input 
                      type="text" 
                      id="business_idea"
                      className="input-field"
                      placeholder="e.g. Specialty Coffee Shop"
                      value={businessIdeaInput}
                      onChange={(e) => setBusinessIdeaInput(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                    <input 
                      type="checkbox" 
                      id="enable-web-search"
                      checked={enableWebSearch} 
                      onChange={(e) => setEnableWebSearch(e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--accent-color)' }}
                    />
                    <label htmlFor="enable-web-search" style={{ margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Globe size={16} /> Enable Web Search (DuckDuckGo)
                    </label>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="location">
                      <MapPin size={16} />
                      <span>Target Location / Area</span>
                    </label>
                    <input 
                      type="text" 
                      id="location"
                      className="input-field"
                      placeholder="e.g. Brooklyn, NY"
                      value={locationInput}
                      onChange={(e) => setLocationInput(e.target.value)}
                      required
                    />
                  </div>
                </div>
                
                <div className="form-group-checkbox glass-card">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={customConfigEnabled}
                      onChange={(e) => setCustomConfigEnabled(e.target.checked)}
                    />
                    <span>Override API Key for this Task</span>
                  </label>
                  
                  {customConfigEnabled && (
                    <div className="checkbox-expanded animate-fade-in">
                      <div className="form-group">
                        <label>Dynamic API Key Override</label>
                        <input 
                          type="password" 
                          className="input-field" 
                          placeholder="Paste API Key Override (leaves default if empty)"
                          value={customApiKey}
                          onChange={(e) => setCustomApiKey(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
                
                <button type="submit" className="btn-primary btn-large">
                  <Play size={18} />
                  <span>Launch Agent Pipeline</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: CONFIG PANEL */}
          {activeTab === "config" && (
            <div className="tab-config glass-panel animate-fade-in">
              <form onSubmit={handleSaveConfig} className="config-form">
                <h2>Model Configuration Manager</h2>
                <p className="form-description">
                  Configure keys and models mapping. Models are fetched dynamically when an API key is provided.
                </p>
                
                {saveStatus && (
                  <div className={`alert-message ${saveStatus.includes("saved") ? "success" : "info"}`}>
                    {saveStatus.includes("saved") ? <CheckCircle size={20} /> : <Loader2 size={20} className="spin" />}
                    <span>{saveStatus}</span>
                  </div>
                )}
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px", marginBottom: "24px" }}>
                  {/* Light Task Block */}
                  <div className="glass-card" style={{ padding: "24px" }}>
                    <h3 style={{ marginBottom: "16px", color: "var(--primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Sliders size={18} />
                      <span>Light Model Configuration (Research, Competitors, Pricing, Trends)</span>
                    </h3>
                    
                    <div className="grid-2">
                      <div className="form-group">
                        <label>Provider</label>
                        <select 
                          className="input-field"
                          value={lightProviderInput}
                          onChange={(e) => setLightProviderInput(e.target.value)}
                        >
                          <option value="ollama">Ollama (Local)</option>
                          <option value="openai">OpenAI</option>
                          <option value="deepseek">DeepSeek</option>
                          <option value="gemini">Gemini</option>
                          <option value="qwen">Qwen</option>
                          <option value="bedrock">AWS Bedrock</option>
                          <option value="anthropic">Anthropic</option>
                        </select>
                      </div>
                      
                      <div className="form-group">
                        <label>Model Name</label>
                        {renderModelSelect(lightProviderInput, lightModelInput, setLightModelInput, lightDynamicModels, lightModelLoading)}
                      </div>
                    </div>
                    
                    <div className="form-group" style={{ marginTop: "12px" }}>
                      <label>
                        <Key size={16} />
                        <span>API Key Override (Optional)</span>
                      </label>
                      <input 
                        type="password" 
                        className="input-field"
                        placeholder={
                          lightProviderInput === "bedrock" ? "ACCESS_KEY:SECRET_KEY:REGION[:SESSION_TOKEN]" : 
                          activeConfig.light_api_key_masked && activeConfig.light_api_key_masked !== "Not Configured" ? `Currently: ${activeConfig.light_api_key_masked} (Enter to overwrite)` : "Paste Provider API Key"
                        }
                        value={lightApiKeyInput}
                        onChange={(e) => setLightApiKeyInput(e.target.value)}
                      />
                      <span className="input-hint">
                        {lightApiKeyInput ? "Models will auto-fetch from provider" : "Enter an API key to fetch available models dynamically"}
                      </span>
                    </div>
                  </div>
                  
                  {/* Heavy Task Block */}
                  <div className="glass-card" style={{ padding: "24px" }}>
                    <h3 style={{ marginBottom: "16px", color: "var(--secondary)", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Sliders size={18} />
                      <span>Heavy Model Configuration (Synthesis Writer, SWOT Fact Checker)</span>
                    </h3>
                    
                    <div className="grid-2">
                      <div className="form-group">
                        <label>Provider</label>
                        <select 
                          className="input-field"
                          value={heavyProviderInput}
                          onChange={(e) => setHeavyProviderInput(e.target.value)}
                        >
                          <option value="ollama">Ollama (Local)</option>
                          <option value="openai">OpenAI</option>
                          <option value="deepseek">DeepSeek</option>
                          <option value="gemini">Gemini</option>
                          <option value="qwen">Qwen</option>
                          <option value="bedrock">AWS Bedrock</option>
                          <option value="anthropic">Anthropic</option>
                        </select>
                      </div>
                      
                      <div className="form-group">
                        <label>Model Name</label>
                        {renderModelSelect(heavyProviderInput, heavyModelInput, setHeavyModelInput, heavyDynamicModels, heavyModelLoading)}
                      </div>
                    </div>
                    
                    <div className="form-group" style={{ marginTop: "12px" }}>
                      <label>
                        <Key size={16} />
                        <span>API Key Override (Optional)</span>
                      </label>
                      <input 
                        type="password" 
                        className="input-field"
                        placeholder={
                          heavyProviderInput === "bedrock" ? "ACCESS_KEY:SECRET_KEY:REGION[:SESSION_TOKEN]" : 
                          activeConfig.heavy_api_key_masked && activeConfig.heavy_api_key_masked !== "Not Configured" ? `Currently: ${activeConfig.heavy_api_key_masked} (Enter to overwrite)` : "Paste Provider API Key"
                        }
                        value={heavyApiKeyInput}
                        onChange={(e) => setHeavyApiKeyInput(e.target.value)}
                      />
                      <span className="input-hint">
                        {heavyApiKeyInput ? "Models will auto-fetch from provider" : "Enter an API key to fetch available models dynamically"}
                      </span>
                    </div>
                  </div>
                </div>
                
                <button type="submit" className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: "12px" }}>
                  <span>Save Configuration</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: TRACKER */}
          {activeTab === "tracker" && runProgress && (
            <div className="tab-tracker animate-fade-in">
              {/* 3D Agent Visualization */}
              <div className="glass-panel" style={{ padding: "16px", marginBottom: "16px" }}>
                <Suspense fallback={<div style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center" }}><Loader2 size={24} className="spin" /></div>}>
                  <AgentOrb activeStageIndex={getActiveStageIndex()} status={runProgress.status} />
                </Suspense>
              </div>

              <div className="tracker-header glass-panel">
                <div className="tracker-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3>Agent Workflow for: <span className="highlight">&quot;{runProgress.logs[0]?.message.split("'")[1] || "Research"}&quot;</span></h3>
                    <span>Status: <strong className={runProgress.status}>{runProgress.status.toUpperCase()}</strong></span>
                  </div>
                  
                  <div className="tracker-controls" style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-secondary" onClick={() => pollProgress(activeRunId)} title="Refresh Logs">
                      <RotateCw size={16} />
                      <span className="hide-mobile">Refresh</span>
                    </button>
                    
                    {runProgress.status === "running" ? (
                      <button 
                        className="btn-secondary" 
                        style={{ color: '#ef4444', borderColor: '#ef4444' }}
                        onClick={() => handleCancelRun(activeRunId)}
                        title="Cancel Research"
                      >
                        <XCircle size={16} />
                        <span className="hide-mobile">Cancel</span>
                      </button>
                    ) : (
                      <button className="btn-primary" onClick={() => handleRerun(activeRunId)} title="Rerun Research">
                        <PlayCircle size={16} />
                        <span className="hide-mobile">Rerun</span>
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="timeline-stepper">
                  {[
                    { label: "Queued", key: "Queue" },
                    { label: "Researching (Light)", key: "Researching" },
                    { label: "Critique (Heavy)", key: "Critique" },
                    { label: "Refining (Light)", key: "Refining" },
                    { label: "Polishing (Heavy)", key: "Polishing" }
                  ].map((step, idx) => {
                    const activeIndex = getActiveStageIndex();
                    const isCompleted = idx < activeIndex || runProgress.status === "success";
                    const isActive = idx === activeIndex && runProgress.status === "running";
                    
                    return (
                      <div key={step.key} className={`step-item ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""}`}>
                        <div className="step-circle">
                          {isCompleted ? <CheckCircle size={16} /> : <span>{idx + 1}</span>}
                        </div>
                        <div className="step-label">{step.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="tracker-logs glass-panel">
                <div className="logs-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Terminal size={18} />
                    <span>Execution Stream Logs</span>
                  </div>
                  <button 
                    className="btn-secondary btn-sm"
                    title="Copy Logs to Clipboard"
                    onClick={() => {
                      const logText = runProgress.logs.map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.stage}] ${l.message}`).join('\n');
                      navigator.clipboard.writeText(logText);
                    }}
                  >
                    <Copy size={14} />
                    <span>Copy</span>
                  </button>
                </div>
                <div className="logs-console">
                  {runProgress.logs.map((log, i) => (
                    <div key={i} className={`log-line ${log.status}`}>
                      <span className="log-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className={`log-stage ${log.stage.toLowerCase()}`}>{log.stage}</span>
                      <span className="log-message">{log.message}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: REPORT VIEWER */}
          {activeTab === "report" && runReport && (
            <div className="tab-report animate-fade-in">
              <div className="report-header glass-panel">
                <div className="report-title-section">
                  <h2>{runReport.title}</h2>
                  <div className="report-tags">
                    <span className="report-tag">Target: {runReport.topic}</span>
                    <span className="report-tag success">C-Suite Verified</span>
                  </div>
                </div>
                
                <div className="report-actions">
                  <button className="btn-secondary" onClick={handleDownloadMarkdown}>
                    <Download size={16} />
                    <span>Download Markdown</span>
                  </button>
                </div>
              </div>
              
              <div className="report-body">
                <div className="report-tabs">
                  <button 
                    className={`report-tab-btn ${reportTab === "summary" ? "active" : ""}`}
                    onClick={() => setReportTab("summary")}
                  >
                    <FileText size={16} /> Executive Summary
                  </button>
                  <button 
                    className={`report-tab-btn ${reportTab === "market" ? "active" : ""}`}
                    onClick={() => setReportTab("market")}
                  >
                    <TrendingUp size={16} /> Market & Competitors
                  </button>
                  <button 
                    className={`report-tab-btn ${reportTab === "swot" ? "active" : ""}`}
                    onClick={() => setReportTab("swot")}
                  >
                    <Award size={16} /> SWOT Analysis
                  </button>
                  <button 
                    className={`report-tab-btn ${reportTab === "critique" ? "active" : ""}`}
                    onClick={() => setReportTab("critique")}
                  >
                    <Sliders size={16} /> Critique & Refinements
                  </button>
                  <button 
                    className={`report-tab-btn ${reportTab === "raw" ? "active" : ""}`}
                    onClick={() => setReportTab("raw")}
                  >
                    <FileCode size={16} /> Raw JSON
                  </button>
                </div>
                
                <div className="report-pane glass-panel">
                  {reportTab === "summary" && (
                    <div className="pane-content">
                      <h3>Executive Summary</h3>
                      <div className="markdown-body">
                        {runReport.executive_summary.split("\n\n").map((para, idx) => (
                          <p key={idx}>{para}</p>
                        ))}
                      </div>
                      
                      <h3 style={{ marginTop: "24px" }}>Strategic Recommendations</h3>
                      <div className="markdown-body">
                        <ul>
                          {runReport.strategic_recommendations.split("\n").map((rec, idx) => {
                            if (!rec.trim()) return null;
                            return <li key={idx}>{rec.replace(/^-\s*/, "")}</li>;
                          })}
                        </ul>
                      </div>
                    </div>
                  )}
                  
                  {reportTab === "market" && (
                    <div className="pane-content">
                      <h3>Market Overview & Industry Trends</h3>
                      <div className="markdown-body">
                        {runReport.market_overview.split("\n\n").map((para, idx) => (
                          <p key={idx}>{para}</p>
                        ))}
                      </div>
                      
                      <h3 style={{ marginTop: "24px" }}>Competitive Landscape</h3>
                      <div className="markdown-body">
                        {runReport.competitor_analysis.split("\n\n").map((para, idx) => (
                          <p key={idx}>{para}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {reportTab === "swot" && (
                    <div className="pane-content">
                      <h3>SWOT Analysis</h3>
                      <div className="markdown-body">
                        {runReport.swot_analysis.split("\n\n").map((para, idx) => (
                          <p key={idx}>{para}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {reportTab === "critique" && (
                    <div className="pane-content">
                      <div className="critique-alert glass-card">
                        <Activity size={20} className="pulse-icon" />
                        <div>
                          <strong>Multi-Agent Polishing Record:</strong> Below are the logs and notes of changes 
                          made during the critique stage. A Heavy model audited the initial draft, identified gaps, 
                          and directed the refiner and polisher agents.
                        </div>
                      </div>
                      
                      <h3>Expert Critique & Refinement Notes</h3>
                      <div className="markdown-body select-text">
                        {runReport.critique_notes.split("\n\n").map((para, idx) => (
                          <p key={idx}>{para}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {reportTab === "raw" && (
                    <div className="pane-content">
                      <h3>Raw JSON Output</h3>
                      <pre className="raw-json-block select-text">
                        {JSON.stringify(runReport, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
