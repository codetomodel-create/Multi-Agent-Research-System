---
title: Multi Agent Research System
emoji: 📊
colorFrom: indigo
colorTo: blue
sdk: docker
pinned: false
---

# AI Market Research Assistant

## 📹 Product Walkthrough
> **[▶ Watch the full walkthrough on Google Drive](https://drive.google.com/file/d/1acI-uxsr9jE1vtX2DsCmHUD09XZICYa7/view?usp=drive_link)**

The AI Market Research Assistant is a config-driven, multi-agent system designed to generate premium C-suite business reports from a single business idea and target location. It utilizes a combination of light and heavy LLMs to optimize token consumption while maintaining high analytical quality.

## Features
- **Multi-Provider LLM Router**: Supports Ollama, OpenAI, DeepSeek, Gemini, Qwen.
- **Cost-Optimized Routing**: Uses Light Models for drafting and Heavy Models for synthesis and fact-checking.
- **Dynamic UI**: Instant theme toggling (Dark, Light, Solarized) and LocalStorage API key management.
- **Comprehensive Reporting**: Generates Executive Summaries, SWOT Analyses, and Critique Logs.

## Running Locally

1. **Backend**:
   ```bash
   python3 -m venv backend/.venv
   source backend/.venv/bin/activate
   pip install fastapi uvicorn litellm PyYAML duckduckgo-search pydantic python-dotenv
   backend/.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```

2. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm install lucide-react
   npm run dev
   ```

## LinkedIn demo

One command starts fixture mode, seeds two Compare runs, and opens the presenter URL:

```bash
./start-linkedin-demo.sh
```

Windows: `start-linkedin-demo.cmd` or `py -m backend.linkedin_demo`.

Then follow the speaking script in `docs/LINKEDIN_DEMO.md`. Open `http://localhost:8000/?demo=1` if the browser does not launch.

## Full Documentation
For the comprehensive project specification, architecture flowcharts, visual workflows, and deployment guides, please see `project_documentation.xlsx` or `project_documentation.md`.

## Video Walkthrough
[▶ Watch on Google Drive](https://drive.google.com/file/d/1acI-uxsr9jE1vtX2DsCmHUD09XZICYa7/view?usp=drive_link)
