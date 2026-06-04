<script lang="ts">
  import type { Entity } from "../../../src/types";
  import { tick } from "svelte";

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

  type Attendee = { personId: string; role: string };
  type ActionItem = { text: string; assignee: string; done: boolean };

  type MeetingFields = {
    title?: string;
    date?: string;
    time?: string;
    attendees?: Attendee[];
    actionItems?: ActionItem[];
    transcript?: string;
    tags?: string[];
  };

  // ── State ──────────────────────────────────────────────────────────────────

  let f: MeetingFields = (entity.fields as MeetingFields) ?? {};

  // Pre-populate title from filename (strip leading YYYY-MM-DD prefix)
  if (!f.title) {
    const titleFromId = entity.id.replace(/^\d{4}-\d{2}-\d{2}\s*/, "").trim();
    if (titleFromId) {
      f = { ...f, title: titleFromId };
      onUpdateField("title", titleFromId);
    }
  }

  // Pre-populate date and time with now if not set
  if (!f.date || !f.time) {
    const now = new Date();
    if (!f.date) {
      const today = now.toISOString().slice(0, 10);
      f = { ...f, date: today };
      onUpdateField("date", today);
    }
    if (!f.time) {
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const timeNow = hh + ":" + mm;
      f = { ...f, time: timeNow };
      onUpdateField("time", timeNow);
    }
  }

  let attendees: Attendee[] = Array.isArray(f.attendees) ? [...f.attendees] : [];
  let actionItems: ActionItem[] = Array.isArray(f.actionItems) ? [...f.actionItems] : [];

  function str(val: unknown): string {
    if (val === null || val === undefined) return "";
    return String(val);
  }

  function setFlat(key: keyof MeetingFields, e: Event) {
    const val = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
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

  // ── Attendees ──────────────────────────────────────────────────────────────

  function pushAttendees() {
    onUpdateField("attendees", attendees);
  }

  function addAttendee() {
    attendees = [...attendees, { personId: "", role: "" }];
    pushAttendees();
  }

  function removeAttendee(index: number) {
    attendees = attendees.filter((_, i) => i !== index);
    pushAttendees();
  }

  function setAttendeeRole(index: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const next = attendees.slice();
    next[index] = { personId: next[index].personId, role: value };
    attendees = next;
    pushAttendees();
  }

  // ── Attendee typeahead ─────────────────────────────────────────────────────

  let activeAttendeeIndex: number | null = null;
  let attendeeQuery = "";
  let attendeeSuggestions: string[] = [];
  let selectedAttendeeSuggestionIndex = 0;
  let attendeeShowCreate = false;

  function handleAttendeePersonFocus(i: number, currentValue: string) {
    activeAttendeeIndex = i;
    attendeeQuery = currentValue;
    refreshAttendeeSuggestions(currentValue);
  }

  function handleAttendeePersonInput(i: number, e: Event) {
    const val = (e.target as HTMLInputElement).value;
    attendeeQuery = val;
    const next = attendees.slice();
    next[i] = { personId: val, role: next[i].role };
    attendees = next;
    pushAttendees();
    refreshAttendeeSuggestions(val);
  }

  function refreshAttendeeSuggestions(query: string) {
    if (!query.trim()) {
      attendeeSuggestions = [];
      attendeeShowCreate = false;
      selectedAttendeeSuggestionIndex = 0;
      return;
    }
    attendeeSuggestions = getSuggestions(query).slice(0, 8);
    const exactMatch = attendeeSuggestions.some(
      (s) => s.toLowerCase() === query.toLowerCase()
    );
    attendeeShowCreate = !exactMatch;
    selectedAttendeeSuggestionIndex = 0;
  }

  function handleAttendeePersonKeydown(i: number, e: KeyboardEvent) {
    e.stopPropagation();
    const total = attendeeSuggestions.length + (attendeeShowCreate ? 1 : 0);
    if (total === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedAttendeeSuggestionIndex = (selectedAttendeeSuggestionIndex + 1) % total;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedAttendeeSuggestionIndex = (selectedAttendeeSuggestionIndex - 1 + total) % total;
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (selectedAttendeeSuggestionIndex < attendeeSuggestions.length) {
        e.preventDefault();
        selectAttendeeSuggestion(i, attendeeSuggestions[selectedAttendeeSuggestionIndex]);
      } else if (attendeeShowCreate) {
        e.preventDefault();
        createAndSelectAttendee(i, attendeeQuery);
      }
    } else if (e.key === "Escape") {
      attendeeSuggestions = [];
      attendeeShowCreate = false;
    }
  }

  function handleAttendeePersonBlur() {
    setTimeout(() => {
      activeAttendeeIndex = null;
      attendeeSuggestions = [];
      attendeeShowCreate = false;
    }, 150);
  }

  function selectAttendeeSuggestion(i: number, name: string) {
    const next = attendees.slice();
    next[i] = { personId: name, role: next[i].role };
    attendees = next;
    pushAttendees();
    activeAttendeeIndex = null;
    attendeeSuggestions = [];
    attendeeShowCreate = false;
  }

  async function createAndSelectAttendee(i: number, name: string) {
    const created = await onCreateEntity("person", name);
    const next = attendees.slice();
    next[i] = { personId: created, role: next[i].role };
    attendees = next;
    pushAttendees();
    activeAttendeeIndex = null;
    attendeeSuggestions = [];
    attendeeShowCreate = false;
  }

  // ── Action items ───────────────────────────────────────────────────────────

  function pushActionItems() {
    onUpdateField("actionItems", actionItems);
  }

  function addActionItem() {
    actionItems = [...actionItems, { text: "", assignee: "", done: false }];
    pushActionItems();
  }

  function removeActionItem(index: number) {
    actionItems = actionItems.filter((_, i) => i !== index);
    pushActionItems();
  }

  function setActionItemText(index: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const next = actionItems.slice();
    next[index] = { ...next[index], text: value };
    actionItems = next;
    pushActionItems();
  }

  function setActionItemAssignee(index: number, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    const next = actionItems.slice();
    next[index] = { ...next[index], assignee: value };
    actionItems = next;
    pushActionItems();
  }

  function toggleActionItemDone(index: number) {
    const next = actionItems.slice();
    next[index] = { ...next[index], done: !next[index].done };
    actionItems = next;
    pushActionItems();
  }

  // ── Notes + Transcript (markdown body) ────────────────────────────────────

  let body = entity.body ?? "";

  // Migrate legacy transcript field into body as a fenced code block
  if ((f.transcript ?? "").trim()) {
    if (!body.includes("```transcript")) {
      const sep = body.trimEnd().length > 0 ? "\n\n" : "";
      body = body.trimEnd() + sep + "```transcript\n" + (f.transcript as string).trim() + "\n```";
      onUpdateBody(body);
      onUpdateField("transcript", "");
    }
  }
  let datePickerEl: HTMLInputElement;
  let timePickerEl: HTMLInputElement;
  let previewMode = false;
  let previewEl: HTMLDivElement;
  let textareaEl: HTMLTextAreaElement;
  let suggestions: string[] = [];
  let selectedSuggestionIndex = 0;
  let suggestionInsertPos = 0;

  async function togglePreviewMode() {
    suggestions = [];
    previewMode = !previewMode;
    if (previewMode) {
      await tick();
      if (previewEl) {
        previewEl.innerHTML = "";
        renderMarkdown(body, previewEl);
      }
    }
  }

  function handlePreviewClick(e: MouseEvent) {
    const link = (e.target as HTMLElement).closest("a");
    if (!link) return;
    const href = link.getAttribute("data-href") || link.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    e.stopPropagation();
    openLink(href, e.ctrlKey || e.metaKey);
  }

  function handlePreviewKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      const link = (e.target as HTMLElement).closest("a");
      if (!link) return;
      const href = link.getAttribute("data-href") || link.getAttribute("href");
      if (href) openLink(href, false);
    }
  }

  function updateSuggestions(ta: HTMLTextAreaElement) {
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const match = before.match(/\[\[([^\]\[]*)$/);
    if (match) {
      suggestions = getSuggestions(match[1]).slice(0, 10);
      selectedSuggestionIndex = 0;
      suggestionInsertPos = before.length - match[0].length;
    } else {
      suggestions = [];
    }
  }

  function handleBodyInput(e: Event) {
    const ta = e.target as HTMLTextAreaElement;
    body = ta.value;
    onUpdateBody(body);
    updateSuggestions(ta);
  }

  function handleBodyKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedSuggestionIndex = (selectedSuggestionIndex + 1) % suggestions.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedSuggestionIndex = (selectedSuggestionIndex - 1 + suggestions.length) % suggestions.length;
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      applySuggestion(suggestions[selectedSuggestionIndex]);
    } else if (e.key === "Escape") {
      suggestions = [];
    }
  }

  function handleDatePickerChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    f = { ...f, date: val };
    onUpdateField("date", val);
  }

  function handleTimePickerChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    f = { ...f, time: val };
    onUpdateField("time", val);
  }

  function insertTranscriptBlock() {
    if (previewMode) {
      previewMode = false;
    }
    const ta = textareaEl;
    const pos = ta ? ta.selectionStart : body.length;
    const before = body.slice(0, pos);
    const after = body.slice(pos);
    const sep1 = before.length > 0 && !before.endsWith("\n\n")
      ? (before.endsWith("\n") ? "\n" : "\n\n")
      : "";
    const sep2 = after.length > 0 && !after.startsWith("\n") ? "\n\n" : "";
    const block = "```transcript\n\n```";
    body = before + sep1 + block + sep2 + after;
    onUpdateBody(body);
    tick().then(() => {
      if (textareaEl) {
        const cursorPos = before.length + sep1.length + "```transcript\n".length;
        textareaEl.setSelectionRange(cursorPos, cursorPos);
        textareaEl.focus();
      }
    });
  }

  async function applySuggestion(name: string) {
    const ta = textareaEl;
    const pos = ta.selectionStart;
    const before = body.slice(0, suggestionInsertPos);
    const after = body.slice(pos);
    body = before + "[[" + name + "]]" + after;
    onUpdateBody(body);
    suggestions = [];
    await tick();
    const newPos = before.length + name.length + 4;
    ta.setSelectionRange(newPos, newPos);
    ta.focus();
  }
