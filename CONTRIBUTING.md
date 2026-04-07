# 贡献指南

感谢你愿意改进 LiteAgent。

## 开发前先准备好环境

先安装依赖：

```bash
npm install
```

如果你要本地启动 CLI，请在项目根目录准备 `.env`，至少包含：

```env
OPENAI_API_KEY="your-api-key"
OPENAI_MODEL="gpt-5.4"
```

## 提交前先跑校验

提交前至少执行：

```bash
npm run check
npm test
```

如果你改了 README、配置说明、skills、MCP 行为，记得把对应文档一起更新。

## 保持提交边界清晰

请只暂存这次任务真正相关的文件。

推荐：

```bash
git add src/index.ts src/your-file.ts
```

不推荐：

```bash
git add .
git add -A
```

LiteAgent 仓库里可能会同时存在本地测试材料、过程文档或其他临时文件。显式选择提交内容，可以避免把无关文件一起带进提交。

## Skills 和 MCP 的约定

如果你在扩展 skills，请使用：

```text
skills/
  your-skill/
    SKILL.md
```

如果你在扩展 MCP 配置，请优先复用现有配置位置：

- 用户级：`~/.liteagent/mcp.json`
- 项目级：`liteagent.mcp.json`
- 项目级：`.mcp.json`

当前只有 `stdio` transport 会被桥接成运行时工具。`http` 和 `sse` 目前仍属于“可发现、可展示、不可注册”的状态。

## 改 README 时注意什么

README 是用户第一眼看到的内容。改之前请先确认：

- 这次改动是不是已经真实落地到代码里
- 示例命令是不是当前仓库真能跑通
- 说明是不是和现有能力边界一致，没有写超前

## 提 PR 时建议说明

建议在提交说明或 PR 描述里写清楚这三件事：

- 你改了什么
- 为什么要这样改
- 你是怎么验证的
