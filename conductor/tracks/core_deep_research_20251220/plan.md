# Plan: Core Deep Research and File Search Integration

## Phase 1: Project Initialization & Infrastructure [checkpoint: c87d8ff]

- [x] Task: Set up TypeScript project structure (package.json, tsconfig.json, eslint) [9bf0ea4]
- [x] Task: Configure official MCP libraries and `@google/genai` dependency [7cf9cc3]
- [x] Task: Implement Workspace Config Manager for `.gemini-research.json` [0618255]
- [x] Task: Conductor - User Manual Verification 'Phase 1: Project Initialization & Infrastructure' (Protocol in workflow.md) [c87d8ff]

## Phase 2: File Search Management

- [ ] Task: Write tests for File Search Manager (Create, List, Delete)
- [ ] Task: Implement File Search Manager using `@google/genai`
- [ ] Task: Implement local directory scanning and file upload logic
- [ ] Task: Conductor - User Manual Verification 'Phase 2: File Search Management' (Protocol in workflow.md)

## Phase 3: Research Lifecycle Implementation

- [ ] Task: Write tests for Research Manager (Start, Status, View)
- [ ] Task: Implement `research start` command logic with asynchronous interaction creation
- [ ] Task: Implement `research status` and `research view` polling logic
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Research Lifecycle Implementation' (Protocol in workflow.md)

## Phase 4: Reporting and Final Integration

- [ ] Task: Write tests for Report Generator (Markdown formatting)
- [ ] Task: Implement `research download` command to save results as Markdown
- [ ] Task: Integrate File Search Store grounding into the `research start` command
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Reporting and Final Integration' (Protocol in workflow.md)
