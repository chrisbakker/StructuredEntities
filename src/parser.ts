import { parseYaml } from "obsidian";
import type { Entity } from "./types";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse a markdown file's content into an Entity.
 * Returns null if the file has no frontmatter or no `type` field.
 */
export function parseEntity(filePath: string, content: string): Entity | null {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return null;

  let yaml: Record<string, unknown>;
  try {
    yaml = parseYaml(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (!yaml || typeof yaml["type"] !== "string") return null;

  const { type, ...fields } = yaml;
  const body = match[2] ?? "";
  const id =
    filePath
      .replace(/\.md$/, "")
      .split("/")
      .pop() ?? filePath;

  return { id, type: type as string, fields, body };
}
