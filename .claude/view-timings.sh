#!/bin/bash

# View timing statistics for router sessions

timings_dir="./.claude/timings"

if [ ! -d "$timings_dir" ]; then
    echo "No timing data found yet."
    exit 0
fi

echo "=== Router Session Timings ==="
echo ""

# List all router sessions with timing data
for session_dir in "$timings_dir"/*; do
    if [ -d "$session_dir" ]; then
        session_id=$(basename "$session_dir")
        timing_file="$session_dir/session-timings.jsonl"

        if [ -f "$timing_file" ]; then
            echo "📊 Router Session: $session_id"

            # Get session port
            port=$(head -n 1 "$timing_file" | jq -r '.router_port')
            echo "   Port: $port"

            # Count total Claude sessions
            total_sessions=$(wc -l < "$timing_file" | tr -d ' ')
            echo "   Total Claude sessions: $total_sessions"

            # Calculate average duration
            avg_duration=$(cat "$timing_file" | jq -s 'map(.duration_seconds) | add / length')
            echo "   Average duration: ${avg_duration}s"

            # Find min/max
            min_duration=$(cat "$timing_file" | jq -s 'map(.duration_seconds) | min')
            max_duration=$(cat "$timing_file" | jq -s 'map(.duration_seconds) | max')
            echo "   Min/Max duration: ${min_duration}s / ${max_duration}s"

            # Show recent sessions
            echo ""
            echo "   Recent sessions:"
            cat "$timing_file" | jq -r '"   - \(.timestamp) | \(.duration_seconds)s | \(.turns) turns | \(.prompt_preview[0:60])..."' | tail -5

            echo ""
            echo "---"
            echo ""
        fi
    fi
done

echo ""
echo "To view raw data for a specific router session:"
echo "  cat .claude/timings/<session_id>/session-timings.jsonl | jq"
echo ""
echo "To export all timing data:"
echo "  find .claude/timings -name 'session-timings.jsonl' -exec cat {} \; | jq -s"
