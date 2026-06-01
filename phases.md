# Implementation Phases

---

## Phase 1 — Core Infrastructure

The non-negotiable plumbing everything else depends on:

* YAML/Markdown parser → `Entity` model
* View registry + type-based routing
* Obsidian leaf integration (mount/unmount a Svelte component)
* Mutation API (`updateField`, `updateRelation`, `updateBody`)
* Serializer (Entity → YAML + Markdown string)
* Debounced save engine + safety flush triggers (tab change, close, manual save)

**Exit criterion:** Open a file, parse it, display raw fields, edit one field, see it written back to disk.

> Priority note: Serializer determinism must be locked in this phase — every subsequent phase inherits noise in file diffs if it isn't.

---

## Phase 2 — First Full View

Pick the simplest entity type (`Person`) and build the complete loop end-to-end:

* `PersonView` with real editing UI
* All fields editable through the mutation API
* Relationship fields (display only — show the ID, no resolution yet)
* Notes section (markdown body editing)

**Exit criterion:** A usable Person entity that feels like an app, not a YAML editor.

---

## Phase 3 — Remaining Entity Types

With infrastructure proven, build out the other views:

* `RecipeView` — structured lists (ingredients, steps); tests ordered array mutation
* `ProjectView` — member relationships and status fields
* `MeetingView` — resolve the action items tension (YAML structured fields vs. freeform markdown) before building this view

---

## Phase 4 — Relationship Resolution

Upgrade relationships from "display ID" to "display entity":

* Vault index (type + ID → file path)
* Inline entity previews in relationship fields
* Relationship mutation (link/unlink entities by ID)

**Exit criterion:** Clicking a relationship field navigates to or previews the related entity.

---

## Phase 5 — Media Handling

* Drag/drop image into a view
* Copy file to `/attachments/{entity-type}/`
* Store path in YAML field
* Live preview rendered in view

---

## Phase 6 — Hardening

* Unknown/missing `type` fallback view or error state
* Undo (mutation log — infrastructure is in place by this point)
* Error states: corrupt YAML, missing related entities
* Performance: large vault indexing, fast entity lookup
