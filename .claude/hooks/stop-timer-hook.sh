#!/bin/bash

# Stop Hook - Track session completion timing for router sessions
# Triggers when Claude finishes responding (not interrupted)

# Read hook input from stdin
input=$(cat)

# Extract Claude session variables
claude_session_id=$(echo "$input" | jq -r '.session_id')
transcript_path=$(echo "$input" | jq -r '.transcript_path')
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // false')

# Prevent infinite loops
if [ "$stop_hook_active" = "true" ]; then
    exit 0
fi

# Extract router session info
# Try environment first, fall back to finding active router by checking port files
router_session_id="${CCR_SESSION_ID}"
router_port="${CCR_SESSION_PORT}"

if [ -z "$router_session_id" ] || [ -z "$router_port" ]; then
    # Try to find router session from ~/.claude-code-router/sessions/
    sessions_dir="$HOME/.claude-code-router/sessions"
    if [ -d "$sessions_dir" ]; then
        # Find running session by checking PIDs
        for session_dir in "$sessions_dir"/*; do
            if [ -d "$session_dir" ]; then
                pid_file="$session_dir/router.pid"
                if [ -f "$pid_file" ]; then
                    pid=$(cat "$pid_file")
                    # Check if process is running
                    if kill -0 "$pid" 2>/dev/null; then
                        session_config="$session_dir/session.json"
                        if [ -f "$session_config" ]; then
                            router_session_id=$(jq -r '.sessionId' "$session_config")
                            router_port=$(jq -r '.port' "$session_config")
                            break
                        fi
                    fi
                fi
            fi
        done
    fi
fi

# Fall back to "unknown" if still not found
router_session_id="${router_session_id:-unknown}"
router_port="${router_port:-unknown}"

# Timing storage in project directory, organized by router session
timing_dir="./.claude/timings/${router_session_id}"
mkdir -p "$timing_dir"

# Read first line of transcript to get session start time
if [ -f "$transcript_path" ]; then
    first_line=$(head -n 1 "$transcript_path")
    session_start=$(echo "$first_line" | jq -r '.timestamp // empty')

    # Calculate duration
    if [ -n "$session_start" ]; then
        # Parse ISO timestamp with milliseconds (e.g., 2025-09-30T18:08:03.841Z)
        # Remove the 'Z' suffix and milliseconds for date parsing
        timestamp_clean=$(echo "$session_start" | sed 's/\.[0-9]*Z$//' | sed 's/Z$//')
        # Parse as UTC by setting TZ environment variable
        start_time=$(TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%S" "$timestamp_clean" +%s 2>/dev/null)

        if [ -n "$start_time" ]; then
            current_time=$(date +%s)
            duration=$((current_time - start_time))

            # Extract first prompt for context (from message.content)
            first_prompt=$(echo "$first_line" | jq -r '.message.content // .content[0].text // "N/A"' | head -c 100)

            # Count total turns (lines in JSONL)
            turn_count=$(wc -l < "$transcript_path" | tr -d ' ')

            # Log timing data with router context
            timing_log="$timing_dir/session-timings.jsonl"
            echo "{\"router_session_id\":\"$router_session_id\",\"router_port\":$router_port,\"claude_session_id\":\"$claude_session_id\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"duration_seconds\":$duration,\"turns\":$turn_count,\"prompt_preview\":\"$first_prompt\"}" >> "$timing_log"

            # Console output for debugging
            echo "[Timer] Router session $router_session_id (port $router_port) - Claude session $claude_session_id completed in ${duration}s (${turn_count} turns)" >&2
        fi
    fi
fi

exit 0