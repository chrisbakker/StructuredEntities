<script lang="ts">
  import type { Entity } from "../../types";
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

  // ── Typed field accessors ──────────────────────────────────────────────────

  type PersonFields = {
    name?: { firstName?: string; lastName?: string; middleName?: string };
    company?: { jobTitle?: string; name?: string; manager?: string };
    phones?: { mobile?: string; work?: string; home?: string };
    email?: { work?: string; personal?: string };
    website?: string;
    gender?: string;
    birthday?: string;
    photo?: string;
    tags?: string[];
  };

  // Local copy so sibling sub-field edits don't overwrite each other.
  let f: PersonFields = (entity.fields as PersonFields) ?? {};

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

  function str(val: unknown): string {
    if (val === null || val === undefined) return "";
    return String(val);
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  function setFlat(key: keyof PersonFields, e: Event) {
    const val = (e.target as HTMLInputElement).value;
    f = { ...f, [key]: val };
    onUpdateField(key, val);
  }

  function setNested<K extends keyof PersonFields>(
    group: K,
    subKey: string,
    e: Event
  ) {
    const val = (e.target as HTMLInputElement).value;
    const current = (f[group] as Record<string, unknown>) ?? {};
    const updated = { ...current, [subKey]: val };
    f = { ...f, [group]: updated as PersonFields[K] };
    onUpdateField(group, updated);
  }

  // ── Manager typeahead ─────────────────────────────────────────────────────

  let managerQuery = str(f.company?.manager);
  let managerSuggestions: string[] = [];
  let selectedManagerSuggestionIndex = 0;
  let managerShowCreate = false;

  function refreshManagerSuggestions(query: string) {
    if (!query.trim()) {
      managerSuggestions = [];
      managerShowCreate = false;
      return;
    }
    managerSuggestions = getSuggestions(query).slice(0, 8);
    managerShowCreate = !managerSuggestions.some(
      (s) => s.toLowerCase() === query.toLowerCase()
    );
    selectedManagerSuggestionIndex = 0;
  }

  function handleManagerInput(e: Event) {
    managerQuery = (e.target as HTMLInputElement).value;
    const current = (f.company as Record<string, unknown>) ?? {};
    f = { ...f, company: { ...current, manager: managerQuery } as PersonFields["company"] };
    onUpdateField("company", f.company);
    refreshManagerSuggestions(managerQuery);
  }

  function handleManagerKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    const total = managerSuggestions.length + (managerShowCreate ? 1 : 0);
    if (total === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedManagerSuggestionIndex = (selectedManagerSuggestionIndex + 1) % total;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedManagerSuggestionIndex = (selectedManagerSuggestionIndex - 1 + total) % total;
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (selectedManagerSuggestionIndex < managerSuggestions.length) {
        e.preventDefault();
        selectManager(managerSuggestions[selectedManagerSuggestionIndex]);
      } else if (managerShowCreate) {
        e.preventDefault();
        createAndSelectManager(managerQuery);
      }
    } else if (e.key === "Escape") {
      managerSuggestions = [];
      managerShowCreate = false;
    }
  }

  function handleManagerBlur() {
    setTimeout(() => {
      managerSuggestions = [];
      managerShowCreate = false;
    }, 150);
  }

  function selectManager(name: string) {
    managerQuery = name;
    const current = (f.company as Record<string, unknown>) ?? {};
    f = { ...f, company: { ...current, manager: name } as PersonFields["company"] };
    onUpdateField("company", f.company);
    managerSuggestions = [];
    managerShowCreate = false;
  }

  async function createAndSelectManager(name: string) {
    const created = await onCreateEntity("person", name);
    selectManager(created);
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  let body = entity.body ?? "";

  // ── Photo ────────────────────────────────────────────────────────────────

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
</script>

<div class="person-view">
  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <header class="person-header">
    <div class="person-thumbnail" on:click={() => photoInput.click()} role="button" tabindex="0"
      on:keydown={(e) => e.key === "Enter" && photoInput.click()}
      title={f.photo ? "Change photo" : "Add photo"}>
      {#if f.photo}
        <img src={resolveAssetPath(str(f.photo))} alt="{str(f.name?.firstName)} {str(f.name?.lastName)}" class="person-photo" />
      {:else}
        <div class="person-photo-placeholder">
          {str(f.name?.firstName).charAt(0).toUpperCase() || "?"}
        </div>
      {/if}
      <div class="person-photo-overlay">
        <span>{f.photo ? "Change" : "Add"}</span>
      </div>
    </div>
    <input bind:this={photoInput} type="file" accept="image/*" style="display:none"
      on:change={handlePhotoChange} />

    <div class="person-header-text">
      <div class="person-name-display">
        {str(f.name?.firstName)}
        {#if f.name?.middleName}{str(f.name.middleName)}{/if}
        {str(f.name?.lastName)}
      </div>
      {#if f.company?.name || f.company?.jobTitle}
        <div class="person-company-display">
          {str(f.company?.jobTitle)}{f.company?.jobTitle && f.company?.name ? " · " : ""}{str(f.company?.name)}
        </div>
      {/if}
    </div>
  </header>

  <div class="person-body">
    <!-- ── Fields grid ────────────────────────────────────────────────── -->
    <div class="person-fields-grid">
      <!-- Left column: Name, Company, Website -->
      <section class="person-fields">

        <!-- Name -->
        <div class="field-group">
          <h2 class="group-label">Name</h2>
          <div class="group-rows">
            <div class="field-row">
              <label class="field-label" for="pv-firstName">First</label>
              <input id="pv-firstName" class="field-input" type="text"
                value={str(f.name?.firstName)}
                on:input={(e) => setNested("name", "firstName", e)} />
            </div>
            <div class="field-row">
              <label class="field-label" for="pv-lastName">Last</label>
              <input id="pv-lastName" class="field-input" type="text"
                value={str(f.name?.lastName)}
                on:input={(e) => setNested("name", "lastName", e)} />
            </div>
            <div class="field-row">
              <label class="field-label" for="pv-middleName">Middle</label>
              <input id="pv-middleName" class="field-input" type="text"
                value={str(f.name?.middleName)}
                on:input={(e) => setNested("name", "middleName", e)} />
            </div>
          </div>
        </div>

        <!-- Company -->
        <div class="field-group">
          <h2 class="group-label">Company</h2>
          <div class="group-rows">
            <div class="field-row">
              <label class="field-label" for="pv-jobTitle">Job Title</label>
              <input id="pv-jobTitle" class="field-input" type="text"
                value={str(f.company?.jobTitle)}
                on:input={(e) => setNested("company", "jobTitle", e)} />
            </div>
            <div class="field-row">
              <label class="field-label" for="pv-companyName">Name</label>
              <input id="pv-companyName" class="field-input" type="text"
                value={str(f.company?.name)}
                on:input={(e) => setNested("company", "name", e)} />
            </div>
            <div class="field-row">
              <label class="field-label" for="pv-manager">Manager</label>
              <div class="field-person-wrapper">
                <input id="pv-manager" class="field-input" type="text"
                  placeholder="Search people…"
                  bind:value={managerQuery}
                  autocomplete="off"
                  on:input={handleManagerInput}
                  on:keydown={handleManagerKeydown}
                  on:blur={handleManagerBlur}
                />
                {#if managerQuery}
                  <button
                    class="field-person-link-btn"
                    title="Open {managerQuery}"
                    tabindex="-1"
                    on:mousedown|preventDefault={() => openLink(managerQuery, false)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </button>
                {/if}
                {#if managerSuggestions.length > 0 || managerShowCreate}
                  <ul class="field-person-suggestions" role="listbox">
                    {#each managerSuggestions as s, si}
                      <li
                        role="option"
                        aria-selected={si === selectedManagerSuggestionIndex}
                        class:selected={si === selectedManagerSuggestionIndex}
                        on:mousedown|preventDefault={() => selectManager(s)}
                      >{s}</li>
                    {/each}
                    {#if managerShowCreate}
                      <li
                        role="option"
                        class="field-person-create-option"
                        aria-selected={selectedManagerSuggestionIndex === managerSuggestions.length}
                        class:selected={selectedManagerSuggestionIndex === managerSuggestions.length}
                        on:mousedown|preventDefault={() => createAndSelectManager(managerQuery)}
                      >Create person "{managerQuery}"</li>
                    {/if}
                  </ul>
                {/if}
              </div>
            </div>
          </div>
        </div>

        <!-- Website -->
        <div class="field-row flat">
          <label class="field-label" for="pv-website">Website</label>
          <div class="field-with-action">
            <input id="pv-website" class="field-input" type="url"
              value={str(f.website)}
              on:input={(e) => setFlat("website", e)} />
            <button
              class="field-action-btn"
              title="Open website"
              disabled={!str(f.website)}
              on:click={() => { const u = str(f.website); window.open(/^https?:\/\//i.test(u) ? u : "https://" + u, "_blank"); }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
                <path d="M2 12h20"/>
              </svg>
            </button>
          </div>
        </div>

      </section>

      <!-- Right column: Phones, Email, Gender, Birthday -->
      <section class="person-fields">

        <!-- Phones -->
        <div class="field-group">
          <h2 class="group-label">Phones</h2>
          <div class="group-rows">
            <div class="field-row">
              <label class="field-label" for="pv-mobile">Mobile</label>
              <input id="pv-mobile" class="field-input" type="tel"
                value={str(f.phones?.mobile)}
                on:input={(e) => setNested("phones", "mobile", e)} />
            </div>
            <div class="field-row">
              <label class="field-label" for="pv-workPhone">Work</label>
              <input id="pv-workPhone" class="field-input" type="tel"
                value={str(f.phones?.work)}
                on:input={(e) => setNested("phones", "work", e)} />
            </div>
            <div class="field-row">
              <label class="field-label" for="pv-homePhone">Home</label>
              <input id="pv-homePhone" class="field-input" type="tel"
                value={str(f.phones?.home)}
                on:input={(e) => setNested("phones", "home", e)} />
            </div>
          </div>
        </div>

        <!-- Email -->
        <div class="field-group">
          <h2 class="group-label">Email</h2>
          <div class="group-rows">
            <div class="field-row">
              <label class="field-label" for="pv-workEmail">Work</label>
              <input id="pv-workEmail" class="field-input" type="email"
                value={str(f.email?.work)}
                on:input={(e) => setNested("email", "work", e)} />
            </div>
            <div class="field-row">
              <label class="field-label" for="pv-personalEmail">Personal</label>
              <input id="pv-personalEmail" class="field-input" type="email"
                value={str(f.email?.personal)}
                on:input={(e) => setNested("email", "personal", e)} />
            </div>
          </div>
        </div>

        <!-- Gender & Birthday -->
        <div class="field-row flat">
          <label class="field-label" for="pv-gender">Gender</label>
          <select id="pv-gender" class="field-input"
            value={str(f.gender)}
            on:change={(e) => setFlat("gender", e)}>
            <option value="">—</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Non-binary">Non-binary</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div class="field-row flat">
          <label class="field-label" for="pv-birthday">Birthday</label>
          <input id="pv-birthday" class="field-input" type="text"
            value={str(f.birthday)}
            on:input={(e) => setFlat("birthday", e)} />
        </div>

        <div class="field-row flat">
          <label class="field-label" for="pv-tag-input">Tags</label>
          <div class="tags-editor">
            {#each tags as tag, i}
              <span class="tag-pill">
                {tag}
                <button class="tag-remove" on:click={() => removeTag(i)} title="Remove tag" tabindex="-1">×</button>
              </span>
            {/each}
            <input
              id="pv-tag-input"
              class="tag-input"
              type="text"
              placeholder="Add tag…"
              bind:value={tagInput}
              on:keydown={handleTagKeydown}
              on:blur={addTag}
            />
          </div>
        </div>

      </section>
    </div>

    <!-- ── Notes (full width) ─────────────────────────────────────────── -->
    <section class="person-notes">
      <h2 class="notes-label">Notes</h2>
      <NotesEditor
        {body}
        {onUpdateBody}
        {getSuggestions}
        {openLink}
        {renderMarkdown}
        placeholder="Notes about this person…"
      />
    </section>
  </div>
</div>

<style>
  .person-view {
    padding: 1.5rem 2rem;
    max-width: 820px;
    margin: 0 auto;
    box-sizing: border-box;
  }

  /* ── Header ── */
  .person-header {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    margin-bottom: 1.75rem;
  }

  .person-thumbnail {
    position: relative;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    flex-shrink: 0;
    cursor: pointer;
    overflow: hidden;
  }

  .person-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: 50%;
  }

  .person-photo-placeholder {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--interactive-normal);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--text-muted);
    user-select: none;
  }

  .person-photo-overlay {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s;
    font-size: 0.7rem;
    font-weight: 600;
    color: #fff;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .person-thumbnail:hover .person-photo-overlay {
    opacity: 1;
  }

  .person-header-text {
    flex: 1;
    min-width: 0;
  }

  .person-name-display {
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--text-normal);
    line-height: 1.2;
  }

  .person-company-display {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
  }

  /* ── Layout ── */
  .person-body {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .person-fields-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    align-items: start;
  }

  /* ── Field groups ── */
  .person-fields {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field-group {
    display: grid;
    grid-template-columns: 80px 1fr;
    gap: 0.75rem;
    align-items: start;
  }

  .group-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    text-align: right;
    margin: 0;
    padding-top: 0.35rem;
    user-select: none;
  }

  .group-rows {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    border-left: 2px solid var(--background-modifier-border);
    padding-left: 0.75rem;
  }

  /* Flat row spanning full width with label column */
  .field-row {
    display: grid;
    grid-template-columns: 80px 1fr;
    gap: 0.75rem;
    align-items: center;
  }

  .field-row.flat {
    /* aligns with group rows: 80px label + gap matches field-group grid */
  }

  .group-rows .field-row {
    grid-template-columns: 60px 1fr;
    gap: 0.5rem;
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
    padding: 0.28rem 0.5rem;
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

  .field-with-action {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .field-with-action .field-input {
    flex: 1;
    min-width: 0;
  }

  .field-action-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    background: transparent;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
  }

  .field-action-btn:hover:not(:disabled) {
    color: var(--text-normal);
    border-color: var(--interactive-accent);
  }

  .field-action-btn:disabled {
    opacity: 0.35;
    cursor: default;
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
    line-height: 1.4;
    white-space: nowrap;
  }

  .tag-remove {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    display: flex;
    align-items: center;
  }

  .tag-remove:hover {
    opacity: 1;
  }

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

  .tag-input::placeholder {
    color: var(--text-faint);
  }

  /* ── Person-link field (manager) ── */
  .field-person-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    width: 100%;
  }

  .field-person-wrapper .field-input {
    flex: 1;
    min-width: 0;
  }

  .field-person-link-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    background: transparent;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
  }

  .field-person-link-btn:hover {
    color: var(--interactive-accent);
    border-color: var(--interactive-accent);
  }

  .field-person-suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    max-height: 200px;
    overflow-y: auto;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    list-style: none;
    padding: 0.25rem 0;
    margin: 0;
  }

  .field-person-suggestions li {
    padding: 0.3rem 0.75rem;
    font-size: 0.875rem;
    cursor: pointer;
    color: var(--text-normal);
  }

  .field-person-suggestions li.selected,
  .field-person-suggestions li:hover {
    background: var(--background-modifier-hover);
  }

  .field-person-create-option {
    color: var(--interactive-accent);
    font-style: italic;
  }

  /* ── Notes ── */
  .person-notes {    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .notes-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin: 0 0 0.25rem;
    user-select: none;
  }
</style>
