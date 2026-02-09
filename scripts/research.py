# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "google-genai>=1.0.0",
#     "rich>=13.0.0",
# ]
# ///
"""Start, monitor, and save Gemini Deep Research interactions.

Wraps the Gemini Interactions API to launch background deep-research
tasks, poll their status, and export the final report as Markdown.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from google import genai
from google.genai import types
from rich.console import Console
from rich.live import Live
from rich.markdown import Markdown
from rich.panel import Panel
from rich.spinner import Spinner
from rich.table import Table
from rich.text import Text

console = Console(stderr=True)

DEFAULT_AGENT = os.environ.get(
    "GEMINI_DEEP_RESEARCH_AGENT",
    "deep-research-pro-preview-12-2025",
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_api_key() -> str:
    """Resolve the API key from environment variables."""
    for var in ("GEMINI_DEEP_RESEARCH_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"):
        key = os.environ.get(var)
        if key:
            return key
    console.print("[red]Error:[/red] No API key found.")
    console.print("Set one of: GEMINI_DEEP_RESEARCH_API_KEY, GOOGLE_API_KEY, GEMINI_API_KEY")
    sys.exit(1)


def get_client() -> genai.Client:
    """Create an authenticated GenAI client."""
    return genai.Client(api_key=get_api_key())


def get_state_path() -> Path:
    return Path(".gemini-research.json")


def load_state() -> dict:
    path = get_state_path()
    if not path.exists():
        return {"researchIds": [], "fileSearchStores": {}, "uploadOperations": {}}
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return {"researchIds": [], "fileSearchStores": {}, "uploadOperations": {}}


def save_state(state: dict) -> None:
    get_state_path().write_text(json.dumps(state, indent=2) + "\n")


def add_research_id(interaction_id: str) -> None:
    """Track a research interaction ID in workspace state."""
    state = load_state()
    ids = state.setdefault("researchIds", [])
    if interaction_id not in ids:
        ids.append(interaction_id)
        save_state(state)


def record_research_completion(
    interaction_id: str, duration: int, grounded: bool,
) -> None:
    """Record a completed research run for adaptive polling."""
    state = load_state()
    history = state.setdefault("researchHistory", [])
    history.append({
        "id": interaction_id,
        "duration_seconds": duration,
        "grounded": grounded,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    # Keep last 50 entries to prevent unbounded growth
    state["researchHistory"] = history[-50:]
    save_state(state)


def _percentile(sorted_values: list[float], p: float) -> float:
    """Compute the p-th percentile (0-100) of a sorted list of values."""
    if not sorted_values:
        return 0.0
    k = (len(sorted_values) - 1) * (p / 100.0)
    f = int(k)
    c = f + 1
    if c >= len(sorted_values):
        return sorted_values[-1]
    return sorted_values[f] + (k - f) * (sorted_values[c] - sorted_values[f])


def _get_adaptive_poll_interval(
    elapsed: float, history: list[dict], grounded: bool,
) -> float:
    """Return poll interval based on historical completion times.

    Adapts the polling frequency so that we poll most aggressively during the
    window where research is most likely to finish (p25-p75 of past durations).
    Falls back to the fixed curve when insufficient history exists (<3 points).
    """
    # Filter history by grounded / non-grounded
    durations = sorted(
        entry["duration_seconds"]
        for entry in history
        if entry.get("grounded", False) == grounded
        and isinstance(entry.get("duration_seconds"), (int, float))
    )

    # Need at least 3 data points to build a meaningful distribution
    if len(durations) < 3:
        return _get_poll_interval(elapsed)

    min_d = durations[0]
    p25 = _percentile(durations, 25)
    p75 = _percentile(durations, 75)
    max_d = durations[-1]

    if elapsed < min_d:
        # Nothing ever finishes this fast -- poll slowly
        interval = 30.0
    elif elapsed < p25:
        # Some finish here -- moderate polling
        interval = 15.0
    elif elapsed <= p75:
        # Most likely completion window -- aggressive polling
        interval = 5.0
    elif elapsed <= max_d:
        # Tail end -- moderate
        interval = 15.0
    elif elapsed <= max_d * 1.5:
        # Past longest ever but within 1.5x -- slow down
        interval = 30.0
    else:
        # Unusually long -- very slow
        interval = 60.0

    # Clamp to [2, 120] seconds as fail-safe
    return max(2.0, min(120.0, interval))


def _write_output_dir(
    output_dir: str,
    interaction_id: str,
    interaction: object,
    report_text: str,
    duration_seconds: int | None = None,
) -> dict:
    """Write research results to a structured directory and return a compact summary."""
    base = Path(output_dir)
    research_dir = base / f"research-{interaction_id[:12]}"
    research_dir.mkdir(parents=True, exist_ok=True)

    # Write report.md
    report_path = research_dir / "report.md"
    report_path.write_text(report_text)

    # Build interaction data
    outputs_data = []
    sources: list[str] = []
    if interaction.outputs:
        for i, output in enumerate(interaction.outputs):
            text = getattr(output, "text", None)
            entry: dict = {"index": i, "text": text}
            outputs_data.append(entry)
            # Try to extract URLs from the text as sources
            if text:
                import re
                urls = re.findall(r'https?://[^\s\)>\]"\']+', text)
                sources.extend(urls)

    # Write interaction.json
    interaction_data = {
        "id": interaction_id,
        "status": getattr(interaction, "status", "unknown"),
        "outputCount": len(outputs_data),
        "outputs": outputs_data,
    }
    (research_dir / "interaction.json").write_text(
        json.dumps(interaction_data, indent=2, default=str) + "\n"
    )

    # Write sources.json (deduplicated)
    seen: set[str] = set()
    unique_sources: list[str] = []
    for url in sources:
        if url not in seen:
            seen.add(url)
            unique_sources.append(url)
    (research_dir / "sources.json").write_text(
        json.dumps(unique_sources, indent=2) + "\n"
    )

    # Write metadata.json
    metadata = {
        "id": interaction_id,
        "status": getattr(interaction, "status", "unknown"),
        "report_file": str(report_path),
        "report_size_bytes": len(report_text.encode("utf-8")),
        "output_count": len(outputs_data),
        "source_count": len(unique_sources),
    }
    if duration_seconds is not None:
        metadata["duration_seconds"] = duration_seconds
    (research_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2) + "\n"
    )

    # Build compact stdout summary (< 500 chars)
    summary_text = report_text[:200].replace("\n", " ").strip()
    if len(report_text) > 200:
        summary_text += "..."
    compact = {
        "id": interaction_id,
        "status": getattr(interaction, "status", "unknown"),
        "output_dir": str(research_dir),
        "report_file": str(report_path),
        "report_size_bytes": len(report_text.encode("utf-8")),
        "summary": summary_text,
    }
    if duration_seconds is not None:
        compact["duration_seconds"] = duration_seconds

    return compact


def resolve_store_name(name_or_alias: str) -> str:
    """Resolve a store display name to its resource name via state, or pass through."""
    if name_or_alias.startswith("fileSearchStores/"):
        return name_or_alias
    state = load_state()
    stores = state.get("fileSearchStores", {})
    if name_or_alias in stores:
        return stores[name_or_alias]
    return name_or_alias

# ---------------------------------------------------------------------------
# start subcommand
# ---------------------------------------------------------------------------

def cmd_start(args: argparse.Namespace) -> None:
    """Start a new deep research interaction."""
    client = get_client()
    query: str = args.query

    # Prepend report format if specified
    if args.report_format:
        format_map = {
            "executive_summary": "Executive Brief",
            "detailed_report": "Technical Deep Dive",
            "comprehensive": "Comprehensive Research Report",
        }
        label = format_map.get(args.report_format, args.report_format)
        query = f"[Report Format: {label}]\n\n{query}"

    # Handle follow-up: prepend context from previous interaction
    if args.follow_up:
        console.print(f"Loading previous research [bold]{args.follow_up}[/bold] for context...")
        try:
            prev = client.interactions.get(args.follow_up)
            if prev.outputs:
                prev_text = ""
                for output in prev.outputs:
                    text = getattr(output, "text", None)
                    if text:
                        prev_text = text  # use the last text output
                if prev_text:
                    query = (
                        f"[Follow-up to previous research]\n\n"
                        f"Previous findings:\n{prev_text[:4000]}\n\n"
                        f"New question:\n{query}"
                    )
        except Exception as exc:
            console.print(f"[yellow]Warning:[/yellow] Could not load previous research: {exc}")

    # Handle file attachment: upload to a temporary store
    file_search_store_names: list[str] | None = None

    if args.store:
        file_search_store_names = [resolve_store_name(args.store)]

    if args.file:
        filepath = Path(args.file).resolve()
        if not filepath.exists():
            console.print(f"[red]Error:[/red] File not found: {filepath}")
            sys.exit(1)
        if args.use_file_store:
            # Upload to a store for grounding
            console.print(f"Uploading [bold]{filepath.name}[/bold] to file search store...")
            store = client.file_search_stores.create(
                config={"display_name": f"research-{filepath.stem}"}
            )
            operation = client.file_search_stores.upload_to_file_search_store(
                file=str(filepath),
                file_search_store_name=store.name,
                config={"display_name": filepath.name},
            )
            while not operation.done:
                time.sleep(3)
                operation = client.operations.get(operation)
            console.print(f"[green]Uploaded to store:[/green] {store.name}")
            if file_search_store_names is None:
                file_search_store_names = []
            file_search_store_names.append(store.name)

            # Track in state
            st = load_state()
            st.setdefault("fileSearchStores", {})[f"research-{filepath.stem}"] = store.name
            save_state(st)
        else:
            # Inline file: append file contents to query (for smaller files)
            try:
                content = filepath.read_text(errors="replace")
                if len(content) > 100_000:
                    console.print(
                        "[yellow]Warning:[/yellow] File is large. "
                        "Consider using --use-file-store for better results."
                    )
                query = f"{query}\n\n---\nAttached file ({filepath.name}):\n{content}"
            except Exception as exc:
                console.print(f"[red]Error reading file:[/red] {exc}")
                sys.exit(1)

    # Build create kwargs
    create_kwargs: dict = {
        "input": query,
        "agent": DEFAULT_AGENT,
        "background": True,
    }
    if file_search_store_names:
        create_kwargs["config"] = {
            "file_search_store_names": file_search_store_names,
        }

    console.print("Starting deep research...")
    try:
        interaction = client.interactions.create(**create_kwargs)
    except Exception as exc:
        # Fallback: try without config if the SDK version doesn't support it
        if file_search_store_names and "config" in create_kwargs:
            console.print("[yellow]Note:[/yellow] Retrying without file search store config...")
            del create_kwargs["config"]
            try:
                interaction = client.interactions.create(**create_kwargs)
            except Exception as inner_exc:
                console.print(f"[red]Error:[/red] {inner_exc}")
                sys.exit(1)
        else:
            console.print(f"[red]Error:[/red] {exc}")
            sys.exit(1)

    interaction_id = interaction.id
    add_research_id(interaction_id)

    console.print(f"[green]Research started.[/green]")
    console.print(f"  ID: [bold]{interaction_id}[/bold]")
    console.print(f"  Status: {interaction.status}")
    console.print()
    console.print("Use [bold]research.py status[/bold] to check progress.")

    # If --output or --output-dir is set, poll until complete then save
    output_dir = getattr(args, "output_dir", None)
    grounded = file_search_store_names is not None
    adaptive_poll = not getattr(args, "no_adaptive_poll", False)
    if args.output or output_dir:
        _poll_and_save(
            client, interaction_id,
            output_path=args.output,
            output_dir=output_dir,
            show_thoughts=not args.no_thoughts,
            timeout=args.timeout,
            grounded=grounded,
            adaptive_poll=adaptive_poll,
        )
    else:
        # Print to stdout for machine consumption
        print(json.dumps({"id": interaction_id, "status": interaction.status}))


def _get_poll_interval(elapsed: float) -> float:
    """Return an adaptive poll interval based on elapsed time."""
    if elapsed < 30:
        return 5
    elif elapsed < 120:
        return 10
    elif elapsed < 600:
        return 30
    else:
        return 60


def _poll_and_save(
    client: genai.Client,
    interaction_id: str,
    output_path: str | None = None,
    output_dir: str | None = None,
    show_thoughts: bool = True,
    timeout: int = 1800,
    grounded: bool = False,
    adaptive_poll: bool = True,
) -> None:
    """Poll until research completes, then save the report."""
    console.print("Waiting for research to complete...")

    # Load history for adaptive polling
    history: list[dict] = []
    use_adaptive = False
    if adaptive_poll:
        try:
            state = load_state()
            history = state.get("researchHistory", [])
            # Need at least 3 matching entries to use adaptive
            matching = [
                e for e in history
                if e.get("grounded", False) == grounded
                and isinstance(e.get("duration_seconds"), (int, float))
            ]
            use_adaptive = len(matching) >= 3
        except Exception:
            pass  # Silently fall back to fixed curve

    if use_adaptive:
        console.print("[dim]Using adaptive polling (based on history).[/dim]")

    prev_output_count = 0
    start_time = time.monotonic()
    with Live(Spinner("dots", text="Researching..."), console=console, refresh_per_second=4) as live:
        while True:
            elapsed = time.monotonic() - start_time
            if elapsed > timeout:
                live.update(Text(f"Timed out after {int(elapsed)}s.", style="red bold"))
                console.print(f"[red]Error:[/red] Research timed out after {int(elapsed)} seconds.")
                console.print(f"Use [bold]research.py status {interaction_id}[/bold] to check later.")
                sys.exit(1)

            try:
                interaction = client.interactions.get(interaction_id)
            except Exception as exc:
                # Transient error -- log and retry
                interval = (
                    _get_adaptive_poll_interval(elapsed, history, grounded)
                    if use_adaptive
                    else _get_poll_interval(elapsed)
                )
                live.update(Text(f"Poll error (retrying): {exc}", style="yellow"))
                time.sleep(interval)
                continue

            status = interaction.status

            if show_thoughts and interaction.outputs:
                current_count = len(interaction.outputs)
                if current_count > prev_output_count:
                    # Show new thinking steps
                    for output in interaction.outputs[prev_output_count:]:
                        text = getattr(output, "text", None)
                        if text:
                            live.update(
                                Panel(
                                    Text(text[:500] + ("..." if len(text) > 500 else ""), style="dim"),
                                    title=f"Status: {status} ({int(elapsed)}s elapsed)",
                                    subtitle=f"Step {current_count}",
                                )
                            )
                    prev_output_count = current_count

            if status == "completed":
                live.update(Text("Research complete!", style="green bold"))
                break
            elif status in ("failed", "cancelled"):
                live.update(Text(f"Research {status}.", style="red bold"))
                console.print(f"[red]Research {status}.[/red]")
                sys.exit(1)

            interval = (
                _get_adaptive_poll_interval(elapsed, history, grounded)
                if use_adaptive
                else _get_poll_interval(elapsed)
            )
            time.sleep(interval)

    duration = int(time.monotonic() - start_time)

    # Record completion for future adaptive polling
    try:
        record_research_completion(interaction_id, duration, grounded)
    except Exception:
        pass  # Non-critical -- don't fail the save over history tracking

    # Extract final report
    report_text = ""
    if interaction.outputs:
        for output in reversed(interaction.outputs):
            text = getattr(output, "text", None)
            if text:
                report_text = text
                break

    if not report_text:
        console.print("[yellow]Warning:[/yellow] No text output found in completed research.")
        return

    # Write to output directory if specified
    if output_dir:
        compact = _write_output_dir(output_dir, interaction_id, interaction, report_text, duration)
        console.print()
        console.print(f"[green]Results saved to:[/green] {compact['output_dir']}")
        print(json.dumps(compact))
        return

    # Write to single file
    if output_path:
        Path(output_path).write_text(report_text)
        console.print()
        console.print(f"[green]Report saved to:[/green] {output_path}")

# ---------------------------------------------------------------------------
# status subcommand
# ---------------------------------------------------------------------------

def cmd_status(args: argparse.Namespace) -> None:
    """Check the status of a research interaction."""
    client = get_client()
    interaction_id: str = args.research_id

    try:
        interaction = client.interactions.get(interaction_id)
    except Exception as exc:
        console.print(f"[red]Error:[/red] {exc}")
        sys.exit(1)

    # Status summary
    status = interaction.status
    style = {"completed": "green", "failed": "red", "cancelled": "red"}.get(status, "yellow")
    console.print(f"Status: [{style}]{status}[/{style}]")
    console.print(f"ID: {interaction_id}")

    # Show outputs summary
    outputs = interaction.outputs or []
    if outputs:
        console.print(f"Outputs: {len(outputs)} step(s)")
        console.print()

        for i, output in enumerate(outputs):
            text = getattr(output, "text", None)
            if text:
                label = "Final Report" if i == len(outputs) - 1 and status == "completed" else f"Step {i + 1}"
                # Truncate for display
                preview = text[:300] + ("..." if len(text) > 300 else "")
                console.print(Panel(preview, title=label))
    else:
        console.print("[dim]No outputs yet.[/dim]")

    # Machine-readable on stdout
    result: dict = {"id": interaction_id, "status": status, "outputCount": len(outputs)}
    print(json.dumps(result))

# ---------------------------------------------------------------------------
# report subcommand
# ---------------------------------------------------------------------------

def cmd_report(args: argparse.Namespace) -> None:
    """Generate and save a markdown report from a completed interaction."""
    client = get_client()
    interaction_id: str = args.research_id

    try:
        interaction = client.interactions.get(interaction_id)
    except Exception as exc:
        console.print(f"[red]Error:[/red] {exc}")
        sys.exit(1)

    if interaction.status != "completed":
        console.print(
            f"[red]Error:[/red] Interaction is not completed. "
            f"Current status: {interaction.status}"
        )
        sys.exit(1)

    outputs = interaction.outputs or []
    if not outputs:
        console.print("[red]Error:[/red] No outputs found for this interaction.")
        sys.exit(1)

    # Build markdown report from outputs
    sections: list[str] = []
    sections.append(f"# Deep Research Report\n")
    sections.append(f"**Interaction ID:** `{interaction_id}`\n")
    sections.append(f"**Status:** {interaction.status}\n")
    sections.append("---\n")

    for i, output in enumerate(outputs):
        text = getattr(output, "text", None)
        if text:
            if i == len(outputs) - 1:
                sections.append(text)
            else:
                sections.append(f"### Research Step {i + 1}\n")
                sections.append(text)
                sections.append("\n---\n")

    report = "\n".join(sections)

    output_dir = getattr(args, "output_dir", None)
    if output_dir:
        compact = _write_output_dir(output_dir, interaction_id, interaction, report)
        console.print(f"[green]Results saved to:[/green] {compact['output_dir']}")
        print(json.dumps(compact))
        return

    output_path = args.output or f"research-report-{interaction_id[:8]}.md"
    Path(output_path).write_text(report)
    console.print(f"[green]Report saved to:[/green] {output_path}")

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="research",
        description="Gemini Deep Research: start, monitor, and save research interactions",
    )
    sub = parser.add_subparsers(dest="command")

    # start (default)
    start_p = sub.add_parser("start", help="Start a new deep research interaction (default)")
    start_p.add_argument("query", help="The research query or instructions")
    start_p.add_argument(
        "--file", metavar="PATH",
        help="Attach a file to the research (inlined or uploaded to store)",
    )
    start_p.add_argument(
        "--use-file-store", action="store_true",
        help="Upload attached file to a file search store for grounding",
    )
    start_p.add_argument(
        "--store", metavar="NAME",
        help="Use a pre-existing file search store for grounding (name or resource ID)",
    )
    start_p.add_argument(
        "--report-format",
        choices=["executive_summary", "detailed_report", "comprehensive"],
        help="Desired report format",
    )
    start_p.add_argument(
        "--follow-up", metavar="ID",
        help="Continue from a previous research interaction",
    )
    start_p.add_argument(
        "--output", "-o", metavar="PATH",
        help="Wait for completion and save report to this path",
    )
    start_p.add_argument(
        "--no-thoughts", action="store_true",
        help="Suppress thinking step display during polling",
    )
    start_p.add_argument(
        "--timeout", type=int, default=1800,
        help="Maximum seconds to wait when --output is used (default: 1800)",
    )
    start_p.add_argument(
        "--output-dir", metavar="DIR",
        help="Wait for completion and save structured results to this directory",
    )
    start_p.add_argument(
        "--no-adaptive-poll", action="store_true",
        help="Disable history-adaptive polling; use fixed interval curve instead",
    )

    # status
    status_p = sub.add_parser("status", help="Check research interaction status")
    status_p.add_argument("research_id", help="The interaction ID")

    # report
    report_p = sub.add_parser("report", help="Save a markdown report from completed research")
    report_p.add_argument("research_id", help="The interaction ID")
    report_p.add_argument("--output", "-o", metavar="PATH", help="Output file path")
    report_p.add_argument(
        "--output-dir", metavar="DIR",
        help="Save structured results to this directory",
    )

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    commands = {
        "start": cmd_start,
        "status": cmd_status,
        "report": cmd_report,
    }

    if args.command is None:
        # Default to start if a bare query is provided
        # Re-parse with start as default
        if argv is None:
            argv = sys.argv[1:]
        if argv and not argv[0].startswith("-") and argv[0] not in commands:
            argv = ["start"] + list(argv)
            args = parser.parse_args(argv)

    handler = commands.get(args.command)
    if handler is None:
        parser.print_help()
        sys.exit(1)
    handler(args)


if __name__ == "__main__":
    main()
