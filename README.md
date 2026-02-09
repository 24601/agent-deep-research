# agent-deep-research

[![CI](https://github.com/24601/agent-deep-research/actions/workflows/ci.yml/badge.svg)](https://github.com/24601/agent-deep-research/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/24601/agent-deep-research)](https://github.com/24601/agent-deep-research/releases)

Deep research and RAG-grounded file search powered by the Google Gemini Interactions API. A universal AI agent skill that works with Claude Code, Amp, Codex, OpenCode, Cursor, Gemini CLI, and [30+ other agents](https://skills.sh). No dependency on the Gemini CLI -- uses the `google-genai` Python SDK directly via `uv run`.

## Installation

```bash
npx skills add 24601/agent-deep-research
```

### Agent-specific installation

```bash
# Claude Code
npx skills add 24601/agent-deep-research -a claude-code -g -y

# Amp
npx skills add 24601/agent-deep-research -a amp -g -y

# Codex
npx skills add 24601/agent-deep-research -a codex -g -y

# Gemini CLI
npx skills add 24601/agent-deep-research -a gemini-cli -g -y

# OpenCode
npx skills add 24601/agent-deep-research -a opencode -g -y

# Pi (badlogic/pi-mono)
npx skills add 24601/agent-deep-research -a pi -g -y

# OpenClaw / Clawdbot
npx skills add 24601/agent-deep-research -a openclaw -g -y
```

### Pi agent (manual install)

If you prefer manual installation for [Pi](https://github.com/badlogic/pi-mono):

```bash
# Clone to Pi's global skills directory
git clone https://github.com/24601/agent-deep-research.git ~/.pi/agent/skills/deep-research

# Or add to Pi settings.json to load from an existing directory
# ~/.pi/settings.json:
# { "skills": ["~/.agents/skills"] }
```

Then use `/skill:deep-research` in Pi, or let Pi auto-detect it from the description.

### ClawHub (OpenClaw registry)

```bash
npx clawhub install agent-deep-research
```

Or browse at [clawhub.ai/skills/agent-deep-research](https://clawhub.ai/skills/agent-deep-research).

## Prerequisites

- A Google API key (see [Configuration](#configuration))
- [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`)

## Configuration

Set one of the following environment variables (checked in order of priority):

| Variable | Description |
|----------|-------------|
| `GEMINI_DEEP_RESEARCH_API_KEY` | Dedicated key for this skill (highest priority) |
| `GOOGLE_API_KEY` | Standard Google AI key |
| `GEMINI_API_KEY` | Gemini-specific key |

Optional model configuration:

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_DEEP_RESEARCH_MODEL` | Model for file search queries | `models/gemini-flash-latest` |
| `GEMINI_MODEL` | Fallback model name | `models/gemini-flash-latest` |
| `GEMINI_DEEP_RESEARCH_AGENT` | Deep research agent identifier | `deep-research-pro-preview-12-2025` |

## Quick Start

```bash
# Run a deep research query (blocks until complete, saves to file)
uv run scripts/research.py "What are the latest advances in quantum computing?" --output report.md

# Non-blocking: start and check later
uv run scripts/research.py start "Analyze the security landscape"
uv run scripts/research.py status <interaction-id>
uv run scripts/research.py report <interaction-id> --output report.md

# Structured output for agent integration
uv run scripts/research.py start "Deep analysis" --output-dir ./research-output

# Research grounded in local files (auto-creates store, uploads, cleans up)
uv run scripts/research.py start "How does auth work?" --context ./src --output report.md

# Filter context to specific file types
uv run scripts/research.py start "Analyze the Python code" --context ./src --context-extensions py,md
```

## Onboarding

First-time setup for humans and agents:

```bash
# Quick config check
uv run scripts/onboard.py --check

# Interactive setup wizard (humans)
uv run scripts/onboard.py --interactive

# Capabilities manifest (agents)
uv run scripts/onboard.py --agent
```

For AI agents integrating this skill, see [AGENTS.md](AGENTS.md) for structured capabilities, decision trees, output contracts, and common workflows.

## Features

### Deep Research (`scripts/research.py`)

Start background research jobs, check status, and save reports.

```bash
uv run scripts/research.py start "your question"       # Start research
uv run scripts/research.py status <id>                  # Check progress
uv run scripts/research.py report <id> --output file.md # Save report
```

Key flags:

| Flag | Description |
|------|-------------|
| `--report-format FORMAT` | `executive_summary`, `detailed_report`, `comprehensive` |
| `--store STORE_NAME` | Ground research in a file search store |
| `--output FILE` | Block until complete, save report to file |
| `--output-dir DIR` | Block until complete, save structured results to directory |
| `--timeout SECONDS` | Maximum wait time when polling (default: 1800) |
| `--no-adaptive-poll` | Use fixed polling interval instead of history-adaptive |
| `--follow-up ID` | Continue a previous research session |
| `--no-thoughts` | Hide intermediate thinking steps |
| `--context PATH` | Auto-create ephemeral store from local files for RAG-grounded research |
| `--context-extensions EXT` | Filter context uploads by extension (e.g. `py,md`) |
| `--keep-context` | Keep the ephemeral context store after research completes |
| `--dry-run` | Estimate costs without starting research |

### Cost Estimation

Preview estimated costs before running research:

```bash
uv run scripts/research.py start "Analyze the codebase" --context ./src --dry-run
```

Estimates are heuristic-based (the Gemini API does not return token counts). After research completes with `--output-dir`, `metadata.json` includes post-run usage estimates based on actual output size and duration.

### Adaptive Polling

When `--output` or `--output-dir` is used, the script polls the Gemini API with history-adaptive intervals:

- Completion times are recorded in `.gemini-research.json` (last 50 entries, separate curves for grounded vs non-grounded research)
- With 3+ data points: polls aggressively during the likely completion window (p25-p75), slowly in the tail
- Without history: uses a fixed escalating curve (5s, 10s, 30s, 60s)
- All intervals clamped to [2s, 120s]

### Structured Output (`--output-dir`)

Results are saved to a structured directory:

```
<output-dir>/research-<id>/
  report.md          # Full final report
  metadata.json      # Timing, status, output count, sizes
  interaction.json   # Full interaction data
  sources.json       # Extracted source URLs/citations
```

A compact JSON summary (under 500 chars) is printed to stdout for agent consumption.

### File Search Stores (`scripts/store.py`)

Create and manage file search stores for RAG-grounded research.

```bash
uv run scripts/store.py create "My Project Docs"
uv run scripts/store.py list
uv run scripts/store.py query <store-name> "What does the auth module do?"
uv run scripts/store.py delete <store-name> [--force]
```

### File Upload (`scripts/upload.py`)

Upload files or directories to a file search store.

```bash
uv run scripts/upload.py ./src fileSearchStores/abc123
uv run scripts/upload.py ./docs <store-name> --smart-sync --extensions py,ts,md
```

`--smart-sync` skips files that haven't changed (hash comparison). 36 file extensions are natively supported; common programming files are uploaded as `text/plain` via fallback. 100 MB per file limit.

### Session Management (`scripts/state.py`)

```bash
uv run scripts/state.py show       # Full workspace state
uv run scripts/state.py research   # Research sessions only
uv run scripts/state.py stores     # Stores only
uv run scripts/state.py clear      # Clear state
uv run scripts/state.py --json show  # JSON output for agents
```

### Non-Interactive Mode

All confirmation prompts (`store.py delete`, `state.py clear`) are automatically skipped when stdin is not a TTY, allowing AI agents and CI pipelines to call these commands without hanging.

### Output Convention

All scripts follow a dual-output pattern:
- **stderr**: Rich-formatted human-readable output (tables, panels, progress)
- **stdout**: Machine-readable JSON for programmatic consumption

Pipe `2>/dev/null` to hide human output; pipe stdout for clean JSON.

## Workflow Example

```bash
# 1. Create a file search store
STORE_JSON=$(uv run scripts/store.py create "Project Codebase")
STORE_NAME=$(echo "$STORE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")

# 2. Upload your documents
uv run scripts/upload.py ./docs "$STORE_NAME" --smart-sync

# 3. Query the store directly
uv run scripts/store.py query "$STORE_NAME" "How is authentication handled?"

# 4. Start grounded deep research (blocking, saves to directory)
uv run scripts/research.py start "Analyze the security architecture" \
  --store "$STORE_NAME" --output-dir ./research-output --timeout 3600
```

## Architecture

```
Python CLI scripts (uv run)
    |
    +-- research.py  (deep research jobs)
    +-- store.py     (file search store CRUD)
    +-- upload.py    (file/directory upload)
    +-- state.py     (workspace state management)
    |
    v
google-genai Python SDK
    |
    v
Google Gemini API
    +-- Deep Research Agent (long-running research)
    +-- File Search API (RAG grounding)
    |
    v
.gemini-research.json (local workspace state)
```

## Known Issues

### Store-grounded deep research may fall back to web-only mode

When using `--store` with `research.py start`, the Gemini Interactions API occasionally rejects the file search store configuration. The script automatically retries without the store, falling back to web-only deep research. The retry logic works correctly, but the fallback research job may take longer than expected (potentially exceeding `--timeout`).

**Workaround**: If store-grounded research times out, use `research.py status <id>` to check if the job completed on Gemini's side, then `research.py report <id>` to save results. Alternatively, query the store directly with `store.py query` for faster RAG-grounded answers that don't require the deep research agent.

This applies to both `--store` and `--context` (which creates an ephemeral store under the hood). This is an upstream issue with the experimental Gemini Interactions API, not a bug in this skill.

## References

- `references/online_docs.md` -- Links to official Google API documentation
- `references/file_search_guide.md` -- Validated MIME types and upload compatibility
- `docs/file-search-mime-types.md` -- Full MIME type test methodology and results

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR process.

## Security

To report a vulnerability, use [GitHub Security Advisories](https://github.com/24601/agent-deep-research/security/advisories/new). See [SECURITY.md](SECURITY.md) for details.

## Community

- [GitHub Issues](https://github.com/24601/agent-deep-research/issues) -- bug reports and feature requests
- [GitHub Discussions](https://github.com/24601/agent-deep-research/discussions) -- questions and ideas

## Credits

This project was originally forked from [allenhutchison/gemini-cli-deep-research](https://github.com/allenhutchison/gemini-cli-deep-research). See [CREDITS.md](CREDITS.md) for full attribution.

## License

[MIT](LICENSE)
