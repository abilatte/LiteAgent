import type { ToolDefinition } from "./tool-types";

export function createToolRegistry() {
  const tools = new Map<string, ToolDefinition>();

  return {
    register(tool: ToolDefinition) {
      tools.set(tool.name, tool);
    },
    registerMany(toolList: ToolDefinition[]) {
      for (const tool of toolList) {
        tools.set(tool.name, tool);
      }
    },
    get(name: string) {
      return tools.get(name);
    },
    list() {
      return [...tools.values()];
    },
  };
}
