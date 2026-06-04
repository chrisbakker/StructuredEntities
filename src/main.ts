import { MarkdownView, Plugin, TFolder, WorkspaceLeaf } from "obsidian";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { EntityView, ENTITY_VIEW_TYPE } from "./EntityView";
import { parseEntity } from "./parser";
import { registerEntityView, getEntityView } from "./registry";
import { DEFAULT_SETTINGS, EntitiesSettingTab } from "./settings";
import type { EntitiesSettings } from "./settings";
import { CreateEntityModal } from "./CreateEntityModal";

export default class EntitiesPlugin extends Plugin {
  settings!: EntitiesSettings;

  // Guard against re-entrant routing when we call leaf.setViewState.
  private isRouting = false;
  // Leaves we've observed before; used to distinguish brand-new workaround
  // leaves (Obsidian spawned them because EntityView can't host .md nav)
  // from tabs the user opened intentionally.
  private seenLeaves = new WeakSet<WorkspaceLeaf>();

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new EntitiesSettingTab(this.app, this));

    // Dynamically load view bundles from the views sub-directory.
    this.loadViews();

    this.addRibbonIcon("file-plus", "New entity", () => {
      new CreateEntityModal(this.app, this).open();
    });

    // File-explorer context menu: right-click a folder → "New entity here…"
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        const folder = file instanceof TFolder ? file : file.parent;
        if (!folder) return;
        menu.addItem((item) => {
          item
            .setTitle("New entity here…")
            .setIcon("file-plus")
            .setSection("action")
            .onClick(() => new CreateEntityModal(this.app, this, folder.path).open());
        });
      })
    );

    this.registerView(
      ENTITY_VIEW_TYPE,
      (leaf) => new EntityView(leaf, () => this.settings)
    );

    // Auto-route entity files away from the default MarkdownView.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", async (leaf) => {
        // Always register freshness before any early returns.
        const isNew = leaf != null && !this.seenLeaves.has(leaf);
        if (leaf) this.seenLeaves.add(leaf);

        if (this.isRouting) return;
        if (!leaf || !(leaf.view instanceof MarkdownView)) return;

        const file = leaf.view.file;
        if (!file || file.extension !== "md") return;

        const content = await this.app.vault.read(file);
        const entity = parseEntity(file.path, content);
        if (!entity) return;
        // Don't route files whose view type has been disabled.
        if (!getEntityView(entity.type)) return;

        this.isRouting = true;
        try {
          if (isNew) {
            // Brand-new leaf: Obsidian created it because the active tab was
            // an EntityView (which can't natively host .md navigation).
            // Reuse the existing EntityView instead of adding a new tab.
            const reuse = this.findReusableEntityLeaf(leaf);
            if (reuse) {
              await reuse.setViewState({
                type: ENTITY_VIEW_TYPE,
                state: { file: file.path },
              });
              this.app.workspace.setActiveLeaf(reuse, { focus: true });
              setTimeout(() => leaf.detach(), 0);
              return;
            }
          }
          // Existing leaf (user's intentional tab), or no reusable
          // EntityView found → convert this leaf in place.
          await leaf.setViewState({
            type: ENTITY_VIEW_TYPE,
            state: { file: file.path },
          });
        } finally {
          this.isRouting = false;
        }
      })
    );

    // Handle any entity file already open when the plugin loads.
    this.app.workspace.onLayoutReady(async () => {
      // Pre-register all existing leaves so they aren't mistaken for new
      // workaround leaves later.
      this.app.workspace.iterateAllLeaves(l => this.seenLeaves.add(l));

      const active = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!active?.file) return;

      const content = await this.app.vault.read(active.file);
      const startupEntity = parseEntity(active.file.path, content);
      if (!startupEntity || !getEntityView(startupEntity.type)) return;

      this.isRouting = true;
      try {
        await active.leaf.setViewState({
          type: ENTITY_VIEW_TYPE,
          state: { file: active.file.path },
        });
      } finally {
        this.isRouting = false;
      }
    });
  }

  async onunload() {
    // Let open entity leaves revert to MarkdownView on plugin disable.
    this.app.workspace.detachLeavesOfType(ENTITY_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * Scan <plugin-dir>/views/ for *.js bundles and register each one.
   * Each bundle is a CJS module that exports { type: string, component }.
   */
  private loadViews(): void {
    const adapter = this.app.vault.adapter as { basePath: string };
    const viewsDir = join(
      adapter.basePath,
      this.app.vault.configDir,
      "plugins",
      this.manifest.id,
      "views"
    );

    if (!existsSync(viewsDir)) return;

    for (const entry of readdirSync(viewsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const bundlePath = join(viewsDir, entry.name, "index.js");
      if (!existsSync(bundlePath)) continue;
      try {
        const code = readFileSync(bundlePath, "utf8");
        const mod = { exports: {} as Record<string, unknown> };
        // Views are fully self-contained CJS bundles with no runtime require calls.
        // eslint-disable-next-line no-new-func
        new Function("module", "exports", code)(mod, mod.exports);
        const { type, component } = mod.exports as { type?: string; component?: unknown };
        if (type && component) {
          if (this.settings.disabledViews.includes(type)) continue;
          registerEntityView(type, component as Parameters<typeof registerEntityView>[1]);
        }
      } catch (e) {
        console.error(`[entities] Failed to load view bundle: ${entry.name}/index.js`, e);
      }
    }
  }

  /**
   * Find any non-pinned EntityView leaf that isn't the one currently being
   * routed (exclude). Returns the first match or null.
   */
  private findReusableEntityLeaf(exclude: WorkspaceLeaf): WorkspaceLeaf | null {
    let found: WorkspaceLeaf | null = null;
    this.app.workspace.iterateAllLeaves((l) => {
      if (found || l === exclude) return;
      if (l.view.getViewType() !== ENTITY_VIEW_TYPE) return;
      if ((l as any).pinned) return;
      found = l;
    });
    return found;
  }
}
