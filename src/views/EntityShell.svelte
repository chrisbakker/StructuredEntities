<script lang="ts">
  import type { Entity } from "../types";

  export let entity: Entity;
  export let onUpdateField: (key: string, value: unknown) => void;
  export let onUpdateBody: (text: string) => void;

  /**
   * Local mutable copy of fields.
   * Keeps sibling sub-field edits consistent — e.g. editing `name.firstName`
   * then `name.lastName` must both survive without overwriting each other,
   * even though the `entity` prop never changes during a session.
   */
  let localFields: Record<string, unknown> = { ...entity.fields };

  function isObject(val: unknown): val is Record<string, unknown> {
    return val !== null && typeof val === "object" && !Array.isArray(val);
  }

  function isArray(val: unknown): val is unknown[] {
    return Array.isArray(val);
  }

  /** camelCase / PascalCase → "Title Case With Spaces" */
  function label(key: string): string {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }

  function strVal(val: unknown): string {
    if (val === null || val === undefined) return "";
    return String(val);
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleFlatInput(key: string, e: Event) {
    const val = (e.target as HTMLInputElement).value;
    localFields = { ...localFields, [key]: val };
    onUpdateField(key, val);
  }

  function handleNestedInput(parentKey: string, childKey: string, e: Event) {
    const current = (localFields[parentKey] as Record<string, unknown>) ?? {};
    const updated = {
      ...current,
      [childKey]: (e.target as HTMLInputElement).value,
    };
    localFields = { ...localFields, [parentKey]: updated };
    onUpdateField(parentKey, updated);
  }

  function handleBodyInput(e: Event) {
    onUpdateBody((e.target as HTMLTextAreaElement).value);
  }

  /** Get a sub-key value from a nested object field in localFields. */
  function getSubVal(parentKey: string, subKey: string): unknown {
    const obj = localFields[parentKey] as Record<string, unknown>;
    return obj?.[subKey];
  }
</script>

<div class="entity-shell">
  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <header class="entity-header">
    <span class="entity-type-badge">{entity.type}</span>
    <h1 class="entity-title">{entity.id}</h1>
  </header>

  <!-- ── Fields ──────────────────────────────────────────────────────────── -->
  <section class="entity-fields">
    {#each Object.keys(entity.fields) as key (key)}
      {@const val = localFields[key]}

      {#if isObject(val)}
        <!-- Nested object → labelled group -->
        <div class="field-group">
          <h2 class="group-label">{label(key)}</h2>
          <div class="group-rows">
            {#each Object.keys(val) as subKey (subKey)}
              {@const subVal = getSubVal(key, subKey)}
              <div class="field-row">
                <label class="field-label" for="field-{key}-{subKey}">
                  {label(subKey)}
                </label>
                <input
                  id="field-{key}-{subKey}"
                  class="field-input"
                  type="text"
                  value={strVal(subVal)}
                  on:input={(e) => handleNestedInput(key, subKey, e)}
                />
              </div>
            {/each}
          </div>
        </div>

      {:else if isArray(val)}
        <!-- Array → read-only in Phase 1 (no array mutation shape yet) -->
        <div class="field-row">
          <span class="field-label">{label(key)}</span>
          <span class="field-array">{val.join(", ")}</span>
        </div>

      {:else}
        <!-- Flat primitive -->
        <div class="field-row">
          <label class="field-label" for="field-{key}">{label(key)}</label>
          <input
            id="field-{key}"
            class="field-input"
            type="text"
            value={strVal(val)}
            on:input={(e) => handleFlatInput(key, e)}
          />
        </div>
      {/if}
    {/each}
  </section>

  <!-- ── Notes body ──────────────────────────────────────────────────────── -->
  <section class="entity-body">
    <label class="field-label body-label" for="entity-body">Notes</label>
    <textarea
      id="entity-body"
      class="body-editor"
      value={entity.body}
      on:input={handleBodyInput}
    />
  </section>
</div>

<style>
  .entity-shell {
    padding: 1.5rem 2rem;
    max-width: 760px;
    margin: 0 auto;
    box-sizing: border-box;
  }

  /* ── Header ── */
  .entity-header {
    margin-bottom: 1.75rem;
  }

  .entity-type-badge {
    display: inline-block;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
    color: var(--text-muted);
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 3px;
    padding: 0.15rem 0.5rem;
    margin-bottom: 0.5rem;
  }

  .entity-title {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--text-normal);
    line-height: 1.2;
  }

  /* ── Field layout ── */
  .entity-fields {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.75rem;
  }

  /* Flat row: label + input side by side */
  .field-row {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 0.75rem;
    align-items: center;
  }

  .field-label {
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--text-muted);
    text-align: right;
    user-select: none;
    white-space: nowrap;
  }

  .field-input {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 0.3rem 0.5rem;
    font-size: 0.875rem;
    color: var(--text-normal);
    width: 100%;
    box-sizing: border-box;
    font-family: inherit;
    transition: border-color 0.1s;
  }

  .field-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    background: var(--background-primary);
  }

  .field-array {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-style: italic;
  }

  /* ── Nested object group ── */
  .field-group {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 0.75rem;
    align-items: start;
    margin-top: 0.5rem;
  }

  .group-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted);
    text-align: right;
    margin: 0;
    padding-top: 0.35rem;
    user-select: none;
    line-height: 1.3;
  }

  .group-rows {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    border-left: 2px solid var(--background-modifier-border);
    padding-left: 0.75rem;
  }

  /* Sub-rows inside a group use a tighter label column */
  .group-rows .field-row {
    grid-template-columns: 100px 1fr;
    gap: 0.5rem;
  }

  /* ── Notes body ── */
  .entity-body {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .body-label {
    text-align: left !important;
  }

  .body-editor {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 0.5rem 0.6rem;
    font-size: 0.875rem;
    color: var(--text-normal);
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    font-family: var(--font-monospace);
    min-height: 140px;
    line-height: 1.5;
    transition: border-color 0.1s;
  }

  .body-editor:focus {
    outline: none;
    border-color: var(--interactive-accent);
    background: var(--background-primary);
  }
</style>
