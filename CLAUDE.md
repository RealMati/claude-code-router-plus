# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

-   **Build the project**:
    ```bash
    npm run build
    ```
-   **Start the router server**:
    ```bash
    node ./dist/cli.js start
    ```
-   **Stop the router server**:
    ```bash
    node ./dist/cli.js stop
    ```
-   **Check the server status**:
    ```bash
    node ./dist/cli.js status
    ```
-   **Run Claude Code through the router**:
    ```bash
    node ./dist/cli.js code "<your prompt>"
    ```
-   **Release a new version**:
    ```bash
    npm run release
    ```

## Architecture

This project is a TypeScript-based router for Claude Code requests. It allows routing requests to different large language models (LLMs) from various providers based on custom rules.

-   **Entry Point**: The main command-line interface logic is in `src/cli.ts`. It handles parsing commands like `start`, `stop`, and `code`.
-   **Server**: The `node ./dist/cli.js start` command launches a server that listens for requests from Claude Code. The server logic is initiated from `src/index.ts`.
-   **Configuration**: The router is configured via a JSON file located at `~/.claude-code-router/config.json`. This file defines API providers, routing rules, and custom transformers.
-   **Routing**: The core routing logic determines which LLM provider and model to use for a given request. It supports default routes for different scenarios (`default`, `background`, `think`, `longContext`, `webSearch`) and can be extended with a custom JavaScript router file. The router logic is in `src/utils/router.ts`.
-   **Providers and Transformers**: The application supports multiple LLM providers. Transformers adapt the request and response formats for different provider APIs.
-   **Claude Code Integration**: When a user runs `node ./dist/cli.js code`, the command is forwarded to the running router service. The service then processes the request, applies routing rules, and sends it to the configured LLM. If the service isn't running, the command will attempt to start it automatically.
-   **Dependencies**: The project is built with `esbuild`. It has a key local dependency `@musistudio/llms`, which contains the core logic for interacting with different LLM APIs.
-   `@musistudio/llms` is implemented based on `fastify` and exposes `fastify`'s hook and middleware interfaces, allowing direct use of `server.addHook`.
-   **Benchmark Feature**: The UI includes a benchmark page at `/benchmark` that allows testing multiple models in parallel with git worktree support for isolated testing environments.
-   **Session Timing Tracking**: The project includes a Claude Code Stop hook that automatically tracks session completion timing. Timing data is stored in `.claude/timings/<session-id>/session-timings.jsonl` and can be viewed via the UI's Timer icon. Hook debug logs are written to `/tmp/claude-stop-hook-debug.log`.
- 无论如何你都不能自动提交git

## Session Timing Feature

The router tracks Claude Code session completion times using a project-level Stop hook:

-   **Hook Location**: `.claude/hooks/stop-timer-hook.sh`
-   **Configuration**: `.claude/settings.json` enables the Stop hook
-   **Timing Data**: Stored in `.claude/timings/<session-id>/session-timings.jsonl`
-   **Debug Logs**: Written to `/tmp/claude-stop-hook-debug.log`
-   **UI Integration**: Click the Timer icon (⏱️) in the router UI to view real-time session statistics

### Viewing Timing Data

**Via UI**:
```bash
# Open router UI and click Timer icon
http://127.0.0.1:<port>/ui/
```

**Via CLI**:
```bash
# View statistics for all sessions
./.claude/view-timings.sh

# View raw data for specific session
cat .claude/timings/<session-id>/session-timings.jsonl | jq

# Check hook debug logs
cat /tmp/claude-stop-hook-debug.log
```

### Data Format

Each timing entry includes:
```json
{
  "router_session_id": "10355052",
  "router_port": 3460,
  "claude_session_id": "abc-123",
  "timestamp": "2025-09-30T18:53:57Z",
  "duration_seconds": 5,
  "turns": 2,
  "prompt_preview": "hello!"
}
```
