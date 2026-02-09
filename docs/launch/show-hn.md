# Show HN Draft

## Title

Show HN: Agent Deep Research -- Stateful Gemini deep research as a universal AI agent skill

(78 chars)

---

## Body

I built a research skill that runs as a background agent inside your coding environment. It uses the Gemini Interactions API to launch stateful, long-running research jobs that keep working while you do other things. It is not a search wrapper or a prompt chain -- the Gemini deep research agent does multi-step investigation with web grounding, and this skill gives any AI coding agent (Claude Code, Amp, Codex, Gemini CLI, and 30+ others) a CLI interface to control it.

The interesting technical bit is the Interactions API itself. Unlike a standard LLM call, you start a research "interaction" that runs asynchronously on Google's side, sometimes for 5-10 minutes. The skill handles adaptive polling that learns from your past research durations (tracks p25/p75 completion windows, separate curves for RAG-grounded vs. web-only research). It also supports RAG grounding against local files: `--context ./src` auto-creates an ephemeral file search store, uploads your code, runs grounded research, and cleans up afterward. There is a `--dry-run` flag that estimates costs before you commit.

Everything runs via `uv run` with PEP 723 inline metadata -- zero pre-installation of Python packages. The scripts use a dual-output convention (stderr for human-readable Rich output, stdout for machine-readable JSON) so AI agents can parse results programmatically while humans see formatted tables and progress bars. State is persisted in a local `.gemini-research.json` workspace file, so follow-up questions maintain context.

Install: `npx skills add 24601/agent-deep-research` (or `git clone` and point your agent at it). Requires a Google API key and `uv`. MIT licensed.

GitHub: https://github.com/24601/agent-deep-research

---

## Notes

- Title is under 80 chars
- No exclamation marks, no "excited to share", no superlatives
- Leads with what it does, not why it is great
- Technical details (Interactions API, adaptive polling, PEP 723) give HN readers something to chew on
- One-liner install at the end
- Does not oversell -- acknowledges it is built on top of Gemini's agent, not replacing it
