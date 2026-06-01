import { stringifyYaml } from "obsidian";
import type { Entity } from "./types";

/**
 * Serialize an Entity back to a full markdown file string
 * (YAML frontmatter + body).
 *
 * Determinism note: field order is insertion order from `entity.fields`,
 * with `type` always written first. Lock this down in Phase 1 before
 * anything else builds on it.
 */
export function serializeEntity(entity: Entity): string {
  const data: Record<string, unknown> = {
    type: entity.type,
    ...entity.fields,
  };
  const frontmatter = stringifyYaml(data).trimEnd();
  return `---\n${frontmatter}\n---\n${entity.body}`;
}