</script>

<div class="meeting-view">

  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <header class="meeting-header">
    <input
      class="meeting-title-input"
      type="text"
      placeholder="Meeting title"
      value={str(f.title)}
      on:input={(e) => setFlat("title", e)}
      on:keydown|stopPropagation
    />
    <div class="meeting-meta-row">
      <div class="meta-field">
        <label class="meta-label" for="mv-date">Date</label>
        <div class="date-wrapper">
          <input
            id="mv-date"
            class="meta-input"
            type="text"
            placeholder="YYYY-MM-DD"
            value={str(f.date)}
            on:input={(e) => setFlat("date", e)}
            on:keydown|stopPropagation
          />
          <input
            type="date"
            class="date-picker-hidden"
            bind:this={datePickerEl}
            value={str(f.date)}
            on:change={handleDatePickerChange}
          />
          <button
            class="date-picker-btn"
            title="Pick a date"
            tabindex="-1"
            on:click={() => datePickerEl?.showPicker?.()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="meta-field">
        <label class="meta-label" for="mv-time">Time</label>
        <div class="date-wrapper">
          <input
            id="mv-time"
            class="meta-input meta-input--time"
            type="text"
            placeholder="HH:MM"
            value={str(f.time)}
            on:input={(e) => setFlat("time", e)}
            on:keydown|stopPropagation
          />
          <input
            type="time"
            class="date-picker-hidden"
            bind:this={timePickerEl}
            value={str(f.time)}
            on:change={handleTimePickerChange}
          />
          <button
            class="date-picker-btn"
            title="Pick a time"
            tabindex="-1"
            on:click={() => timePickerEl?.showPicker?.()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="tags-editor meta-tags">
        {#each tags as tag, i}
          <span class="tag-pill">
            {tag}
            <button class="tag-remove" on:click={() => removeTag(i)} title="Remove tag" tabindex="-1">×</button>
          </span>
        {/each}
        <input
          id="mv-tag-input"
          class="tag-input"
          type="text"
          placeholder="Add tag…"
          bind:value={tagInput}
          on:keydown={handleTagKeydown}
          on:blur={addTag}
        />
      </div>
    </div>
  </header>

  <div class="meeting-body">

    <!-- ── Attendees ───────────────────────────────────────────────────────── -->
    <section class="meeting-section">
      <div class="section-header">
        <h2 class="section-label">Attendees</h2>
        <button class="add-btn" on:click={addAttendee}>+ Add</button>
      </div>

      {#if attendees.length === 0}
        <p class="empty-hint">No attendees yet.</p>
      {:else}
        <div class="attendees-list">
          <div class="attendees-list-header">
            <span>Person</span>
            <span>Role</span>
            <span></span>
          </div>
          {#each attendees as attendee, i}
            <div class="attendee-row">
              <div class="attendee-person-wrapper">
                <input
                  class="attendee-input"
                  type="text"
                  placeholder="Search people…"
                  value={attendee.personId}
                  autocomplete="off"
                  on:input={(e) => handleAttendeePersonInput(i, e)}
                  on:focus={() => handleAttendeePersonFocus(i, attendee.personId)}
                  on:keydown={(e) => handleAttendeePersonKeydown(i, e)}
                  on:blur={handleAttendeePersonBlur}
                />
                {#if attendee.personId}
                  <button
                    class="attendee-link-btn"
                    title="Open {attendee.personId}"
                    tabindex="-1"
                    on:mousedown|preventDefault={() => openLink(attendee.personId, false)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </button>
                {/if}
                {#if activeAttendeeIndex === i && (attendeeSuggestions.length > 0 || attendeeShowCreate)}
                  <ul class="attendee-suggestions" role="listbox">
                    {#each attendeeSuggestions as s, si}
                      <li
                        role="option"
                        aria-selected={si === selectedAttendeeSuggestionIndex}
                        class:selected={si === selectedAttendeeSuggestionIndex}
                        on:mousedown|preventDefault={() => selectAttendeeSuggestion(i, s)}
                      >{s}</li>
                    {/each}
                    {#if attendeeShowCreate}
                      <li
                        role="option"
                        class="attendee-create-option"
                        aria-selected={selectedAttendeeSuggestionIndex === attendeeSuggestions.length}
                        class:selected={selectedAttendeeSuggestionIndex === attendeeSuggestions.length}
                        on:mousedown|preventDefault={() => createAndSelectAttendee(i, attendeeQuery)}
                      >Create person "{attendeeQuery}"</li>
                    {/if}
                  </ul>
                {/if}
              </div>
              <input
                class="attendee-input"
                type="text"
                placeholder="Role"
                value={attendee.role}
                on:input={(e) => setAttendeeRole(i, e)}
                on:keydown|stopPropagation
              />
              <button class="remove-btn" on:click={() => removeAttendee(i)} title="Remove attendee">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- ── Action items ────────────────────────────────────────────────────── -->
    <section class="meeting-section">
      <div class="section-header">
        <h2 class="section-label">Action Items</h2>
        <button class="add-btn" on:click={addActionItem}>+ Add</button>
      </div>

      {#if actionItems.length === 0}
        <p class="empty-hint">No action items yet.</p>
      {:else}
        <div class="action-items-list">
          <div class="action-items-header">
            <span></span>
            <span>Task</span>
            <span>Assignee</span>
            <span></span>
          </div>
          {#each actionItems as item, i}
            <div class="action-item-row" class:done={item.done}>
              <button
                class="done-toggle"
                title={item.done ? "Mark incomplete" : "Mark complete"}
                on:click={() => toggleActionItemDone(i)}
              >
                {#if item.done}
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
                  </svg>
                {:else}
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                  </svg>
                {/if}
              </button>
              <input
                class="action-input"
                type="text"
                placeholder="Task description"
                value={item.text}
                on:input={(e) => setActionItemText(i, e)}
                on:keydown|stopPropagation
              />
              <input
                class="action-input assignee-input"
                type="text"
                placeholder="Assignee"
                value={item.assignee}
                on:input={(e) => setActionItemAssignee(i, e)}
                on:keydown|stopPropagation
              />
              <button class="remove-btn" on:click={() => removeActionItem(i)} title="Remove action item">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- ── Notes ──────────────────────────────────────────────────────────── -->
    <section class="meeting-section">
      <div class="section-header">
        <h2 class="section-label">Notes</h2>
        <div class="notes-actions">
          {#if !previewMode}
            <button class="notes-toggle" on:click={insertTranscriptBlock}>+ Transcript</button>
          {/if}
          <button class="notes-toggle" on:click={togglePreviewMode}>
            {previewMode ? "Edit" : "Preview"}
          </button>
        </div>
      </div>

      {#if previewMode}
        <div
          bind:this={previewEl}
          class="notes-preview markdown-rendered"
          role="region"
          aria-label="Notes preview"
          on:click={handlePreviewClick}
          on:keydown={handlePreviewKeydown}
        ></div>
      {:else}
        <div class="body-wrapper">
          <textarea
            class="body-editor"
            bind:this={textareaEl}
            value={body}
            on:input={handleBodyInput}
            on:keydown={handleBodyKeydown}
          />
          {#if suggestions.length > 0}
            <ul class="link-suggestions" role="listbox">
              {#each suggestions as suggestion, i}
                <li
                  role="option"
                  aria-selected={i === selectedSuggestionIndex}
                  class:selected={i === selectedSuggestionIndex}
                  on:mousedown|preventDefault={() => applySuggestion(suggestion)}
                >{suggestion}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </section>

  </div>
</div>

<style>
  .meeting-view {
    padding: 1.5rem 2rem;
    max-width: 820px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* ── Header ── */
  .meeting-header {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .meeting-title-input {
    background: transparent;
    border: none;
    border-bottom: 2px solid var(--background-modifier-border);
    border-radius: 0;
    padding: 0.25rem 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-normal);
    outline: none;
    width: 100%;
    box-sizing: border-box;
    font-family: inherit;
    transition: border-color 0.15s;
  }

  .meeting-title-input:focus {
    border-bottom-color: var(--interactive-accent);
  }

  .meeting-title-input::placeholder {
    color: var(--text-faint);
    font-weight: 400;
  }

  .meeting-meta-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .meta-field {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-shrink: 0;
  }

  .meta-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    user-select: none;
    white-space: nowrap;
  }

  .meta-input {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    font-size: 0.875rem;
    color: var(--text-normal);
    font-family: inherit;
    outline: none;
    transition: border-color 0.1s;
    width: 130px;
  }

  .meta-input:focus {
    border-color: var(--interactive-accent);
    background: var(--background-primary);
  }

  .meta-input--time {
    width: 80px;
  }

  .date-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .date-picker-hidden {
    position: absolute;
    opacity: 0;
    pointer-events: none;
    width: 0;
    height: 0;
    right: 0;
    top: 100%;
  }

  .date-picker-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.35rem;
    height: 100%;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.1s;
    flex-shrink: 0;
  }

  .date-picker-btn:hover {
    color: var(--interactive-accent);
  }

  .meta-tags {
    flex: 1;
    min-width: 120px;
  }

  /* ── Body ── */
  .meeting-body {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  /* ── Sections ── */
  .meeting-section {
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

  /* ── Attendees ── */
  .attendees-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .attendees-list-header {
    display: grid;
    grid-template-columns: 1fr 1fr 24px;
    gap: 0.5rem;
    padding: 0 0.25rem;
    font-size: 0.72rem;
    color: var(--text-faint);
    font-weight: 500;
    user-select: none;
  }

  .attendee-row {
    display: grid;
    grid-template-columns: 1fr 1fr 24px;
    gap: 0.5rem;
    align-items: center;
  }

  .attendee-person-wrapper {
    position: relative;
  }

  .attendee-input {
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

  .attendee-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    background: var(--background-primary);
  }

  .attendee-link-btn {
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

  .attendee-link-btn:hover {
    color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .attendee-suggestions {
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

  .attendee-suggestions li {
    padding: 0.3rem 0.7rem;
    font-size: 0.875rem;
    cursor: pointer;
    color: var(--text-normal);
  }

  .attendee-suggestions li.selected,
  .attendee-suggestions li:hover {
    background: var(--background-modifier-hover);
  }

  .attendee-create-option {
    color: var(--interactive-accent);
    border-top: 1px solid var(--background-modifier-border);
    font-style: italic;
  }

  /* ── Action items ── */
  .action-items-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .action-items-header {
    display: grid;
    grid-template-columns: 24px 1fr 140px 24px;
    gap: 0.5rem;
    padding: 0 0.25rem;
    font-size: 0.72rem;
    color: var(--text-faint);
    font-weight: 500;
    user-select: none;
  }

  .action-item-row {
    display: grid;
    grid-template-columns: 24px 1fr 140px 24px;
    gap: 0.5rem;
    align-items: center;
  }

  .action-item-row.done .action-input:first-of-type {
    text-decoration: line-through;
    color: var(--text-muted);
  }

  .done-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.1s;
    flex-shrink: 0;
  }

  .done-toggle:hover {
    color: var(--interactive-accent);
  }

  .action-item-row.done .done-toggle {
    color: var(--interactive-accent);
  }

  .action-input {
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

  .action-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    background: var(--background-primary);
  }

  .assignee-input {
    font-size: 0.82rem;
    color: var(--text-muted);
  }

  /* ── Shared remove button ── */
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

  /* ── Notes ── */
  .notes-toggle {
    font-size: 0.75rem;
    padding: 0.15rem 0.6rem;
    background: transparent;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
  }

  .notes-toggle:hover {
    color: var(--text-normal);
    border-color: var(--interactive-accent);
  }

  .notes-preview {
    min-height: 200px;
    padding: 0.5rem 0.75rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    font-size: 0.875rem;
    line-height: 1.6;
    box-sizing: border-box;
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
    min-height: 200px;
    line-height: 1.5;
    transition: border-color 0.1s;
  }

  .body-editor:focus {
    outline: none;
    border-color: var(--interactive-accent);
    background: var(--background-primary);
  }

  .body-wrapper {
    position: relative;
  }

  .link-suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 200px;
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

  .link-suggestions li {
    padding: 0.3rem 0.7rem;
    font-size: 0.875rem;
    cursor: pointer;
    color: var(--text-normal);
  }

  .link-suggestions li.selected,
  .link-suggestions li:hover {
    background: var(--background-modifier-hover);
  }

  /* ── Notes actions ── */
  .notes-actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
</style>
