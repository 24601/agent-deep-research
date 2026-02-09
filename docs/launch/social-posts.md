# Social Media Drafts

## Twitter/X

```
Built a deep research skill for AI coding agents. It launches stateful Gemini research jobs that run in the background while you code -- with RAG grounding against local files.

Works with Claude Code, Amp, Codex, and 30+ agents.

npx skills add 24601/agent-deep-research
```

(274 chars)

---

## Reddit r/OpenClaw

### Title

agent-deep-research: Deep research skill for OpenClaw/Clawdbot via the Gemini Interactions API

### Body

I built a universal AI agent skill that gives coding agents access to Google Gemini's deep research agent. It runs stateful background research jobs while you keep working, with optional RAG grounding against your local codebase.

**What it does:**
- Launches long-running research via the Gemini Interactions API (not a search wrapper)
- `--context ./src` auto-uploads local files for RAG-grounded research, cleans up after
- Adaptive polling that learns from your past research completion times
- `--dry-run` for cost estimation before committing
- Structured JSON output for agent consumption, Rich output for humans

**Install for OpenClaw:**
```bash
npx skills add 24601/agent-deep-research -a openclaw -g -y
```

Or via ClawHub: `npx clawhub install agent-deep-research`

Works with Claude Code, Amp, Codex, Gemini CLI, and 30+ other agents via skills.sh. MIT licensed.

GitHub: https://github.com/24601/agent-deep-research

---

## Reddit r/LocalLLaMA

### Title

agent-deep-research: Universal deep research skill that works across 30+ AI coding agents (Claude Code, Amp, Codex, etc.)

### Body

This is a Python CLI skill that wraps the Gemini Interactions API to provide deep research capabilities to any AI coding agent. The skill itself is agent-agnostic -- it installs via `npx skills add` on skills.sh and works with Claude Code, Amp, Codex, Gemini CLI, OpenCode, Pi, OpenClaw/Clawdbot, and others.

The architecture is straightforward: Python scripts that talk to the Gemini API via the `google-genai` SDK, with `uv run` for zero-install execution (PEP 723 inline metadata). No Node.js runtime at inference time, no MCP server, no Gemini CLI dependency. Just CLI scripts that emit JSON on stdout and Rich formatting on stderr.

Interesting features:
- Stateful background research (async Interactions API, not a synchronous LLM call)
- RAG grounding against local files (`--context ./path`)
- History-adaptive polling (learns from past completion times, targets p25-p75 window)
- Cost estimation (`--dry-run`)
- Structured output directory with report, metadata, sources, and full interaction data

The universal agent compatibility comes from the skills.sh standard -- a `SKILL.md` manifest that any compatible agent can read and execute. If you are building or using a different agent, adding support is just a matter of reading that manifest.

```bash
npx skills add 24601/agent-deep-research
```

GitHub: https://github.com/24601/agent-deep-research

---

## Awesome-List One-Liner

```
[agent-deep-research](https://github.com/24601/agent-deep-research) - Deep research and RAG-grounded file search via the Gemini Interactions API. Universal AI agent skill for Claude Code, Amp, Codex, and 30+ agents.
```
