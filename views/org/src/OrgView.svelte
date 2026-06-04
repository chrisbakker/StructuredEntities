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

  type Member = { personId: string; role: string };

  type OrgFields = {
    name?: string;
    description?: string;
    orgType?: string;
    members?: Member[];
    tags?: string[];
  };

  // ── State ──────────────────────────────────────────────────────────────────

  let f: OrgFields = (entity.fields as OrgFields) ?? {};
  let members: Member[] = Array.isArray(f.members) ? [...f.members] : [];

  // ── Tags ──────────────────────────────────────────────────────────────

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

  function setFlat(key: keyof OrgFields, e: Event) {
    const val = (e.target as HTMLInputElement).value;
    f = { ...f, [key]: val };
    onUpdateField(key, val);
  }

  // ── Members ────────────────────────────────────────────────────────────────

  function pushMembers() {
    onUpdateField("members", members);
  }

  function addMember() {
    members = [...members, { personId: "", role: "" }];
    pushMembers();
  }

  function removeMember(index: number) {
    members = members.filter((_, i) => i !== index);
    pushMembers();
  }

  function setMemberRole(index: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const next = members.slice();
    next[index] = { personId: next[index].personId, role: value };
    members = next;
    pushMembers();
  }

  // ── Member typeahead ────────────────────────────────────────────────────────

  let activeMemberIndex: number | null = null;
  let memberQuery = "";
  let memberSuggestions: string[] = [];
  let selectedMemberSuggestionIndex = 0;
  let memberShowCreate = false;

  function handleMemberPersonFocus(i: number, currentValue: string) {
    activeMemberIndex = i;
    memberQuery = currentValue;
    refreshMemberSuggestions(currentValue);
  }

  function handleMemberPersonInput(i: number, e: Event) {
    const val = (e.target as HTMLInputElement).value;
    memberQuery = val;
    const next = members.slice();
    next[i] = { personId: val, role: next[i].role };
    members = next;
    pushMembers();
    refreshMemberSuggestions(val);
  }

  function refreshMemberSuggestions(query: string) {
    if (!query.trim()) {
      memberSuggestions = [];
      memberShowCreate = false;
      selectedMemberSuggestionIndex = 0;
      return;
    }
    memberSuggestions = getSuggestions(query).slice(0, 8);
    const exactMatch = memberSuggestions.some(
      (s) => s.toLowerCase() === query.toLowerCase()
    );
    memberShowCreate = !exactMatch;
    selectedMemberSuggestionIndex = 0;
  }

  function handleMemberPersonKeydown(i: number, e: KeyboardEvent) {
    e.stopPropagation();
    const total = memberSuggestions.length + (memberShowCreate ? 1 : 0);
    if (total === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedMemberSuggestionIndex = (selectedMemberSuggestionIndex + 1) % total;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedMemberSuggestionIndex = (selectedMemberSuggestionIndex - 1 + total) % total;
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (selectedMemberSuggestionIndex < memberSuggestions.length) {
        e.preventDefault();
        selectMemberSuggestion(i, memberSuggestions[selectedMemberSuggestionIndex]);
      } else if (memberShowCreate) {
        e.preventDefault();
        createAndSelectMember(i, memberQuery);
      }
    } else if (e.key === "Escape") {
      memberSuggestions = [];
      memberShowCreate = false;
    }
  }

  function handleMemberPersonBlur() {
    setTimeout(() => {
      activeMemberIndex = null;
      memberSuggestions = [];
      memberShowCreate = false;
    }, 150);
  }

  function selectMemberSuggestion(i: number, name: string) {
    const next = members.slice();
    next[i] = { personId: name, role: next[i].role };
    members = next;
    pushMembers();
    activeMemberIndex = null;
    memberSuggestions = [];
    memberShowCreate = false;
  }

  async function createAndSelectMember(i: number, name: string) {
    const created = await onCreateEntity("person", name);
    const next = members.slice();
    next[i] = { personId: created, role: next[i].role };
    members = next;
    pushMembers();
    activeMemberIndex = null;
    memberSuggestions = [];
    memberShowCreate = false;
  }

  // ── Notes ────────────────────────────────────────────────────────────────

  let body = entity.body ?? "";

