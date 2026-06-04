import { stringifyYaml } from "obsidian";
import type { Entity } from "./types";

const LINK_COMMENT_RE = /\n?%%se-links:[\s\S]*?%%\s*$/;

/**
 * Collect all personId string values from any array-of-objects fields.
 */
function collectPersonIds(fields: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const value of Object.values(fields)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && "personId" in item) {
          const pid = (item as Record<string, unknown>).personId;
          if (typeof pid === "string" && pid.trim()) ids.push(pid);
        }
      }
    }
  }
  return ids;
}

/**
 * Serialize an Entity back to a full markdown file string
 * (YAML frontmatter + body).
 *
 * A managed %% [[se-links]] ... %% comment block is appended to the body
 * containing [[wikilinks]] for every personId. Obsidian indexes these as
 * outbound links (and therefore inbound on the person side) while the %%
 * markers hide them from preview. The parser strips this block on load so
 * entity.body never contains it.
 */
export function serializeEntity(entity: Entity): string {
  const data: Record<string, unknown> = {
    type: entity.type,
    ...entity.fields,
  };
  const frontmatter = stringifyYaml(data).trimEnd();

  const personIds = collectPersonIds(entity.fields);
  const bodyBase = entity.body.replace(LINK_COMMENT_RE, "").trimEnd();
  let body = bodyBase;
  if (personIds.length > 0) {
    const links = personIds.map((id) => `[[${id}]]`).join(" ");
    body = (bodyBase.length > 0 ? bodyBase + "\n" : "") + `\n%%se-links: ${links} %%`;
  }

  return `---\n${frontmatter}\n---\n${body}`;
}
