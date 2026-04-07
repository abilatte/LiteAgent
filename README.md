# LiteAgent

[![CI](https://github.com/abilatte/LiteAgent/actions/workflows/ci.yml/badge.svg)](https://github.com/abilatte/LiteAgent/actions/workflows/ci.yml)
[![Node.js >= 20](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)

LiteAgent is a lightweight CLI AI coding assistant for local development workflows. For Chinese documentation, see [README.zh-CN.md](./README.zh-CN.md).

## What It Does

- chat with an OpenAI-compatible model in the terminal
- inspect, search, and patch files inside the current workspace
- run shell commands with approval
- save sessions locally and resume them later
- discover skills from `skills/<name>/SKILL.md`
- load MCP servers from config files and bridge `stdio` tools into the runtime
- inspect skills, MCP servers, tools, and config sources from the CLI

## 30-Second Start

Requirements:

- Node.js `>= 20`
- npm

Run:

```bash
npm install
```

Create `.env` in the project root:

```env
OPENAI_API_KEY="your-api-key"
OPENAI_MODEL="gpt-5.4"
OPENAI_BASE_URL=""
ENABLE_MCP="false"
ENABLE_SKILLS="false"
```

Then start the REPL:

```bash
npm run dev
```

And check the available commands:

```text
/help
```

## Use layered configuration

LiteAgent loads configuration in this order:

1. `process.env`
2. project `.env`
3. `~/.liteagent/settings.json`

That means shell variables override project config, and project config overrides user defaults.

The supported keys are:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Yes | None | API key for OpenAI or an OpenAI-compatible relay |
| `OPENAI_MODEL` | No | `gpt-5.4` | Model name used at startup |
| `OPENAI_BASE_URL` | No | Empty | Base URL for an OpenAI-compatible endpoint |
| `COMMAND_TIMEOUT_MS` | No | `15000` | Timeout for `run_command`, in milliseconds |
| `MAX_COMMAND_OUTPUT` | No | `12000` | Maximum preserved command output length |
| `ENABLE_MCP` | No | `false` | Enable MCP discovery and tool registration |
| `ENABLE_SKILLS` | No | `false` | Enable skill discovery in the runtime prompt |

If you want machine-wide defaults, create `~/.liteagent/settings.json`:

```json
{
  "apiKey": "your-api-key",
  "model": "gpt-5.4",
  "enableMcp": true,
  "enableSkills": true
}
```

Use `/config-paths` inside the REPL to see which files were loaded and where each setting came from.

## Import skills from disk

LiteAgent treats only one file as a skill entry:

```text
skills/
  your-skill/
    SKILL.md
```

`skills/<name>/SKILL.md` is the entry point. Other markdown files can stay in the same directory as references and will not be registered as separate skills.

Current skill support includes:

- runtime discovery for the system prompt when `ENABLE_SKILLS=true`
- the built-in `load_skill` tool for loading a skill file by name
- `liteagent skills list`
- `liteagent skills show <name>`
- `/skills` inside the REPL

For local development, run the non-interactive commands through the dev entry:

```bash
npm run dev -- skills list
npm run dev -- skills show your-skill
```

## Load MCP servers from config

LiteAgent reads MCP config from two layers:

- user level: `~/.liteagent/mcp.json`
- project level: `liteagent.mcp.json` or `.mcp.json`

If the same server name exists in both places, the project-level config wins.

Minimal example:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

Current MCP behavior:

- `stdio` servers can connect, list tools, and register tools into the runtime registry
- registered MCP tools use the name format `mcp__<server>__<tool>`
- `http` and `sse` configs are parsed and shown in status output, but they are not bridged into runtime tools yet
- `ENABLE_MCP=true` is required for runtime tool registration

You can inspect MCP state without entering the REPL:

```bash
npm run dev -- mcp list
npm run dev -- mcp tools
```

You can also inspect it inside the REPL with `/mcp`.

## Inspect runtime state from the CLI

LiteAgent now has two ways to inspect runtime state.

Use slash commands inside the REPL:

| Command | Purpose |
| --- | --- |
| `/help` | Show command help |
| `/status` | Show current working directory and model |
| `/model` | Show the active model |
| `/sessions` | List local saved sessions |
| `/resume [sessionId/index]` | Resume the latest session, a specific session ID, or a session by list index |
| `/skills` | Show discovered skills |
| `/mcp` | Show MCP server status and registered tools |
| `/tools` | Show the current tool list |
| `/config-paths` | Show config file paths and env sources |
| `/new` | Start a new session |
| `/exit` | Exit the CLI |

Use top-level commands when you just want a quick check:

| Command | Purpose |
| --- | --- |
| `npm run dev -- skills list` | List discovered skills |
| `npm run dev -- skills show <name>` | Show one skill entry |
| `npm run dev -- mcp list` | List discovered MCP servers |
| `npm run dev -- mcp tools` | List tools exposed by supported MCP servers |

## Built-in tools

| Tool | Purpose |
| --- | --- |
| `list_files` | List files in the workspace |
| `grep_files` | Search text in the workspace |
| `read_file` | Read a workspace file |
| `load_skill` | Read a discovered `SKILL.md` entry by name |
| `run_command` | Execute a command in the workspace |
| `patch_file` | Preview a diff and write after approval |
| `ask_user` | Ask a follow-up question |

When MCP registration is enabled, LiteAgent may also expose dynamic tools named like `mcp__filesystem__read_file`.

## Architecture

LiteAgent keeps the runtime intentionally small:

- [src/index.ts](./src/index.ts) boots the CLI, configuration, session store, provider, and tool registry
- [src/core/agent-loop.ts](./src/core/agent-loop.ts) runs the assistant turn loop and routes tool calls
- [src/tools/default-tools.ts](./src/tools/default-tools.ts) wires the built-in workspace tools into the runtime
- [src/extensions/skill-loader.ts](./src/extensions/skill-loader.ts) discovers `skills/<name>/SKILL.md`
- [src/extensions/mcp-config.ts](./src/extensions/mcp-config.ts) normalizes user and project MCP config
- [src/extensions/mcp-tool-bridge.ts](./src/extensions/mcp-tool-bridge.ts) turns supported MCP tools into runtime tools

This layout keeps the MVP readable while leaving clear seams for more providers, richer MCP transports, and additional tooling.

## Relay compatibility

You can point LiteAgent to an OpenAI-compatible relay by setting `OPENAI_BASE_URL`.

Your relay should support:

- Chat Completions
- tool calling or function-calling style payloads
- the model name passed through `OPENAI_MODEL`

If your relay only supports the Responses API and not Chat Completions, the current version will not work with it yet.

## Safety

The current version is intentionally conservative:

- file access stays inside the current workspace
- `run_command` is approval-gated except for a very small allowlist
- `patch_file` shows a unified diff before writing
- only explicit `y` approval allows a write

## Sessions

Sessions are stored locally under:

```text
.data/sessions/
```

You can:

- continue the latest session with `/resume`
- continue a specific session with `/resume <sessionId>`
- start a fresh session with `/new`

## Limitations

This repository is still an MVP:

- only the `openai` provider is implemented
- Chat Completions is used instead of the Responses API
- only `stdio` MCP servers can be bridged into runtime tools today
- the project is not packaged as a standalone binary yet, so top-level commands are shown through `npm run dev -- ...`

## Project docs

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CHANGELOG.md](./CHANGELOG.md)
