# LiteAgent

[![CI](https://github.com/abilatte/LiteAgent/actions/workflows/ci.yml/badge.svg)](https://github.com/abilatte/LiteAgent/actions/workflows/ci.yml)
[![Node.js >= 20](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)

LiteAgent 是一个面向本地开发工作流的轻量级 CLI AI 编码助手。英文说明见 [README.md](./README.md)。

## 它能做什么

- 在终端中与 OpenAI 兼容模型对话
- 查看、搜索、修改当前工作区内的文件
- 在审批后执行命令
- 本地保存会话并恢复上下文
- 从 `skills/<name>/SKILL.md` 自动发现 skills
- 从配置文件加载 MCP servers，并把 `stdio` tools 桥接进运行时
- 直接在 CLI 中查看 skills、MCP、工具列表和配置来源

## 30 秒上手

前置要求：

- Node.js `>= 20`
- npm

先安装依赖：

```bash
npm install
```

在项目根目录创建 `.env`：

```env
OPENAI_API_KEY="your-api-key"
OPENAI_MODEL="gpt-5.4"
OPENAI_BASE_URL=""
ENABLE_MCP="false"
ENABLE_SKILLS="false"
```

然后启动 REPL：

```bash
npm run dev
```

启动后先输入：

```text
/help
```

## 使用分层配置

LiteAgent 当前按下面的优先级加载配置：

1. `process.env`
2. 项目级 `.env`
3. 用户级 `~/.liteagent/settings.json`

也就是说，命令行里的临时环境变量优先级最高，项目配置会覆盖用户默认值。

支持的配置项如下：

| 变量名 | 是否必填 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | 是 | 无 | OpenAI 或兼容中转站的 API Key |
| `OPENAI_MODEL` | 否 | `gpt-5.4` | 启动时使用的模型名 |
| `OPENAI_BASE_URL` | 否 | 空 | OpenAI 兼容接口地址 |
| `COMMAND_TIMEOUT_MS` | 否 | `15000` | `run_command` 的超时时间，单位毫秒 |
| `MAX_COMMAND_OUTPUT` | 否 | `12000` | `run_command` 保留的最大输出长度 |
| `ENABLE_MCP` | 否 | `false` | 启用 MCP 发现与工具注册 |
| `ENABLE_SKILLS` | 否 | `false` | 启用 skill 发现与运行时提示注入 |

如果你想设置机器级默认值，可以创建 `~/.liteagent/settings.json`：

```json
{
  "apiKey": "your-api-key",
  "model": "gpt-5.4",
  "enableMcp": true,
  "enableSkills": true
}
```

进入 REPL 后可以用 `/config-paths` 查看当前实际加载了哪些文件，以及每个配置项来自哪一层。

## 从磁盘导入 Skills

LiteAgent 只认一个标准 skill 入口：

```text
skills/
  your-skill/
    SKILL.md
```

只有 `skills/<name>/SKILL.md` 会被当作 skill 入口。目录里的其他 markdown 文件可以继续作为参考资料存在，不会被注册成独立 skill。

当前已经支持：

- `ENABLE_SKILLS=true` 时，把已发现的 skills 注入运行时提示
- 内置 `load_skill` 工具，可按名称读取 `SKILL.md`
- `liteagent skills list`
- `liteagent skills show <name>`
- REPL 内的 `/skills`

本地开发时，可以直接通过开发入口执行顶层命令：

```bash
npm run dev -- skills list
npm run dev -- skills show your-skill
```

## 从配置文件加载 MCP

LiteAgent 现在会从两层位置读取 MCP 配置：

- 用户级：`~/.liteagent/mcp.json`
- 项目级：`liteagent.mcp.json` 或 `.mcp.json`

如果同名 server 同时出现在用户级和项目级，项目级配置会覆盖用户级配置。

最小示例：

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

当前 MCP 的真实能力边界是：

- `stdio` server 可以建立连接、列出 tools，并注册进运行时 tool registry
- 注册后的 MCP 工具名称格式为 `mcp__<server>__<tool>`
- `http` 和 `sse` 配置当前只会被解析并展示状态，还不会桥接成运行时工具
- 只有 `ENABLE_MCP=true` 时，运行时才会尝试自动注册 MCP tools

如果你不想先进入 REPL，也可以直接查看 MCP 状态：

```bash
npm run dev -- mcp list
npm run dev -- mcp tools
```

进入 REPL 后则可以用 `/mcp` 查看同样的信息。

## 在 CLI 中查看运行时状态

LiteAgent 现在有两套查看入口。

REPL 内使用 slash 命令：

| 命令 | 作用 |
| --- | --- |
| `/help` | 查看帮助 |
| `/status` | 查看当前工作目录和模型 |
| `/model` | 查看当前模型 |
| `/sessions` | 查看本地会话列表 |
| `/resume [sessionId/序号]` | 恢复最近会话、指定会话 ID，或按列表序号恢复 |
| `/skills` | 查看已发现的 skills |
| `/mcp` | 查看 MCP server 状态和已注册工具 |
| `/tools` | 查看当前工具列表 |
| `/config-paths` | 查看配置文件路径和环境变量来源 |
| `/new` | 开始新会话 |
| `/exit` | 退出 CLI |

不进入 REPL 时使用顶层命令：

| 命令 | 作用 |
| --- | --- |
| `npm run dev -- skills list` | 列出已发现的 skills |
| `npm run dev -- skills show <name>` | 查看单个 skill 的入口内容 |
| `npm run dev -- mcp list` | 列出已发现的 MCP servers |
| `npm run dev -- mcp tools` | 列出支持连接的 MCP server 暴露的 tools |

## 内置工具

| 工具名 | 作用 |
| --- | --- |
| `list_files` | 列出工作区文件 |
| `grep_files` | 搜索工作区文本 |
| `read_file` | 读取工作区文件 |
| `load_skill` | 按名称读取已发现的 `SKILL.md` |
| `run_command` | 在工作区执行命令 |
| `patch_file` | 预览 diff 并在批准后写入 |
| `ask_user` | 继续向用户提问确认 |

当启用 MCP 工具注册后，LiteAgent 还可能暴露类似 `mcp__filesystem__read_file` 这样的动态工具。

## 架构概览

LiteAgent 仍然保持一个较小的运行时边界：

- [src/index.ts](./src/index.ts) 负责 CLI 启动、配置加载、session store、provider 和 tool registry
- [src/core/agent-loop.ts](./src/core/agent-loop.ts) 负责对话回合循环与工具调用路由
- [src/tools/default-tools.ts](./src/tools/default-tools.ts) 负责把内置工具装配进运行时
- [src/extensions/skill-loader.ts](./src/extensions/skill-loader.ts) 负责发现 `skills/<name>/SKILL.md`
- [src/extensions/mcp-config.ts](./src/extensions/mcp-config.ts) 负责统一解析用户级和项目级 MCP 配置
- [src/extensions/mcp-tool-bridge.ts](./src/extensions/mcp-tool-bridge.ts) 负责把可连接的 MCP tools 转成运行时工具

这样的分层依然适合 MVP，同时也给后续扩展 provider、补更多 MCP transport、增强工具系统留下了清晰边界。

## 中转站兼容性

你可以通过 `OPENAI_BASE_URL` 把 LiteAgent 指向 OpenAI 兼容中转站。

中转站至少需要支持：

- Chat Completions
- 工具调用或函数调用风格的请求
- `OPENAI_MODEL` 传入的模型名

如果你的中转站只支持 Responses API、不支持 Chat Completions，当前版本还不能直接接入。

## 安全与审批

当前版本默认偏保守：

- 文件访问限制在当前工作区内
- `run_command` 默认需要审批，只放行极少数命令
- `patch_file` 会先展示 unified diff
- 只有明确输入 `y` 才会真正写入文件

## 会话

会话默认保存在：

```text
.data/sessions/
```

你可以：

- 用 `/resume` 恢复最近会话
- 用 `/resume <sessionId>` 恢复指定会话
- 用 `/new` 开始新会话

## 当前限制

当前仓库仍然是 MVP：

- 目前只实现了 `openai` provider
- 当前使用 Chat Completions，而不是 Responses API
- 目前只有 `stdio` MCP server 能桥接成运行时工具
- 项目还没有打包成独立可执行文件，所以文档里的顶层命令示例都通过 `npm run dev -- ...` 展示

## 项目文档

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CHANGELOG.md](./CHANGELOG.md)
