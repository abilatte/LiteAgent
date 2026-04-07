import { formatStatusSummary } from "./display";

export type ReplState = {
  status: "idle" | "running";
  history: string[];
};

export type SlashCommandContext = {
  cwd: string;
  model: string;
  status: "idle" | "running";
  sessionId?: string;
  historyCount?: number;
};

export type SlashCommandAction =
  | {
      type: "resume-session";
      sessionId?: string;
      sessionIndex?: number;
    }
  | {
      type: "new-session";
    }
  | {
      type: "list-sessions";
    }
  | {
      type: "list-skills";
    }
  | {
      type: "list-mcp";
    }
  | {
      type: "list-tools";
    }
  | {
      type: "show-config-paths";
    };

export type SlashCommandResult = {
  handled: boolean;
  output: string;
  shouldExit: boolean;
  action?: SlashCommandAction;
};

export function createReplState(): ReplState {
  return {
    status: "idle",
    history: [],
  };
}

export function handleSlashCommand(
  command: string,
  context: SlashCommandContext,
): SlashCommandResult | null {
  const trimmedCommand = command.trim();
  const [name, ...args] = trimmedCommand.split(/\s+/);

  switch (name) {
    case "/help":
      return {
        handled: true,
        shouldExit: false,
        output: [
          "可用命令：",
          "/help - 查看帮助",
          "/status - 查看当前状态",
          "/model - 查看当前模型",
          "/sessions - 查看本地历史会话列表",
          "/skills - 查看当前已发现的 skills",
          "/mcp - 查看当前 MCP server 与工具状态",
          "/tools - 查看当前可用工具列表",
          "/config-paths - 查看当前配置来源路径",
          "/resume [sessionId|序号] - 恢复最近会话、指定会话 ID 或列表序号",
          "/new - 开始新会话",
          "/exit - 退出程序",
        ].join("\n"),
      };
    case "/status":
      return {
        handled: true,
        shouldExit: false,
        output: formatStatusSummary({
          cwd: context.cwd,
          model: context.model,
          status: context.status,
          sessionId: context.sessionId,
          historyCount: context.historyCount,
        }),
      };
    case "/model":
      return {
        handled: true,
        shouldExit: false,
        output: context.model,
      };
    case "/resume": {
      if (args.length > 1) {
        return {
          handled: true,
          shouldExit: false,
          output: "用法: /resume [sessionId|序号]",
        };
      }

      const target = args[0];

      if (!target) {
        return {
          handled: true,
          shouldExit: false,
          output: "已识别恢复最近会话请求；可先使用 /sessions 查看历史列表。",
          action: {
            type: "resume-session",
          },
        };
      }

      if (/^\d+$/.test(target)) {
        const sessionIndex = Number(target);

        if (!Number.isSafeInteger(sessionIndex) || sessionIndex < 1) {
          return {
            handled: true,
            shouldExit: false,
            output: "用法: /resume [sessionId|序号]",
          };
        }

        return {
          handled: true,
          shouldExit: false,
          output: `已识别按序号恢复会话请求: 第 ${sessionIndex} 条。`,
          action: {
            type: "resume-session",
            sessionIndex,
          },
        };
      }

      return {
        handled: true,
        shouldExit: false,
        output: `已识别恢复会话请求: ${target}`,
        action: {
          type: "resume-session",
          sessionId: target,
        },
      };
    }
    case "/sessions":
      if (args.length > 0) {
        return {
          handled: true,
          shouldExit: false,
          output: "用法: /sessions",
        };
      }

      return {
        handled: true,
        shouldExit: false,
        output: "已识别查看本地历史会话列表请求。",
        action: {
          type: "list-sessions",
        },
      };
    case "/skills":
      if (args.length > 0) {
        return {
          handled: true,
          shouldExit: false,
          output: "用法: /skills",
        };
      }

      return {
        handled: true,
        shouldExit: false,
        output: "已识别查看当前已发现 skills 请求。",
        action: {
          type: "list-skills",
        },
      };
    case "/mcp":
      if (args.length > 0) {
        return {
          handled: true,
          shouldExit: false,
          output: "用法: /mcp",
        };
      }

      return {
        handled: true,
        shouldExit: false,
        output: "已识别查看当前 MCP 状态请求。",
        action: {
          type: "list-mcp",
        },
      };
    case "/tools":
      if (args.length > 0) {
        return {
          handled: true,
          shouldExit: false,
          output: "用法: /tools",
        };
      }

      return {
        handled: true,
        shouldExit: false,
        output: "已识别查看当前可用工具列表请求。",
        action: {
          type: "list-tools",
        },
      };
    case "/config-paths":
      if (args.length > 0) {
        return {
          handled: true,
          shouldExit: false,
          output: "用法: /config-paths",
        };
      }

      return {
        handled: true,
        shouldExit: false,
        output: "已识别查看当前配置路径请求。",
        action: {
          type: "show-config-paths",
        },
      };
    case "/new":
      if (args.length > 0) {
        return {
          handled: true,
          shouldExit: false,
          output: "用法: /new",
        };
      }

      return {
        handled: true,
        shouldExit: false,
        output: "已识别新会话请求。",
        action: {
          type: "new-session",
        },
      };
    case "/exit":
      return {
        handled: true,
        shouldExit: true,
        output: "退出 LiteAgent。",
      };
    default:
      return null;
  }
}
