import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { RuntimeExtensionItem } from "./base";

export type SkillEntry = RuntimeExtensionItem & {
  description?: string;
  content: string;
};

export type SkillDiscoveryResult = {
  items: SkillEntry[];
  errors: string[];
};

function parseFrontmatter(content: string): {
  name?: string;
  description?: string;
  body: string;
} {
  const normalizedContent = content.replace(/\r\n/g, "\n");

  if (!normalizedContent.startsWith("---\n")) {
    return {
      body: normalizedContent.trim(),
    };
  }

  const endIndex = normalizedContent.indexOf("\n---\n", 4);

  if (endIndex === -1) {
    return {
      body: normalizedContent.trim(),
    };
  }

  const frontmatterBlock = normalizedContent.slice(4, endIndex);
  const body = normalizedContent.slice(endIndex + 5).trim();
  const metadata = frontmatterBlock.split(/\r?\n/).reduce<Record<string, string>>((result, line) => {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex === -1) {
      return result;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key) {
      result[key] = value;
    }

    return result;
  }, {});

  return {
    name: metadata.name,
    description: metadata.description,
    body,
  };
}

function inferDescription(body: string): string | undefined {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));
}

export function readSkillEntry(entryPath: string): SkillEntry {
  const content = readFileSync(entryPath, "utf8");
  const parsed = parseFrontmatter(content);
  const skillDirectoryName = path.basename(path.dirname(entryPath));
  const description = parsed.description?.trim() || inferDescription(parsed.body);

  if (!description) {
    throw new Error(`Skill entry is missing a usable description: ${skillDirectoryName}`);
  }

  return {
    name: parsed.name?.trim() || skillDirectoryName,
    description,
    source: "skills",
    entryPath,
    content,
  };
}

export function discoverSkills(cwd: string): SkillEntry[] {
  return discoverSkillsWithErrors(cwd).items;
}

export function discoverSkillsWithErrors(cwd: string): SkillDiscoveryResult {
  const skillsRoot = path.join(cwd, "skills");

  if (!existsSync(skillsRoot)) {
    return {
      items: [],
      errors: [],
    };
  }

  const items: SkillEntry[] = [];
  const errors: string[] = [];

  for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.join(skillsRoot, entry.name, "SKILL.md");

    if (!existsSync(entryPath)) {
      continue;
    }

    try {
      items.push(readSkillEntry(entryPath));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${entry.name}: ${message}`);
    }
  }

  return {
    items,
    errors,
  };
}
