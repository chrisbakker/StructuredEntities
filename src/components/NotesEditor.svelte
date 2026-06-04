<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { Editor, Extension, InputRule } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import Link from "@tiptap/extension-link";
  import Placeholder from "@tiptap/extension-placeholder";
  import { Markdown } from "tiptap-markdown";

  // ── Props ──────────────────────────────────────────────────────────────────

  export let body: string;
  export let onUpdateBody: (text: string) => void;
  export let getSuggestions: (query: string) => string[] = () => [];
  export let openLink: (href: string, newLeaf: boolean) => void = () => {};
  export let renderMarkdown: (md: string, el: HTMLElement) => Promise<void>;
  export let placeholder = "Write notes…";

  // ── Wiki-link helpers ────────────────────────────────────────────────────
  // Tiptap/markdown-it don't understand [[target]] natively, so we translate
  // to a special wikilink:// URL scheme on the way in and back on the way out.

  function wikiToMd(md: string): string {
    return md.replace(/\[\[([^\]]+)\]\]/g, (_, t) =>
      `[${t}](wikilink://${encodeURIComponent(t)})`
    );
  }

  function mdToWiki(md: string): string {
    return md.replace(/\[([^\]]+)\]\(wikilink:\/\/([^)]+)\)/g, (_, _display, encoded) =>
      `[[${decodeURIComponent(encoded)}]]`
    );
  }

  // InputRule: converts [[target]] typed in the WYSIWYG editor to a link mark.
  const WikiLinkRule = Extension.create({
    name: "wikiLinkRule",
    addInputRules() {
      return [
        new InputRule({
          find: /\[\[([^\]]+)\]\]$/,
          handler: ({ state, range, match }) => {
            const target = match[1];
            const href = `wikilink://${encodeURIComponent(target)}`;
            const { tr, schema } = state;
            const linkType = schema.marks["link"];
            if (!linkType) return;
            tr.delete(range.from, range.to)
              .insertText(target, range.from)
              .addMark(range.from, range.from + target.length, linkType.create({ href }));
          },
        }),
      ];
    },
  });

  // ── Mode ──────────────────────────────────────────────────────────────────

  type EditorMode = "wysiwyg" | "markdown";
  const STORAGE_KEY = "entities-notes-editor-mode";

  let mode: EditorMode = (() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as EditorMode) ?? "wysiwyg";
    } catch {
      return "wysiwyg";
    }
  })();

  // ── WYSIWYG (Tiptap) ──────────────────────────────────────────────────────

  let editorContainerEl: HTMLDivElement;
  let tiptap: Editor | null = null;

  onMount(() => {
    if (mode === "wysiwyg") initTiptap();
  });

  onDestroy(() => destroyTiptap());

  async function initTiptap() {
    await tick();
    if (!editorContainerEl) return;
    destroyTiptap();
    tiptap = new Editor({
      element: editorContainerEl,
      extensions: [
        StarterKit,
        Link.configure({
          openOnClick: false,
          protocols: ["wikilink"],
          HTMLAttributes: { rel: "noopener noreferrer" },
        }),
        Placeholder.configure({ placeholder }),
        Markdown.configure({ html: false, transformPastedText: true }),
        WikiLinkRule,
      ],
      content: wikiToMd(body),
      editorProps: {
        attributes: { class: "ne-prosemirror", spellcheck: "true" },
        handleClick(_view, _pos, event) {
          const link = (event.target as HTMLElement).closest("a");
          if (!link) return false;
          let href = link.getAttribute("href") ?? "";
          if (!href) return false;
          // Wiki-links open on single click; regular links require ⌘/ctrl.
          if (href.startsWith("wikilink://")) {
            event.preventDefault();
            openLink(decodeURIComponent(href.slice("wikilink://".length)), event.metaKey || event.ctrlKey);
            return true;
          }
          if (event.metaKey || event.ctrlKey) {
            event.preventDefault();
            openLink(href, true);
            return true;
          }
          return false;
        },
      },
      onUpdate({ editor }) {
        const md = mdToWiki(editor.storage.markdown.getMarkdown());
        body = md;
        onUpdateBody(md);
      },
      onTransaction() {
        // Reassigning triggers Svelte reactivity for toolbar active states.
        tiptap = tiptap;
      },
    });
  }

  function destroyTiptap() {
    if (tiptap) {
      tiptap.destroy();
      tiptap = null;
    }
  }

  async function switchMode(newMode: EditorMode) {
    if (newMode === mode) return;
    if (newMode === "wysiwyg") {
      previewMode = false;
      mode = newMode;
      try { localStorage.setItem(STORAGE_KEY, newMode); } catch { /* noop */ }
      await tick();
      initTiptap();
    } else {
      if (tiptap) body = tiptap.storage.markdown.getMarkdown();
      destroyTiptap();
      mode = newMode;
      try { localStorage.setItem(STORAGE_KEY, newMode); } catch { /* noop */ }
    }
  }

  // ── WYSIWYG toolbar helpers ───────────────────────────────────────────────

  function isActive(name: string, attrs?: Record<string, unknown>): boolean {
    return tiptap?.isActive(name, attrs) ?? false;
  }

  function cmd(fn: () => unknown) {
    return (e: MouseEvent) => { e.preventDefault(); fn(); };
  }

  // ── Link popover ──────────────────────────────────────────────────────────

  let linkPopover = false;
  let linkHref = "";
  let pendingLinkRange: { from: number; to: number } | null = null;
  let linkInputEl: HTMLInputElement;

  function setLink() {
    if (!tiptap) return;
    const { from, to } = tiptap.state.selection;
    pendingLinkRange = { from, to };
    linkHref = tiptap.getAttributes("link").href ?? "";
    linkPopover = true;
    tick().then(() => linkInputEl?.focus());
  }

  function normalizeHref(raw: string): string {
    const s = raw.trim();
    // [[Page Name]] → wikilink://Page%20Name
    const wikiMatch = s.match(/^\[\[(.+)\]\]$/);
    if (wikiMatch) return `wikilink://${encodeURIComponent(wikiMatch[1])}`;
    // Already has a URL scheme → use as-is
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(s)) return s;
    // Bare name / path with no scheme → treat as internal wikilink
    return `wikilink://${encodeURIComponent(s)}`;
  }

  function confirmLink() {
    linkPopover = false;
    if (!tiptap || !pendingLinkRange) return;
    const { from, to } = pendingLinkRange;
    pendingLinkRange = null;
    if (linkHref.trim() === "") {
      tiptap.chain().focus()
        .setTextSelection({ from, to })
        .extendMarkRange("link")
        .unsetLink()
        .run();
    } else {
      const href = normalizeHref(linkHref);
      tiptap.chain().focus()
        .setTextSelection({ from, to })
        .extendMarkRange("link")
        .setMark("link", { href })
        .run();
    }
  }

  function cancelLink() {
    linkPopover = false;
    pendingLinkRange = null;
    tiptap?.commands.focus();
  }

  function handleLinkInputKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); confirmLink(); }
    if (e.key === "Escape") { e.preventDefault(); cancelLink(); }
  }

  // ── Markdown mode ─────────────────────────────────────────────────────────

  let textareaEl: HTMLTextAreaElement;
  let previewMode = false;
  let previewEl: HTMLDivElement;
  let suggestions: string[] = [];
  let selectedSuggestionIndex = 0;
  let suggestionInsertPos = 0;

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
      selectedSuggestionIndex =
        (selectedSuggestionIndex - 1 + suggestions.length) % suggestions.length;
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      applySuggestion(suggestions[selectedSuggestionIndex]);
    } else if (e.key === "Escape") {
      suggestions = [];
    }
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
    const href = link.getAttribute("data-href") ?? link.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    e.stopPropagation();
    openLink(href, e.ctrlKey || e.metaKey);
  }

  function handlePreviewKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      const link = (e.target as HTMLElement).closest("a");
      if (!link) return;
      const href = link.getAttribute("data-href") ?? link.getAttribute("href");
      if (href) openLink(href, false);
    }
  }

  // ── Public API (accessible via bind:this) ─────────────────────────────────

  /** Insert text at the cursor in whichever mode is active. */
  export async function insertAtCursor(text: string) {
    if (mode === "wysiwyg" && tiptap) {
      // Detect fenced code block: "```lang\n...\n```"
      const fenceMatch = text.match(/^```(\w*)\n([\s\S]*)\n```$/);
      if (fenceMatch) {
        const lang = fenceMatch[1];
        tiptap.chain().focus().setCodeBlock({ language: lang }).run();
      } else {
        tiptap.chain().focus().insertContent(text).run();
      }
    } else if (mode === "markdown") {
      // Exit preview before inserting
      if (previewMode) previewMode = false;
      await tick();
      const ta = textareaEl;
      const pos = ta ? ta.selectionStart : body.length;
      const before = body.slice(0, pos);
      const after = body.slice(pos);
      const sep1 =
        before.length > 0 && !before.endsWith("\n\n")
          ? before.endsWith("\n") ? "\n" : "\n\n"
          : "";
      const sep2 = after.length > 0 && !after.startsWith("\n") ? "\n\n" : "";
      body = before + sep1 + text + sep2 + after;
      onUpdateBody(body);
      await tick();
      if (ta) {
        // Place cursor at the first blank line inside the inserted block
        const firstNewline = text.indexOf("\n");
        const cursorPos =
          before.length + sep1.length + (firstNewline >= 0 ? firstNewline + 1 : text.length);
        ta.setSelectionRange(cursorPos, cursorPos);
        ta.focus();
      }
    }
  }
