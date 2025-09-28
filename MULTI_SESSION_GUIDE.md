# Multi-Session Support Guide

Claude Code Router now supports running multiple concurrent sessions with different model configurations. Each session runs independently on its own port with isolated configuration.

## Overview

You can now run multiple instances of Claude Code Router simultaneously, each configured with different models/providers. This is achieved using the `CCR_MODEL_PREFERENCE` environment variable.

## Usage

### Starting a Session with a Specific Model

Use the `CCR_MODEL_PREFERENCE` environment variable to specify which model/provider to use:

```bash
# Start a session with OpenRouter's GPT-4
CCR_MODEL_PREFERENCE=openrouter/gpt-4 ccr start

# Start a session with Anthropic's Claude 3 Opus
CCR_MODEL_PREFERENCE=anthropic,claude-3-opus ccr start

# Start a session with just a model name (will find first available provider)
CCR_MODEL_PREFERENCE=gpt-4-turbo ccr start
```

### Using Claude Code with a Specific Model

Once a session is running, use the same environment variable to connect to it:

```bash
# Use GPT-4 session
CCR_MODEL_PREFERENCE=openrouter/gpt-4 ccr code "Write a function to sort an array"

# Use Claude Opus session
CCR_MODEL_PREFERENCE=anthropic,claude-3-opus ccr code "Explain quantum computing"

# Use default session (no preference)
ccr code "Hello, world!"
```

### Managing Sessions

#### View All Active Sessions
```bash
ccr sessions
```

Output:
```
Active Sessions:
================

Session ID: a3f2d8e1
Model: openrouter/gpt-4
Port: 3456
PID: 12345
Reference Count: 1

Session ID: b7c9a4f2
Model: anthropic,claude-3-opus
Port: 3457
PID: 12346
Reference Count: 2
```

#### Check Status of a Specific Session
```bash
CCR_MODEL_PREFERENCE=openrouter/gpt-4 ccr status
```

#### Stop a Specific Session
```bash
CCR_MODEL_PREFERENCE=openrouter/gpt-4 ccr stop
```

#### Restart a Specific Session
```bash
CCR_MODEL_PREFERENCE=openrouter/gpt-4 ccr restart
```

## Session Identification

Sessions are identified by a hash of the model preference string. This ensures:
- Same model preferences always connect to the same session
- Different model preferences create separate sessions
- Sessions persist across terminal sessions

## Port Allocation

- Default session starts on port 3456
- Each new session automatically finds the next available port
- Port range: 3456-3556 (100 ports available)
- Sessions remember their port allocation

## Configuration Precedence

When using `CCR_MODEL_PREFERENCE`, the routing works as follows:

1. **Environment Override**: The specified model takes precedence over config-based routing
2. **Provider Validation**: The system validates that the provider and model exist in your config
3. **Fallback**: If the specified model isn't found, it falls back to normal routing rules

## Model Preference Formats

The `CCR_MODEL_PREFERENCE` variable supports multiple formats:

### Provider and Model
```bash
# Comma-separated
CCR_MODEL_PREFERENCE=openrouter,gpt-4

# Slash-separated
CCR_MODEL_PREFERENCE=openrouter/gpt-4
```

### Model Only
```bash
# Just model name (searches all providers)
CCR_MODEL_PREFERENCE=gpt-4-turbo
```

## Session Files

Each session maintains its own files in `~/.claude-code-router/sessions/<session-id>/`:
- `session.json` - Session configuration
- `router.pid` - Process ID file
- `reference-count.txt` - Active connection count
- `router.log` - Session-specific logs

## Example Workflow

### Running Multiple Models in Parallel

Terminal 1 - GPT-4 Session:
```bash
# Start GPT-4 router
CCR_MODEL_PREFERENCE=openrouter/gpt-4-turbo ccr start

# Use GPT-4 for coding
CCR_MODEL_PREFERENCE=openrouter/gpt-4-turbo ccr code "Implement a REST API"
```

Terminal 2 - Claude Opus Session:
```bash
# Start Claude Opus router
CCR_MODEL_PREFERENCE=anthropic,claude-3-opus-20240229 ccr start

# Use Claude Opus for analysis
CCR_MODEL_PREFERENCE=anthropic,claude-3-opus-20240229 ccr code "Analyze this codebase"
```

Terminal 3 - Claude Sonnet Session:
```bash
# Start Claude Sonnet router
CCR_MODEL_PREFERENCE=anthropic,claude-3-5-sonnet-20241022 ccr start

# Use Claude Sonnet for quick tasks
CCR_MODEL_PREFERENCE=anthropic,claude-3-5-sonnet-20241022 ccr code "Fix this bug"
```

### Switching Between Sessions

You can switch between sessions in the same terminal by changing the environment variable:

```bash
# Use GPT-4
CCR_MODEL_PREFERENCE=openrouter/gpt-4 ccr code "Task 1"

# Switch to Claude
CCR_MODEL_PREFERENCE=anthropic,claude-3-opus ccr code "Task 2"

# Use default (no preference)
ccr code "Task 3"
```

## Shell Aliases (Optional)

For convenience, you can create shell aliases:

```bash
# Add to ~/.bashrc or ~/.zshrc
alias ccr-gpt4='CCR_MODEL_PREFERENCE=openrouter/gpt-4-turbo ccr'
alias ccr-opus='CCR_MODEL_PREFERENCE=anthropic,claude-3-opus-20240229 ccr'
alias ccr-sonnet='CCR_MODEL_PREFERENCE=anthropic,claude-3-5-sonnet-20241022 ccr'

# Usage
ccr-gpt4 code "Use GPT-4"
ccr-opus code "Use Claude Opus"
ccr-sonnet code "Use Claude Sonnet"
```

## Troubleshooting

### Session Not Found
If you get a "service not running" error, make sure:
1. You're using the exact same `CCR_MODEL_PREFERENCE` value
2. The session is actually running (check with `ccr sessions`)

### Port Conflicts
If all ports are in use:
1. Stop unused sessions: `ccr sessions` then `CCR_MODEL_PREFERENCE=... ccr stop`
2. Check for orphaned processes: `ps aux | grep ccr`

### Model Not Found
If the model override isn't working:
1. Check your config.json has the provider and model configured
2. Verify the spelling and format of the model preference
3. Check logs in `~/.claude-code-router/sessions/<session-id>/router.log`

## Benefits

1. **Model Comparison**: Run the same prompt against different models simultaneously
2. **Task Optimization**: Use different models for different types of tasks
3. **Cost Management**: Use expensive models only when needed
4. **A/B Testing**: Compare model outputs side by side
5. **Team Collaboration**: Different team members can use different models

## Limitations

- Maximum 100 concurrent sessions (port range limitation)
- Each session uses its own memory and resources
- Sessions are local to the machine (not shared across network)

## Best Practices

1. **Stop Unused Sessions**: Free up resources and ports
2. **Use Meaningful Preferences**: Makes it easier to remember which session is which
3. **Monitor Resources**: Each session uses separate memory
4. **Check Sessions Regularly**: Use `ccr sessions` to see what's running