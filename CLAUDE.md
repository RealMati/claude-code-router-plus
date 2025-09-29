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
- 无论如何你都不能自动提交git
