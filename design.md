# 1. System Overview

You are building a **local-first entity application framework** where:

* Markdown files are the persistence layer
* YAML frontmatter is the structured data layer
* Svelte views are the application runtime
* Each entity type has a fully custom UI
* Editing is app-like (views own editing)
* Saves are debounced full-document writes

This is not a plugin augmentation system — it is a **UI runtime over a file-based entity database**.

---

# 2. Core Design Principles

## 2.1 Document-first persistence

* Every entity is a Markdown file
* Files are the source of truth
* No external database required for correctness

---

## 2.2 YAML = structured state only

YAML contains:

* entity identity
* typed fields
* relationships
* structured metadata

Example:

```yaml
type: person
name: Jane Smith
manager: person_bob_jones
projects:
  - project_alpha
  - project_beta
```

---

## 2.3 Markdown = unstructured notes only

Markdown contains:

* freeform notes
* observations
* contextual text

No structured meaning is extracted from it.

---

## 2.4 Full app-like editing

* Views are the primary interface
* No direct YAML editing in normal workflow
* Markdown editing is secondary and unstructured

---

## 2.5 Per-type custom views

Each entity type has a fully bespoke UI:

* no generic form system
* no reusable field components
* each view is independently designed

---

## 2.6 Session UI state is ephemeral

* scroll position
* tab state
* expanded sections
* temporary UI selections

Not persisted to disk.

---

## 2.7 Debounced document-level persistence

* in-memory state is authoritative during session
* full entity is serialized periodically
* write-back occurs via timer + lifecycle hooks

---

## 2.8 Type-based routing only

Entity type determines view:

```yaml
type: recipe
```

→ `RecipeView`

No heuristics or folder-based inference.

---

## 2.9 View shell reuse per file context

* one view instance per leaf
* reused across entity switches
* entity state is swapped
* UI state is reset

---

## 2.10 Relationship model is YAML-only

* no markdown links used for structure
* relationships are explicit fields

---

# 3. High-Level Architecture

## 3.1 System pipeline

```text
Markdown File
   ↓
YAML Parser
   ↓
Entity Normalization Layer
   ↓
Svelte Entity State Store
   ↓
Custom Entity View (per type)
   ↓
Mutation API
   ↓
Debounced Serializer
   ↓
Vault Write
```

---

## 3.2 Runtime components

### A. Entity Parser

Responsible for:

* extracting YAML
* separating markdown body
* validating minimal structure

---

### B. Entity State (canonical runtime model)

```ts
Entity {
  id: string
  type: string
  fields: Record<string, any>
  body: string
}
```

---

### C. Mutation API

Controlled state modifications:

```ts
updateField(key, value)
updateRelation(key, entityId)
updateBody(text)
```

No direct state mutation allowed outside this layer.

---

### D. Svelte Store Layer

Two-state system:

#### 1. Entity State (persistent)

* canonical structured data
* synced to file

#### 2. UI Session State (ephemeral)

* scroll
* toggles
* selection state

---

### E. View System

Each entity type defines:

```ts
PersonView
ProjectView
RecipeView
MeetingView
```

Each view:

* owns layout
* owns interactions
* owns editing UI
* does NOT own persistence logic

---

### F. View Shell Lifecycle

Per Obsidian leaf:

* View instance persists
* Entity data is swapped in/out
* UI state resets on entity change

---

### G. Serialization Engine

Responsible for:

* converting entity state → YAML + Markdown
* enforcing canonical ordering
* producing deterministic output

---

### H. Debounced Save Engine

* triggers on state change
* flushes every X seconds (2–5s typical)
* flushes on lifecycle events (tab change, quit)

---

# 4. Entity Model Specification

## 4.1 Canonical structure

```ts
type Entity = {
  id: string
  type: string
  fields: Record<string, any>
  body: string
}
```

---

## 4.2 YAML rules

* all structured fields live in YAML
* relationships are explicit IDs
* arrays allowed
* optional fields allowed
* extra fields allowed (schema-light)

---

## 4.3 Markdown rules

* unstructured only
* no parsing of meaning
* no relationship extraction

---

# 5. View System Design

## 5.1 Routing

Views are looked up by entity type string:

```ts
viewRegistry[type]  // e.g. "person" → PersonView constructor
```

The registry is populated at plugin load time from external view bundles (see §5.4).
A built-in `FallbackView` is used for any unregistered type.

---

## 5.2 View lifecycle

### On file open:

1. `file-open` event fires
2. metadata cache checked for `type` frontmatter field
3. if typed, leaf is switched from `MarkdownView` → `EntityView`
4. `EntityView.onLoadFile` parses the file into an `Entity`
5. correct view component resolved from registry and mounted

---

### On entity switch:

1. flush current entity to disk
2. destroy current view component
3. parse new file
4. mount new view component

---

### On file close:

1. flush entity (immediate, not debounced)
2. destroy view component

---

## 5.3 View structure pattern (recommended)

Each view follows consistent zones:

* Header
* Primary content
* Secondary panel
* Notes section (markdown)
* Metadata editor

---

## 5.4 Dynamic view loading

Views are **not bundled into the main plugin**. Each view type is a separate
self-contained CJS bundle, compiled and deployed independently.

### Directory layout

```
.obsidian/
  plugins/
    entity-views/
      main.js          ← main plugin (orchestration only)
      manifest.json
  entity-views/        ← external view bundles
    person/
      index.js         ← PersonView bundle
    project/
      index.js
    recipe/
      index.js
```

