<script lang="ts">
  import type { Entity } from "../../../src/types";
  import NotesEditor from "../../../src/components/NotesEditor.svelte";

  export let entity: Entity;
  export let onUpdateField: (key: string, value: unknown) => void;
  export let onUpdateBody: (text: string) => void;
  export let onAttachFile: (data: ArrayBuffer, ext: string) => Promise<string>;
  export let resolveAssetPath: (vaultPath: string) => string;
  export let renderMarkdown: (markdown: string, el: HTMLElement) => Promise<void>;
  export let openLink: (href: string, newLeaf: boolean) => void;
  export let getSuggestions: (query: string) => string[];
  export let onCreateEntity: (type: string, name: string) => Promise<string>;

  // ── Types ──────────────────────────────────────────────────────────────────

  type Ingredient = { amount: string; unit: string; name: string };
  type Step = { text: string; photo?: string };

  type RecipeFields = {
    title?: string;
    description?: string;
    photo?: string;
    servings?: string;
    prepTime?: string;
    cookTime?: string;
    calories?: string;
    carbs?: string;
    tags?: string[];
    ingredients?: Ingredient[];
    steps?: Step[];
  };

  let f: RecipeFields = (entity.fields as RecipeFields) ?? {};

  // ── Helpers ────────────────────────────────────────────────────────────────

  function str(val: unknown): string {
    if (val === null || val === undefined) return "";
    return String(val);
  }

  function setFlat(key: keyof RecipeFields, e: Event) {
    const val = (e.target as HTMLInputElement).value;
    f = { ...f, [key]: val };
    onUpdateField(key, val);
  }

  // ── Tags ───────────────────────────────────────────────────────────────────

  let tags: string[] = Array.isArray(f.tags) ? [...f.tags] : [];
  let tagInput = "";

  function pushTags() {
    f = { ...f, tags };
    onUpdateField("tags", tags);
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      tags = [...tags, t];
      pushTags();
    }
    tagInput = "";
  }

  function removeTag(i: number) {
    tags = tags.filter((_, idx) => idx !== i);
    pushTags();
  }

  function handleTagKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  // ── Hero photo ─────────────────────────────────────────────────────────────

  let photoInput: HTMLInputElement;

  async function handlePhotoChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop() ?? "jpg";
    const data = await file.arrayBuffer();
    const path = await onAttachFile(data, ext);
    f = { ...f, photo: path };
    onUpdateField("photo", path);
  }

  // ── Ingredients ────────────────────────────────────────────────────────────

  let ingredients: Ingredient[] = Array.isArray(f.ingredients)
    ? f.ingredients.map((i) => ({ amount: str(i.amount), unit: str(i.unit), name: str(i.name) }))
    : [];

  function pushIngredients() {
    onUpdateField("ingredients", ingredients);
  }

  function addIngredient() {
    ingredients = [...ingredients, { amount: "", unit: "", name: "" }];
    pushIngredients();
  }

  function removeIngredient(i: number) {
    ingredients = ingredients.filter((_, idx) => idx !== i);
    pushIngredients();
  }

  function setIngredient(i: number, key: keyof Ingredient, e: Event) {
    const val = (e.target as HTMLInputElement).value;
    const next = ingredients.slice();
    next[i] = { ...next[i], [key]: val };
    ingredients = next;
    pushIngredients();
  }

  // ── Steps ──────────────────────────────────────────────────────────────────

  let steps: Step[] = Array.isArray(f.steps)
    ? f.steps.map((s) => ({ text: str(s.text), photo: str(s.photo) || undefined }))
    : [];

  function pushSteps() {
    onUpdateField("steps", steps);
  }

  function addStep() {
    steps = [...steps, { text: "" }];
    pushSteps();
  }

  function removeStep(i: number) {
    steps = steps.filter((_, idx) => idx !== i);
    pushSteps();
  }

  function setStepText(i: number, e: Event) {
    const val = (e.target as HTMLTextAreaElement).value;
    const next = steps.slice();
    next[i] = { ...next[i], text: val };
    steps = next;
    pushSteps();
  }

  let stepsContainerEl: HTMLOListElement;

  function triggerStepPhotoInput(i: number) {
    const attr = `[data-step-photo="${i}"]`;
    const input = stepsContainerEl?.querySelector(attr) as HTMLInputElement | null;
    input?.click();
  }

  async function handleStepPhotoChange(i: number, e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop() ?? "jpg";
    const data = await file.arrayBuffer();
    const path = await onAttachFile(data, ext);
    const next = steps.slice();
    next[i] = { ...next[i], photo: path };
    steps = next;
    pushSteps();
  }

  function removeStepPhoto(i: number) {
    const next = steps.slice();
    next[i] = { ...next[i], photo: undefined };
    steps = next;
    pushSteps();
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  let body = entity.body ?? "";

  // ── Step textarea auto-grow ────────────────────────────────────────────────

  function autoGrow(ta: HTMLTextAreaElement) {
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }

  function autoGrowAction(ta: HTMLTextAreaElement) {
    autoGrow(ta);
    const handler = () => autoGrow(ta);
    ta.addEventListener('input', handler);
    return { destroy() { ta.removeEventListener('input', handler); } };
  }
</script>

<div class="recipe-view">

  <!-- ── Hero photo + title ─────────────────────────────────────────────── -->
  <header class="recipe-header">
    <div class="recipe-photo-area">
      {#if f.photo}
        <img
          src={resolveAssetPath(str(f.photo))}
          alt={str(f.title)}
          class="recipe-hero"
        />
        <button class="photo-remove-btn" title="Remove photo"
          on:click={() => { f = { ...f, photo: '' }; onUpdateField('photo', ''); }}>&#x2715;</button>
      {:else}
        <button class="photo-placeholder" on:click={() => photoInput?.click()}>
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span>Add photo</span>
        </button>
      {/if}
      <input bind:this={photoInput} type="file" accept="image/*"
        style="display:none" on:change={handlePhotoChange} />
    </div>

    <div class="recipe-title-area">
      <input
        class="recipe-title-input"
        type="text"
        placeholder="Recipe title"
        value={str(f.title)}
        on:input={(e) => setFlat("title", e)}
        on:keydown|stopPropagation
      />

      <textarea
        class="recipe-description"
        placeholder="Short description…"
        on:input={(e) => setFlat('description', e)}
        on:keydown|stopPropagation
        use:autoGrowAction
        rows="2"
      >{str(f.description)}</textarea>

      <div class="recipe-meta-row">
        <div class="meta-field">
          <label class="meta-label" for="rv-servings">Servings</label>
          <input id="rv-servings" class="meta-input" type="text"
            placeholder="e.g. 4"
            value={str(f.servings)}
            on:input={(e) => setFlat("servings", e)}
            on:keydown|stopPropagation />
        </div>

        <div class="meta-grid">
          <label class="meta-label" for="rv-prepTime">Prep</label>
          <input id="rv-prepTime" class="meta-input" type="text"
            placeholder="e.g. 15 min"
            value={str(f.prepTime)}
            on:input={(e) => setFlat("prepTime", e)}
            on:keydown|stopPropagation />
          <label class="meta-label" for="rv-calories">Cal</label>
          <input id="rv-calories" class="meta-input meta-input--narrow" type="text"
            placeholder="kcal"
            value={str(f.calories)}
            on:input={(e) => setFlat('calories', e)}
            on:keydown|stopPropagation />

          <label class="meta-label" for="rv-cookTime">Cook</label>
          <input id="rv-cookTime" class="meta-input" type="text"
            placeholder="e.g. 30 min"
            value={str(f.cookTime)}
            on:input={(e) => setFlat("cookTime", e)}
            on:keydown|stopPropagation />
          <label class="meta-label" for="rv-carbs">Carbs</label>
          <input id="rv-carbs" class="meta-input meta-input--narrow" type="text"
            placeholder="g"
            value={str(f.carbs)}
            on:input={(e) => setFlat('carbs', e)}
            on:keydown|stopPropagation />
        </div>
      </div>

      <!-- Tags -->
      <div
        class="tags-editor"
        role="group"
        aria-label="Tags"
        on:click={() => document.getElementById("rv-tag-input")?.focus()}
        on:keydown={() => {}}
      >
        {#each tags as tag, i}
          <span class="tag-pill">
            {tag}
            <button class="tag-remove" on:click|stopPropagation={() => removeTag(i)}
              aria-label="Remove tag {tag}">×</button>
          </span>
        {/each}
        <input
          id="rv-tag-input"
          class="tag-input"
          type="text"
          placeholder={tags.length === 0 ? "Add tags…" : ""}
          bind:value={tagInput}
          on:keydown={handleTagKeydown}
          on:blur={addTag}
        />
      </div>
    </div>
  </header>

  <div class="recipe-body">

    <!-- ── Ingredients ──────────────────────────────────────────────────── -->
    <section class="recipe-section">
      <div class="section-header">
        <h2 class="section-label">Ingredients</h2>
        <button class="add-btn" on:click={addIngredient}>+ Add</button>
      </div>

      {#if ingredients.length === 0}
        <p class="empty-hint">No ingredients yet.</p>
      {:else}
        <div class="ingredient-list">
          <div class="ingredient-header-row">
            <span class="col-amount">Amount</span>
            <span class="col-unit">Unit</span>
            <span class="col-name">Ingredient</span>
          </div>
          {#each ingredients as ing, i}
            <div class="ingredient-row">
              <input class="ing-input col-amount" type="text" placeholder="2"
                value={ing.amount}
                on:input={(e) => setIngredient(i, "amount", e)}
                on:keydown|stopPropagation />
              <input class="ing-input col-unit" type="text" placeholder="cups"
                value={ing.unit}
                on:input={(e) => setIngredient(i, "unit", e)}
                on:keydown|stopPropagation />
              <input class="ing-input col-name" type="text" placeholder="flour"
                value={ing.name}
                on:input={(e) => setIngredient(i, "name", e)}
                on:keydown|stopPropagation />
              <button class="remove-btn" on:click={() => removeIngredient(i)} title="Remove">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- ── Instructions ─────────────────────────────────────────────────── -->
    <section class="recipe-section">
      <div class="section-header">
        <h2 class="section-label">Instructions</h2>
        <button class="add-btn" on:click={addStep}>+ Add step</button>
      </div>

      {#if steps.length === 0}
        <p class="empty-hint">No steps yet.</p>
      {:else}
        <ol class="step-list" bind:this={stepsContainerEl}>
          {#each steps as step, i}
            <li class="step-item">
              <div class="step-number">{i + 1}</div>
              <div class="step-content">
                <textarea
                  class="step-textarea"
                  placeholder="Describe this step…"
                  value={step.text}
                  on:input={(e) => setStepText(i, e)}
                  on:keydown|stopPropagation
                  use:autoGrowAction
                />
                {#if step.photo}
                  <div class="step-photo-wrapper">
                    <img src={resolveAssetPath(step.photo)} alt="Step {i + 1}" class="step-photo" />
                    <button class="step-photo-remove" title="Remove photo"
                      on:click={() => removeStepPhoto(i)}>✕</button>
                  </div>
                {:else}
                  <button class="step-photo-add"
                    on:click={() => triggerStepPhotoInput(i)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    Add photo
                  </button>
                {/if}
                <input
                  data-step-photo={i}
                  type="file"
                  accept="image/*"
                  style="display:none"
                  on:change={(e) => handleStepPhotoChange(i, e)}
                />
              </div>
              <button class="remove-btn step-remove" on:click={() => removeStep(i)} title="Remove step">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </li>
          {/each}
        </ol>
      {/if}
    </section>

    <!-- ── Notes ────────────────────────────────────────────────────────── -->
    <section class="recipe-section">
      <h2 class="section-label">Notes</h2>
      <NotesEditor
        {body}
        {onUpdateBody}
        {getSuggestions}
        {openLink}
        {renderMarkdown}
        placeholder="Additional notes, tips, variations…"
      />
    </section>

  </div>
</div>

<style>
  .recipe-view {
    padding: 1.5rem 2rem;
    max-width: 760px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  /* ── Header ── */
  .recipe-header {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
  }

  .recipe-photo-area {
    position: relative;
    flex-shrink: 0;
    width: 200px;
    height: 150px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
  }

  .recipe-hero {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .photo-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    background: transparent;
    border: none;
    color: var(--text-faint);
    cursor: pointer;
    font-size: 0.78rem;
    transition: color 0.1s;
  }

  .photo-placeholder:hover {
    color: var(--text-muted);
  }

  .photo-remove-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    background: rgba(0,0,0,0.55);
    color: #fff;
    border: none;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    font-size: 0.7rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    line-height: 1;
    padding: 0;
  }

  .recipe-title-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
  }

  .recipe-title-input {
    font-size: 1.4rem;
    font-weight: 700;
    background: transparent;
    border: none;
    border-bottom: 2px solid var(--background-modifier-border);
    border-radius: 0;
    color: var(--text-normal);
    padding: 0.1rem 0;
    width: 100%;
    font-family: inherit;
    transition: border-color 0.1s;
  }

  .recipe-title-input:focus {
    outline: none;
    border-bottom-color: var(--interactive-accent);
  }

  .recipe-description {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 0.9rem;
    font-family: inherit;
    line-height: 1.4;
    padding: 0;
    resize: none;
    width: 100%;
    overflow: hidden;
  }

  .recipe-description:focus {
    outline: none;
    color: var(--text-normal);
  }

  .recipe-meta-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .meta-field {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    white-space: nowrap;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: auto auto auto auto;
    column-gap: 0.4rem;
    row-gap: 0.3rem;
    align-items: center;
  }

  .meta-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .meta-input {
    font-size: 0.85rem;
    padding: 0.2rem 0.45rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-normal);
    width: 90px;
    font-family: inherit;
    transition: border-color 0.1s;
  }

  .meta-input--narrow {
    width: 60px;
  }

  .meta-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    background: var(--background-primary);
  }

  /* ── Tags ── */
  .tags-editor {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 0.2rem 0.4rem;
    min-height: 28px;
    cursor: text;
    transition: border-color 0.1s;
  }

  .tags-editor:focus-within {
    border-color: var(--interactive-accent);
    background: var(--background-primary);
  }

  .tag-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-radius: 3px;
    padding: 0.1rem 0.35rem;
    font-size: 0.78rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .tag-remove {
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    display: flex;
    align-items: center;
  }

  .tag-remove:hover { opacity: 1; }

  .tag-input {
    border: none;
    outline: none;
    background: transparent;
    font-size: 0.875rem;
    color: var(--text-normal);
    font-family: inherit;
    min-width: 80px;
    flex: 1;
    padding: 0.1rem 0.15rem;
  }

  .tag-input::placeholder { color: var(--text-faint); }

  /* ── Body layout ── */
  .recipe-body {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  /* ── Section ── */
  .recipe-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-label {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-muted);
    margin: 0;
  }

  .add-btn {
    font-size: 0.78rem;
    padding: 0.18rem 0.6rem;
    background: transparent;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
  }

  .add-btn:hover {
    color: var(--interactive-accent);
    border-color: var(--interactive-accent);
  }

  .empty-hint {
    font-size: 0.85rem;
    color: var(--text-faint);
    margin: 0;
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-faint);
    cursor: pointer;
    padding: 0.15rem;
    border-radius: 3px;
    transition: color 0.1s;
    flex-shrink: 0;
  }

  .remove-btn:hover { color: var(--text-error, #e05252); }

  /* ── Ingredients ── */
  .ingredient-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    overflow: hidden;
  }

  .ingredient-header-row,
  .ingredient-row {
    display: grid;
    grid-template-columns: 80px 90px 1fr 24px;
    align-items: center;
    gap: 0;
  }

  .ingredient-header-row {
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
    padding: 0.25rem 0.5rem;
  }

  .ingredient-header-row span {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0 0.3rem;
  }

  .ingredient-row {
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
  }

  .ingredient-row:last-child { border-bottom: none; }

  .ingredient-row:nth-child(even) {
    background: var(--background-secondary);
  }

  .ing-input {
    background: transparent;
    border: none;
    border-right: 1px solid var(--background-modifier-border);
    padding: 0.35rem 0.5rem;
    font-size: 0.875rem;
    color: var(--text-normal);
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
    transition: background 0.1s;
  }

  .ing-input:last-of-type {
    border-right: none;
  }

  .ing-input:focus {
    outline: none;
    background: var(--background-primary-alt);
  }

  /* ── Steps ── */
  .step-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .step-item {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 0.75rem;
  }

  .step-number {
    flex-shrink: 0;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.78rem;
    font-weight: 700;
    margin-top: 0.1rem;
  }

  .step-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .step-textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 0.4rem 0.55rem;
    font-size: 0.875rem;
    color: var(--text-normal);
    font-family: inherit;
    line-height: 1.55;
    resize: none;
    overflow: hidden;
    min-height: 60px;
    transition: border-color 0.1s;
  }

  .step-textarea:focus {
    outline: none;
    border-color: var(--interactive-accent);
    background: var(--background-primary);
  }

  .step-photo-wrapper {
    position: relative;
    display: inline-block;
    max-width: 240px;
    border-radius: 4px;
    overflow: hidden;
  }

  .step-photo {
    display: block;
    width: 100%;
    border-radius: 4px;
    object-fit: cover;
    max-height: 160px;
  }

  .step-photo-remove {
    position: absolute;
    top: 4px;
    right: 4px;
    background: rgba(0,0,0,0.55);
    color: #fff;
    border: none;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    font-size: 0.7rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .step-photo-add {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
    background: transparent;
    border: 1px dashed var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-faint);
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
    align-self: flex-start;
  }

  .step-photo-add:hover {
    color: var(--text-muted);
    border-color: var(--text-muted);
  }

  .step-remove {
    margin-top: 0.1rem;
  }
</style>
