/** Canonical runtime model for an entity loaded from a markdown file. */
export interface Entity {
  /** Filename without extension, derived from file path. */
  id: string;
  /** Value of the `type` YAML field — drives view routing. */
  type: string;
  /** All YAML frontmatter fields except `type`. */
  fields: Record<string, unknown>;
  /** The markdown body below the frontmatter. */
  body: string;
}
