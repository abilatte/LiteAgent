# 更新日志

## Unreleased

### 新增

- 支持从 `skills/<name>/SKILL.md` 发现 skills，并提供 `load_skill` 工具。
- 支持 `/skills` 与顶层 `skills list`、`skills show <name>` 管理入口。
- 支持从 `~/.liteagent/mcp.json`、`liteagent.mcp.json`、`.mcp.json` 加载 MCP 配置。
- 支持最小 `stdio` MCP client，包括 `initialize`、`tools/list`、`tools/call`。
- 支持把可连接的 MCP tools 动态注册为 `mcp__<server>__<tool>` 形式的运行时工具。
- 支持 `/mcp`、`/tools`、`/config-paths` 自检命令。
- 支持顶层 `mcp list` 与 `mcp tools` 命令。
- 支持用户级 `settings.json` 与项目级 `.env` 的分层配置加载。

### 说明

- 当前只有 `stdio` MCP server 会桥接成运行时工具。
- `http` 与 `sse` transport 当前只支持解析和状态展示。
- 当前 CLI 顶层命令示例仍通过 `npm run dev -- ...` 展示，项目尚未打包为独立二进制。