</script>

<!-- ── Markup ─────────────────────────────────────────────────────────────── -->

<div class="notes-editor">

  <!-- Header: mode toggle + optional extra actions -->
  <div class="ne-header">
    <div class="ne-mode-toggle" role="group" aria-label="Editor mode">
      <button
        class="ne-mode-btn"
        class:active={mode === "wysiwyg"}
        on:click={() => switchMode("wysiwyg")}
        title="Rich text (WYSIWYG)"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
        </svg>
        Rich text
      </button>
      <button
        class="ne-mode-btn"
        class:active={mode === "markdown"}
        on:click={() => switchMode("markdown")}
        title="Markdown source"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="4 7 4 4 20 4 20 7"/>
          <line x1="9" y1="20" x2="15" y2="20"/>
          <line x1="12" y1="4" x2="12" y2="20"/>
        </svg>
        Markdown
      </button>
    </div>

    <div class="ne-header-right">
      {#if mode === "markdown"}
        <button class="ne-action-btn" on:click={togglePreviewMode}>
          {previewMode ? "Edit" : "Preview"}
        </button>
      {/if}
      <!-- Slot for per-view extras (e.g. "+ Transcript" in meeting view) -->
      <slot name="actions" />
    </div>
  </div>

  {#if mode === "wysiwyg"}

    <!-- ── WYSIWYG toolbar ──────────────────────────────────────────────── -->
    {#if tiptap}
      <div class="ne-toolbar" role="toolbar" aria-label="Formatting">

        <!-- Inline marks -->
        <button class="tb-btn" class:active={isActive("bold")}
          on:mousedown={cmd(() => tiptap?.chain().focus().toggleBold().run())}
          title="Bold (⌘B)" aria-label="Bold"><strong>B</strong></button>

        <button class="tb-btn" class:active={isActive("italic")}
          on:mousedown={cmd(() => tiptap?.chain().focus().toggleItalic().run())}
          title="Italic (⌘I)" aria-label="Italic"><em>I</em></button>

        <button class="tb-btn" class:active={isActive("strike")}
          on:mousedown={cmd(() => tiptap?.chain().focus().toggleStrike().run())}
          title="Strikethrough" aria-label="Strikethrough">
          <s>S</s>
        </button>

        <button class="tb-btn" class:active={isActive("code")}
          on:mousedown={cmd(() => tiptap?.chain().focus().toggleCode().run())}
          title="Inline code" aria-label="Inline code">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
          </svg>
        </button>

        <div class="tb-sep" />

        <!-- Headings -->
        <button class="tb-btn" class:active={isActive("heading", { level: 1 })}
          on:mousedown={cmd(() => tiptap?.chain().focus().toggleHeading({ level: 1 }).run())}
          title="Heading 1" aria-label="Heading 1">H1</button>

        <button class="tb-btn" class:active={isActive("heading", { level: 2 })}
          on:mousedown={cmd(() => tiptap?.chain().focus().toggleHeading({ level: 2 }).run())}
          title="Heading 2" aria-label="Heading 2">H2</button>

        <button class="tb-btn" class:active={isActive("heading", { level: 3 })}
          on:mousedown={cmd(() => tiptap?.chain().focus().toggleHeading({ level: 3 }).run())}
          title="Heading 3" aria-label="Heading 3">H3</button>

        <div class="tb-sep" />

        <!-- Lists -->
        <button class="tb-btn" class:active={isActive("bulletList")}
          on:mousedown={cmd(() => tiptap?.chain().focus().toggleBulletList().run())}
          title="Bullet list" aria-label="Bullet list">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/>
            <line x1="9" y1="18" x2="20" y2="18"/>
            <circle cx="4" cy="6" r="1" fill="currentColor"/>
            <circle cx="4" cy="12" r="1" fill="currentColor"/>
            <circle cx="4" cy="18" r="1" fill="currentColor"/>
          </svg>
        </button>

        <button class="tb-btn" class:active={isActive("orderedList")}
          on:mousedown={cmd(() => tiptap?.chain().focus().toggleOrderedList().run())}
          title="Numbered list" aria-label="Numbered list">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/>
            <line x1="10" y1="18" x2="21" y2="18"/>
            <path d="M4 6h1v4"/><path d="M4 10h2"/>
            <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>
          </svg>
        </button>

        <div class="tb-sep" />

        <!-- Block elements -->
        <button class="tb-btn" class:active={isActive("blockquote")}
          on:mousedown={cmd(() => tiptap?.chain().focus().toggleBlockquote().run())}
          title="Blockquote" aria-label="Blockquote">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
          </svg>
        </button>

        <button class="tb-btn" class:active={isActive("codeBlock")}
          on:mousedown={cmd(() => tiptap?.chain().focus().toggleCodeBlock().run())}
          title="Code block" aria-label="Code block">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <polyline points="8 21 12 17 16 21"/>
          </svg>
        </button>

        <div class="tb-sep" />

        <!-- Link -->
        <button class="tb-btn" class:active={isActive("link")}
          on:mousedown={cmd(setLink)}
          title="Insert / edit link" aria-label="Link">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
        </button>

        <div class="tb-sep" />

        <!-- History -->
        <button class="tb-btn"
          on:mousedown={cmd(() => tiptap?.chain().focus().undo().run())}
          title="Undo (⌘Z)" aria-label="Undo">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
          </svg>
        </button>

        <button class="tb-btn"
          on:mousedown={cmd(() => tiptap?.chain().focus().redo().run())}
          title="Redo (⌘⇧Z)" aria-label="Redo">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
          </svg>
        </button>

      </div>

      {#if linkPopover}
        <div class="ne-link-bar">
          <input
            bind:this={linkInputEl}
            class="ne-link-input"
            type="text"
            bind:value={linkHref}
            placeholder="Entity name  or  https://url.com"
            on:keydown={handleLinkInputKeydown}
          />
          <button class="ne-link-confirm" on:mousedown|preventDefault={confirmLink}>Apply</button>
          <button class="ne-link-cancel" on:mousedown|preventDefault={cancelLink}>✕</button>
        </div>
      {/if}
    {/if}

    <!-- Editor surface (Tiptap mounts here) -->
    <div bind:this={editorContainerEl} class="ne-wysiwyg-wrapper" />

  {:else}

    <!-- ── Markdown mode ──────────────────────────────────────────────────── -->
    {#if previewMode}
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <div
        bind:this={previewEl}
        class="ne-preview markdown-rendered"
        role="region"
        aria-label="Notes preview"
        on:click={handlePreviewClick}
        on:keydown={handlePreviewKeydown}
      />
    {:else}
      <div class="ne-md-wrapper">
        <textarea
          class="ne-textarea"
          bind:this={textareaEl}
          value={body}
          {placeholder}
          on:input={handleBodyInput}
          on:keydown={handleBodyKeydown}
        />
        {#if suggestions.length > 0}
          <ul class="ne-suggestions" role="listbox">
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

  {/if}
</div>

<style>
  /* ── Container ── */
  .notes-editor {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* ── Header ── */
  .ne-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .ne-header-right {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  /* ── Mode toggle (segmented control) ── */
  .ne-mode-toggle {
    display: flex;
    background: var(--background-modifier-border);
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
  }

  .ne-mode-btn {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.55rem;
    font-size: 0.75rem;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
    white-space: nowrap;
  }

  .ne-mode-btn:hover {
    color: var(--text-normal);
  }

  .ne-mode-btn.active {
    background: var(--background-primary);
    color: var(--text-normal);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  }

  /* ── Action buttons (preview / custom) ── */
  .ne-action-btn {
    font-size: 0.75rem;
    padding: 0.18rem 0.6rem;
    background: transparent;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
  }

  .ne-action-btn:hover {
    color: var(--text-normal);
    border-color: var(--interactive-accent);
  }

  /* ── Toolbar ── */
  .ne-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1px;
    padding: 0.3rem 0.4rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-bottom: none;
    border-radius: 6px 6px 0 0;
  }

  .tb-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 1.75rem;
    height: 1.75rem;
    padding: 0 0.25rem;
    font-size: 0.8rem;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--text-muted);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .tb-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .tb-btn.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .tb-sep {
    width: 1px;
    height: 1.25rem;
    background: var(--background-modifier-border);
    margin: 0 0.2rem;
    flex-shrink: 0;
  }

  /* ── WYSIWYG editor surface ── */
  .ne-wysiwyg-wrapper {
    border: 1px solid var(--background-modifier-border);
    border-radius: 0 0 6px 6px;
    background: var(--background-secondary);
    min-height: 200px;
    transition: border-color 0.1s;
  }

  .ne-wysiwyg-wrapper:focus-within {
    border-color: var(--interactive-accent);
    background: var(--background-primary);
  }

  /* Style the ProseMirror contenteditable */
  :global(.ne-prosemirror) {
    outline: none;
    padding: 0.65rem 0.75rem;
    min-height: 200px;
    font-size: 0.9rem;
    line-height: 1.65;
    color: var(--text-normal);
    font-family: var(--font-text);
  }

  :global(.ne-prosemirror > * + *) {
    margin-top: 0.5em;
  }

  :global(.ne-prosemirror p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    color: var(--text-faint);
    pointer-events: none;
    float: left;
    height: 0;
  }

  :global(.ne-prosemirror h1) { font-size: 1.5em; font-weight: 700; margin: 0.6em 0 0.2em; }
  :global(.ne-prosemirror h2) { font-size: 1.25em; font-weight: 600; margin: 0.6em 0 0.2em; }
  :global(.ne-prosemirror h3) { font-size: 1.1em; font-weight: 600; margin: 0.5em 0 0.15em; }

  :global(.ne-prosemirror ul),
  :global(.ne-prosemirror ol) {
    padding-left: 1.5em;
  }

  :global(.ne-prosemirror li + li) { margin-top: 0.15em; }

  :global(.ne-prosemirror blockquote) {
    border-left: 3px solid var(--interactive-accent);
    margin: 0;
    padding-left: 0.75rem;
    color: var(--text-muted);
  }

  :global(.ne-prosemirror code) {
    background: var(--background-modifier-border);
    border-radius: 3px;
    padding: 0.1em 0.3em;
    font-family: var(--font-monospace);
    font-size: 0.85em;
  }

  :global(.ne-prosemirror pre) {
    background: var(--background-primary-alt);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 0.75rem;
    overflow-x: auto;
  }

  :global(.ne-prosemirror pre code) {
    background: none;
    padding: 0;
    font-size: 0.875em;
    color: var(--code-normal);
  }

  :global(.ne-prosemirror a) {
    color: var(--link-color, #4a90e2);
    text-decoration: underline;
    cursor: pointer;
  }

  /* Wiki-links look like Obsidian internal links */
  :global(.ne-prosemirror a[href^="wikilink://"]) {
    color: var(--link-color, #4a90e2);
    text-decoration: none;
    border-bottom: 1px solid var(--link-color, #4a90e2);
    font-weight: 500;
  }

  :global(.ne-prosemirror hr) {
    border: none;
    border-top: 1px solid var(--background-modifier-border);
    margin: 1em 0;
  }

  /* ── Markdown textarea ── */
  .ne-textarea {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
    font-size: 0.875rem;
    color: var(--text-normal);
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    font-family: var(--font-monospace);
    min-height: 200px;
    line-height: 1.55;
    transition: border-color 0.1s, background 0.1s;
  }

  .ne-textarea:focus {
    outline: none;
    border-color: var(--interactive-accent);
    background: var(--background-primary);
  }

  .ne-textarea::placeholder {
    color: var(--text-faint);
  }

  .ne-md-wrapper {
    position: relative;
  }

  /* ── Markdown preview ── */
  .ne-preview {
    min-height: 200px;
    padding: 0.6rem 0.75rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    font-size: 0.9rem;
    line-height: 1.65;
    box-sizing: border-box;
  }

  /* ── Link autocomplete ── */
  .ne-suggestions {
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

  .ne-suggestions li {
    padding: 0.3rem 0.75rem;
    font-size: 0.875rem;
    cursor: pointer;
    color: var(--text-normal);
  }

  .ne-suggestions li.selected,
  .ne-suggestions li:hover {
    background: var(--background-modifier-hover);
  }

  /* ── Link popover bar ── */
  .ne-link-bar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.5rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-top: none;
  }

  .ne-link-input {
    flex: 1;
    font-size: 0.8rem;
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 3px;
    background: var(--background-primary);
    color: var(--text-normal);
    outline: none;
    font-family: inherit;
  }

  .ne-link-input:focus {
    border-color: var(--interactive-accent);
  }

  .ne-link-confirm {
    font-size: 0.75rem;
    padding: 0.2rem 0.55rem;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
  }

  .ne-link-cancel {
    font-size: 0.8rem;
    padding: 0.2rem 0.35rem;
    background: transparent;
    color: var(--text-muted);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    line-height: 1;
  }

  .ne-link-cancel:hover {
    color: var(--text-normal);
  }
</style>