### Loading sequence (at plugin startup)

1. Plugin scans `.obsidian/entity-views/` for subdirectories
2. Each subdirectory containing `index.js` is treated as a view bundle
3. Node's native `require` (via `eval('require')`) loads each bundle
4. The require cache is cleared before each load so plugin reloads always
   get a fresh bundle — no stale code
5. The bundle's default export (a Svelte component constructor) is registered
   in the view registry under the subdirectory name

### Bundle format

* CJS module (esbuild `format: "cjs"`)
* Default export: Svelte component constructor
* Svelte runtime **included** in bundle (no external dependency on host)
* Only `obsidian` and `electron` are external (provided by the host)
* Props: `entity`, `onMutate`, `resolveAssetUrl`, `onPickPhoto`

### Why separate bundles

* View code can be updated without reloading the main plugin
* Each view is independently deployable
* View authors don't need to touch the core plugin
* Build times stay fast (only changed views need rebuilding)

---

# 6. Editing System

## 6.1 Ownership model

> Views own editing, not markdown.

All edits flow through:

* mutation API
* reactive state updates
* debounced persistence

---

## 6.2 Save strategy

### Document-level debounced save:

* timer-based flush (2–5s)
* full serialization
* overwrite file

---

## 6.3 Required safety triggers

* file switch
* tab change
* app shutdown
* manual save

---

## 6.4 Undo model (recommended)

* mutation log in memory
* optional snapshot stack
* independent of file system

---

# 7. UI State Model

## 7.1 Persistent entity state

* YAML + structured fields

## 7.2 Session UI state (ephemeral)

Examples:

* scroll position
* expanded sections
* selected items
* temporary filters

Rule:

> never written to disk

---

# 8. Relationship System

## 8.1 Model

Relationships exist ONLY in YAML:

```yaml
manager: person_bob_jones
projects:
  - project_alpha
```

---

## 8.2 Characteristics

* explicit graph edges
* deterministic structure
* no markdown inference
* AI-friendly indexing

---

# 9. Entity Types (Initial Scope)

## 9.1 Person

* profile view
* manager relationship
* projects
* notes

## 9.2 Project

* status
* members
* timeline
* tasks (future expansion)

## 9.3 Recipe

* image hero
* ingredients
* steps
* metadata (cook time, servings)

## 9.4 Meeting

* agenda
* participants
* notes
* action items

---

# 10. Media / Asset Handling

## 10.1 Storage model

Binary assets (photos, images, attachments) are stored inside the vault so
they are versionable, portable, and accessible without a network.\
The default root is configurable via plugin settings (`assetsDir`, default: `attachments`).

Directory layout:

```
{vault}/
  {assetsDir}/           ← default: "attachments" (user-configurable)
    person/
      jane-headshot.jpg
    recipe/
      pasta-hero.png
```

The folder per entity type keeps assets organised and avoids collisions across
unrelated files.

---

## 10.2 How assets are referenced in YAML

Assets are stored as **bare filenames** in YAML — not paths:

```yaml
type: person
photo: jane-headshot.jpg
```

The full vault path is resolved at runtime by the view shell:

```
{assetsDir}/{entityType}/{filename}
```

Storing only the filename keeps YAML portable if `assetsDir` changes.

---

## 10.3 URL resolution for display

Obsidian's renderer cannot display files via a plain filesystem path.
Assets must be converted to a resource URL using the vault adapter:

```ts
const assetPath = normalizePath(`${assetsDir}/${entityType}/${filename}`);
const url = app.vault.adapter.getResourcePath(assetPath);
// e.g. "app://local/Users/chris/Dev/.../attachments/person/jane.jpg?..."
```

The `resolveAssetUrl(filename)` function is provided to each view as a prop
by the `EntityView` shell, so view code never handles path construction
directly.

---

## 10.4 Upload flow

1. User clicks/taps the asset control in the view (e.g. avatar area)
2. A hidden `<input type="file">` is triggered programmatically
3. The selected `File` object is passed to `onPickPhoto(file)` prop
4. `EntityView.savePhoto` in the plugin shell:
   a. Ensures `{assetsDir}/{entityType}/` folder exists in vault
   b. Writes the binary via `vault.createBinary` or `vault.modifyBinary`
   c. Returns the stored filename
5. View stores the filename into the entity field and calls `onMutate`
6. Debounced save engine writes the updated YAML to disk

---

## 10.5 No base64 storage

Rejected because:

* inflates file size significantly
* breaks git diffs
* causes performance problems in large vaults

---

# 11. Key Constraints

## 11.1 No schema enforcement at file level

* schema-light YAML
* runtime interpretation

## 11.2 No markdown structure parsing

* markdown is freeform only

## 11.3 No reusable UI components

* each view is custom-built
* only shared system primitives exist

---

# 12. System Primitives (Shared Layer)

Even with custom views, you must standardize:

* mutation API
* save engine
* entity lifecycle hooks
* routing system
* serialization engine

---

# 13. Mental Model Summary

You are building:

> a local-first, file-backed, schema-light entity runtime with per-type application UIs

Where:

| Layer    | Responsibility       |
| -------- | -------------------- |
| Markdown | storage              |
| YAML     | structured state     |
| Svelte   | runtime UI           |
| Views    | application logic    |
| Plugin   | orchestration engine |

---

# 14. What this system becomes

If executed correctly, this evolves into:

* a Notion-like system
* but local-first
* file-native
* fully customizable per entity type
* AI/RAG-ready
* extensible into workflows later

