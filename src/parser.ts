import { parseYaml } from "obsidian";
import type { Entity } from "./types";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const LINK_COMMENT_RE = /\n?%%se-links:[\s\S]*?%%\s*$/;

/**
 * Parse a markdown file's content into an Entity.
 * Returns null if the file has no frontmatter or no `type` field.
 * The managed %%[[se-links]]…%% comment block is stripped from the body
 * so entity.body never contains it.
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
  const body = (match[2] ?? "").replace(LINK_COMMENT_RE, "");
  const id =
    filePath
      .replace(/\.md$/, "")
      .split("/")
      .pop() ?? filePath;

  return { id, type: type as string, fields, body };
}
