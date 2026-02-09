# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "rich>=13.0.0",
# ]
# ///
"""Manage workspace state for Gemini Deep Research.

Reads and manages .gemini-research.json which tracks research IDs,
file search store mappings, and upload operations.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from rich.console import Console
from rich.table import Table

console = Console(stderr=True)

# ---------------------------------------------------------------------------
# State helpers
# ---------------------------------------------------------------------------

def get_state_path() -> Path:
    """Return the path to the workspace state file."""
    return Path(".gemini-research.json")


def load_state() -> dict:
    """Load workspace state from disk, returning empty defaults if missing."""
    path = get_state_path()
    if not path.exists():
        return {"researchIds": [], "fileSearchStores": {}, "uploadOperations": {}}
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        console.print(f"[yellow]Warning:[/yellow] failed to read state file: {exc}")
        return {"researchIds": [], "fileSearchStores": {}, "uploadOperations": {}}


def save_state(state: dict) -> None:
    """Persist workspace state to disk."""
    get_state_path().write_text(json.dumps(state, indent=2) + "\n")

# ---------------------------------------------------------------------------
# Subcommands
# ---------------------------------------------------------------------------

def cmd_show(_args: argparse.Namespace) -> None:
    """Display full workspace state."""
    state = load_state()
    use_json = getattr(_args, "json", False)

    if use_json:
        # Emit full state (excluding internal caches) as JSON to stdout
        output = {
            "researchIds": state.get("researchIds", []),
            "fileSearchStores": state.get("fileSearchStores", {}),
            "uploadOperations": state.get("uploadOperations", {}),
        }
        print(json.dumps(output, indent=2))
        return

    if not any(state.get(k) for k in ("researchIds", "fileSearchStores", "uploadOperations")):
        console.print("[dim]No workspace state found.[/dim]")
        return

    # Research IDs
    ids = state.get("researchIds", [])
    if ids:
        table = Table(title="Research Interactions")
        table.add_column("#", style="dim")
        table.add_column("Interaction ID")
        for i, rid in enumerate(ids, 1):
            table.add_row(str(i), rid)
        console.print(table)
    else:
        console.print("[dim]No research interactions tracked.[/dim]")

    console.print()

    # File search stores
    stores = state.get("fileSearchStores", {})
    if stores:
        table = Table(title="File Search Stores")
        table.add_column("Display Name")
        table.add_column("Resource Name")
        for name, resource in stores.items():
            table.add_row(name, resource)
        console.print(table)
    else:
        console.print("[dim]No file search stores tracked.[/dim]")

    console.print()

    # Upload operations
    ops = state.get("uploadOperations", {})
    if ops:
        table = Table(title="Upload Operations")
        table.add_column("ID", style="dim")
        table.add_column("Status")
        table.add_column("Path")
        table.add_column("Store")
        table.add_column("Progress")
        for op_id, op in ops.items():
            total = op.get("totalFiles", 0)
            done = op.get("completedFiles", 0) + op.get("skippedFiles", 0)
            pct = f"{round(done / total * 100)}%" if total else "N/A"
            status = op.get("status", "unknown")
            style = {"completed": "green", "failed": "red", "in_progress": "yellow"}.get(status, "")
            table.add_row(
                op_id[:12],
                f"[{style}]{status}[/{style}]" if style else status,
                op.get("path", ""),
                op.get("storeName", ""),
                pct,
            )
        console.print(table)
    else:
        console.print("[dim]No upload operations tracked.[/dim]")


def cmd_research(_args: argparse.Namespace) -> None:
    """List tracked research IDs."""
    state = load_state()
    ids = state.get("researchIds", [])
    use_json = getattr(_args, "json", False)

    if use_json:
        print(json.dumps(ids))
        return

    if not ids:
        console.print("[dim]No research interactions tracked.[/dim]")
        return
    table = Table(title="Research Interactions")
    table.add_column("#", style="dim")
    table.add_column("Interaction ID")
    for i, rid in enumerate(ids, 1):
        table.add_row(str(i), rid)
    console.print(table)


def cmd_stores(_args: argparse.Namespace) -> None:
    """List tracked store mappings."""
    state = load_state()
    stores = state.get("fileSearchStores", {})
    use_json = getattr(_args, "json", False)

    if use_json:
        result = [{"displayName": k, "name": v} for k, v in stores.items()]
        print(json.dumps(result))
        return

    if not stores:
        console.print("[dim]No file search stores tracked.[/dim]")
        return
    table = Table(title="File Search Stores")
    table.add_column("Display Name")
    table.add_column("Resource Name")
    for name, resource in stores.items():
        table.add_row(name, resource)
    console.print(table)


def cmd_clear(_args: argparse.Namespace) -> None:
    """Reset workspace state."""
    path = get_state_path()
    if not path.exists():
        console.print("[dim]No state file to clear.[/dim]")
        return

    if not _args.yes:
        if not sys.stdin.isatty():
            # Non-interactive context (e.g. AI agent): auto-accept
            pass
        else:
            console.print(f"This will delete [bold]{path}[/bold]. Use -y to skip this prompt.")
            try:
                answer = input("Continue? [y/N] ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                print()
                sys.exit(1)
            if answer not in ("y", "yes"):
                console.print("[dim]Aborted.[/dim]")
                return

    path.unlink()
    console.print("[green]Workspace state cleared.[/green]")

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="state",
        description="Manage Gemini Deep Research workspace state (.gemini-research.json)",
    )
    parser.add_argument(
        "--json", action="store_true", dest="json",
        help="Output JSON to stdout for programmatic consumption",
    )
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("show", help="Display full workspace state (default)")
    sub.add_parser("research", help="List tracked research interaction IDs")
    sub.add_parser("stores", help="List tracked file search store mappings")

    clear_p = sub.add_parser("clear", help="Reset workspace state")
    clear_p.add_argument("-y", "--yes", action="store_true", help="Skip confirmation prompt")

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    commands = {
        "show": cmd_show,
        "research": cmd_research,
        "stores": cmd_stores,
        "clear": cmd_clear,
        None: cmd_show,  # default
    }

    handler = commands.get(args.command, cmd_show)
    handler(args)


if __name__ == "__main__":
    main()
