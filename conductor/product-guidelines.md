# Product Guidelines: Gemini CLI Deep Research Extension

## Tone and Voice
- **Professional & Authoritative:** The CLI output and final reports should be objective, credible, and formal.
- **Concise:** Avoid fluff. Focus on delivering high-density information.

## User Interaction Model
- **Asynchronous Workflow:** 
    - **Initiate:** A command to kick off the research task.
    - **Monitor:** A separate command to poll/check the status of ongoing research.
    - **Deliver:** Final output is written to a file, not just dumped to stdout.
- **Minimalist UI:** CLI output should be clean, text-based, and avoid excessive colors or ASCII art (`Minimalist`).

## Output Standards
- **Format:** Research results are saved as Markdown files.
- **Structure:** Reports should follow a standard structure:
    1.  **Executive Summary:** High-level overview.
    2.  **Findings:** Detailed analysis and data.
    3.  **Citations:** Sources and references.
- **Future-Proofing:** While currently standard, the architecture should allow for future template customization.

## Error Handling
- Clear, actionable error messages if research fails or the API is unreachable.
- Graceful handling of file system permissions and network interruptions.
