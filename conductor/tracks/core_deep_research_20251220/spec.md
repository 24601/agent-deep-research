# Specification: Core Deep Research and File Search Integration

## Overview
This track implements the foundational capabilities for the Gemini CLI Deep Research extension. It enables users to initiate complex research tasks, monitor their progress, manage file search databases for grounding, and save final reports as Markdown files.

## User Stories
- **Initiate Research:** `research start "prompt"` starts a new asynchronous task.
- **Check Status:** `research status <id>` returns the current state (e.g., thinking, completed, failed).
- **Download Report:** `research download <id>` saves the finished report to the workspace as `<id>.md`.
- **View Findings:** `research view <id>` displays a summary in the terminal.
- **Manage File Search:**
    - `file-search create <name> <directory>` creates a new store from local files.
    - `file-search list` lists available stores.
    - `file-search delete <name>` removes a store.

## Technical Architecture

### 1. Research Lifecycle Manager
- **Interaction Creation:** Uses `@google/genai` to create an `Interaction` with the Deep Research model.
- **Asynchronous Handling:** Stores the Interaction ID and provides polling mechanisms.
- **Status Mapping:** Maps API status to user-friendly CLI feedback.

### 2. File Search Integration
- **Store Management:** Uses the `file_search` tool API to manage `fileSearchStores`.
- **Directory Scanning:** Scans local directories to upload files to the specified store.
- **API Mapping:** Interfaces with `google.ai.generativelanguage.v1beta.FileSearchService`.

### 3. Workspace Configuration
- **Persistence:** Stores research IDs and local settings in a `.gemini-research.json` file within the current directory.
- **Database Mapping:** Tracks which local stores are associated with the current workspace.

### 4. Reporting Engine
- **Markdown Generation:** Transforms the model's final response into a structured Markdown report with Executive Summary, Findings, and Citations.

## Constraints & Assumptions
- Requires a Gemini 1.5 Pro or newer model with Deep Research capabilities enabled.
- File search is currently an experimental API feature.
- Research tasks are long-running (minutes to hours).

## Success Criteria
- [ ] User can successfully start a research task.
- [ ] User can create a file search store from a local directory.
- [ ] Research task can be grounded using the created file search store.
- [ ] Final report is correctly downloaded and formatted as Markdown.
- [ ] Status command accurately reflects the agent's progress.