</script>

<div class="org-view">

  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <header class="org-header">
    <div class="org-title-row">
      <input
        class="org-name-input"
        type="text"
        placeholder="Organization name"
        value={str(f.name)}
        on:input={(e) => setFlat("name", e)}
        on:keydown|stopPropagation
      />
      <select
        class="org-type-select"
        value={str(f.orgType)}
        on:change={(e) => setFlat("orgType", e)}
      >
        <option value="">— Type —</option>
        <option value="Company">Company</option>
        <option value="Team">Team</option>
        <option value="Division">Division</option>
      </select>
    </div>
    <textarea
      class="org-description"
      placeholder="Description…"
      value={str(f.description)}
      on:input={(e) => setFlat("description", e)}
      on:keydown|stopPropagation
    />
  </header>

  <div class="org-body">

    <!-- ── Members ────────────────────────────────────────────────────────── -->
    <section class="org-section">
      <div class="section-header">
        <h2 class="section-label">Members</h2>
        <button class="add-btn" on:click={addMember}>+ Add</button>
      </div>

      {#if members.length === 0}
        <p class="empty-hint">No members yet.</p>
      {:else}
        <div class="members-list">
          <div class="members-list-header">
            <span>Person</span>
            <span>Role</span>
            <span></span>
          </div>
          {#each members as member, i}
            <div class="member-row">
              <div class="member-person-wrapper">
                <input
                  class="member-input"
                  type="text"
                  placeholder="Search people…"
                  value={member.personId}
                  autocomplete="off"
                  on:input={(e) => handleMemberPersonInput(i, e)}
                  on:focus={() => handleMemberPersonFocus(i, member.personId)}
                  on:keydown={(e) => handleMemberPersonKeydown(i, e)}
                  on:blur={handleMemberPersonBlur}
                />
                {#if member.personId}
                  <button
                    class="member-link-btn"
                    title="Open {member.personId}"
                    tabindex="-1"
                    on:mousedown|preventDefault={() => openLink(member.personId, false)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </button>
                {/if}
                {#if activeMemberIndex === i && (memberSuggestions.length > 0 || memberShowCreate)}
                  <ul class="member-suggestions" role="listbox">
                    {#each memberSuggestions as s, si}
                      <li
                        role="option"
                        aria-selected={si === selectedMemberSuggestionIndex}
                        class:selected={si === selectedMemberSuggestionIndex}
                        on:mousedown|preventDefault={() => selectMemberSuggestion(i, s)}
                      >{s}</li>
                    {/each}
                    {#if memberShowCreate}
                      <li
                        role="option"
                        class="member-create-option"
                        aria-selected={selectedMemberSuggestionIndex === memberSuggestions.length}
                        class:selected={selectedMemberSuggestionIndex === memberSuggestions.length}
                        on:mousedown|preventDefault={() => createAndSelectMember(i, memberQuery)}
                      >Create person "{memberQuery}"</li>
                    {/if}
                  </ul>
                {/if}
              </div>
              <input
                class="member-input"
                type="text"
                placeholder="Role"
                value={member.role}
                on:input={(e) => setMemberRole(i, e)}
                on:keydown|stopPropagation
              />
              <button class="remove-btn" on:click={() => removeMember(i)} title="Remove member">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- ── Tags ───────────────────────────────────────────────────────────── -->
    <section class="org-section">
      <div class="section-header">
        <h2 class="section-label">Tags</h2>
      </div>
      <div class="tags-editor">
        {#each tags as tag, i}
          <span class="tag-pill">
            {tag}
            <button class="tag-remove" on:click={() => removeTag(i)} title="Remove tag" tabindex="-1">×</button>
          </span>
        {/each}
        <input
          class="tag-input"
          type="text"
          placeholder="Add tag…"
          bind:value={tagInput}
          on:keydown={handleTagKeydown}
          on:blur={addTag}
        />
      </div>
    </section>

    <!-- ── Notes ──────────────────────────────────────────────────────────── -->
    <NotesEditor {body} {onUpdateBody} {getSuggestions} {openLink} {renderMarkdown} placeholder="Notes about this org…" />

  </div>
</div>

<style>
  .org-view {
    padding: 1.5rem 2rem;
    max-width: 760px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* ── Header ── */
  .org-header {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .org-title-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .org-name-input {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 2px solid var(--background-modifier-border);
    border-radius: 0;
    padding: 0.25rem 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-normal);
    outline: none;
    transition: border-color 0.15s;
  }

  .org-name-input:focus {
    border-bottom-color: var(--interactive-accent);
  }

  .org-name-input::placeholder {
    color: var(--text-faint);
    font-weight: 400;
  }

  .org-type-select {
    flex-shrink: 0;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
    color: var(--text-muted);
    cursor: pointer;
    outline: none;
  }

  .org-type-select:focus {
    border-color: var(--interactive-accent);
    color: var(--text-normal);
  }

  .org-description {
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--background-modifier-border);
    border-radius: 0;
    padding: 0.2rem 0;
    font-size: 0.9rem;
    color: var(--text-muted);
    width: 100%;
    box-sizing: border-box;
    resize: none;
    font-family: inherit;
    line-height: 1.5;
    min-height: 2.5rem;
    outline: none;
    transition: border-color 0.15s;
  }

  .org-description:focus {
    border-bottom-color: var(--interactive-accent);
    color: var(--text-normal);
  }

  .org-description::placeholder {
    color: var(--text-faint);
  }

  /* ── Body ── */
  .org-body {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  /* ── Sections ── */
  .org-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin: 0;
    user-select: none;
  }

  /* ── Members ── */
  .add-btn {
    font-size: 0.75rem;
    padding: 0.15rem 0.6rem;
    background: transparent;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
  }

  .add-btn:hover {
    color: var(--text-normal);
    border-color: var(--interactive-accent);
  }

  .empty-hint {
    font-size: 0.85rem;
    color: var(--text-faint);
    margin: 0.25rem 0;
  }

  .members-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .members-list-header {
    display: grid;
    grid-template-columns: 1fr 1fr 24px;
    gap: 0.5rem;
    padding: 0 0.25rem;
    font-size: 0.72rem;
    color: var(--text-faint);
    font-weight: 500;
    user-select: none;
  }

  .member-row {
    display: grid;
    grid-template-columns: 1fr 1fr 24px;
    gap: 0.5rem;
    align-items: center;
  }

  .member-input {
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

  .member-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    background: var(--background-primary);
  }

  .member-link-btn {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--text-faint);
    cursor: pointer;
    transition: color 0.1s, background 0.1s;
  }

  .member-link-btn:hover {
    color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-faint);
    cursor: pointer;
    transition: color 0.1s, background 0.1s;
  }

  .remove-btn:hover {
    color: var(--text-error);
    background: var(--background-modifier-error);
  }

  /* ── Member typeahead ── */
  .member-person-wrapper {
    position: relative;
  }

  .member-suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 180px;
    overflow-y: auto;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 100;
    list-style: none;
    padding: 0.25rem 0;
    margin: 0;
  }

  .member-suggestions li {
    padding: 0.3rem 0.7rem;
    font-size: 0.875rem;
    cursor: pointer;
    color: var(--text-normal);
  }

  .member-suggestions li.selected,
  .member-suggestions li:hover {
    background: var(--background-modifier-hover);
  }

  .member-create-option {
    color: var(--interactive-accent);
    border-top: 1px solid var(--background-modifier-border);
    font-style: italic;
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

  /* ── Notes ── (editor styles now live in NotesEditor.svelte) ── */
</style>
