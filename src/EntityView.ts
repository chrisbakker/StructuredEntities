import {
  FileSystemAdapter,
  ItemView,
  MarkdownRenderer,
  TFile,
  ViewStateResult,
  WorkspaceLeaf,
} from "obsidian";
import type { SvelteComponent } from "svelte";
import type { Entity } from "./types";
import { parseEntity } from "./parser";
import { serializeEntity } from "./serializer";
import { updateField, updateBody } from "./mutation";
import { getEntityView } from "./registry";
import EntityShell from "./views/EntityShell.svelte";
import type { EntitiesSettings } from "./settings";

export const ENTITY_VIEW_TYPE = "entity-view";

const DEBOUNCE_MS = 1500;

export class EntityView extends ItemView {
  private entity: Entity | null = null;
  private component: SvelteComponent | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private filePath: string | null = null;

  constructor(leaf: WorkspaceLeaf, private getSettings: () => EntitiesSettings) {
    super(leaf);
  }

  getViewType(): string {
    return ENTITY_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.entity?.id ?? "Entity";
  }

  getIcon(): string {
    return "file-text";
  }

  onload(): void {
    super.onload();
    // Flush save whenever this leaf loses focus.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf !== this.leaf) {
          this.flushSave();
        }
      })
    );
  }

  async onOpen(): Promise<void> {
    // Mounting happens in setState once we know which file to load.
  }

  async onClose(): Promise<void> {
    await this.flushSave();
    this.destroyComponent();
  }

  async setState(
    state: { file?: string },
    result: ViewStateResult
  ): Promise<void> {
    if (state.file && state.file !== this.filePath) {
      await this.flushSave();
      this.destroyComponent();
      this.filePath = state.file;
      await this.loadAndMount();
    }
    await super.setState(state, result);
  }

  getState(): Record<string, unknown> {
    return { file: this.filePath };
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async loadAndMount(): Promise<void> {
    if (!this.filePath) return;
    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) return;

    const content = await this.app.vault.read(file);
    this.entity = parseEntity(this.filePath, content);
    if (!this.entity) return;

    this.contentEl.empty();

    // Resolve view component: prefer registered type-specific view, fall back
    // to the generic raw-fields shell used in Phase 1.
    const ViewComponent =
      getEntityView(this.entity.type) ?? (EntityShell as unknown as typeof EntityShell);

    this.component = new ViewComponent({
      target: this.contentEl,
      props: {
        entity: this.entity,
        onUpdateField: (key: string, value: unknown) => {
          if (!this.entity) return;
          this.entity = updateField(this.entity, key, value);
          this.scheduleSave();
        },
        onUpdateBody: (text: string) => {
          if (!this.entity) return;
          this.entity = updateBody(this.entity, text);
          this.scheduleSave();
        },
        onAttachFile: async (data: ArrayBuffer, ext: string): Promise<string> => {
          const { attachmentsDir } = this.getSettings();
          const entityType = this.entity!.type;
          const entityId = this.entity!.id;
          const dir = `${attachmentsDir}/${entityType}`;
          const filePath = `${dir}/${entityId}.${ext}`;
          try { await this.app.vault.createFolder(attachmentsDir); } catch { /* exists */ }
          try { await this.app.vault.createFolder(dir); } catch { /* exists */ }
          const existing = this.app.vault.getAbstractFileByPath(filePath);
          if (existing instanceof TFile) {
            await this.app.vault.modifyBinary(existing, data);
          } else {
            await this.app.vault.createBinary(filePath, data);
          }
          return filePath;
        },
        resolveAssetPath: (vaultPath: string): string => {
          return (this.app.vault.adapter as FileSystemAdapter).getResourcePath(vaultPath);
        },
        renderMarkdown: (markdown: string, el: HTMLElement): Promise<void> => {
          return MarkdownRenderer.render(this.app, markdown, el, this.filePath ?? "", this);
        },
        openLink: (href: string, newLeaf: boolean): void => {
          if (/^https?:\/\//i.test(href)) {
            window.open(href, "_blank");
          } else if (newLeaf) {
            this.app.workspace.openLinkText(href, this.filePath ?? "", true);
          } else {
            const target = this.app.metadataCache.getFirstLinkpathDest(
              href,
              this.filePath ?? ""
            );
            if (target) {
              // leaf.openFile() is Obsidian's standard navigation API.
              // It pushes the current leaf state onto the history stack before
              // opening the new file, so back/forward arrows work correctly.
              // Routing then converts the resulting MarkdownView to EntityView.
              this.leaf.openFile(target);
            } else {
              // File doesn't exist yet — let Obsidian handle creation.
              this.app.workspace.openLinkText(href, this.filePath ?? "", false);
            }
          }
        },
        getSuggestions: (query: string): string[] => {
          const q = query.toLowerCase();
          return this.app.vault.getMarkdownFiles()
            .map(f => f.basename)
            .filter(name => name.toLowerCase().includes(q))
            .sort((a, b) => {
              const aStarts = a.toLowerCase().startsWith(q);
              const bStarts = b.toLowerCase().startsWith(q);
              if (aStarts && !bStarts) return -1;
              if (!aStarts && bStarts) return 1;
              return a.localeCompare(b);
            });
        },
        onCreateEntity: async (type: string, name: string): Promise<string> => {
          const { entitiesDir } = this.getSettings();
          const dir = entitiesDir.trim();
          const filePath = dir ? `${dir}/${name}.md` : `${name}.md`;
          if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
            await this.app.vault.createFolder(dir);
          }
          if (!this.app.vault.getAbstractFileByPath(filePath)) {
            const content = `---\ntype: ${type}\n---\n`;
            await this.app.vault.create(filePath, content);
          }
          return name;
        },
      },
    });
  }

  private destroyComponent(): void {
    if (this.component) {
      this.component.$destroy();
      this.component = null;
    }
    this.contentEl.empty();
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.writeEntity();
    }, DEBOUNCE_MS);
  }

  async flushSave(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.writeEntity();
  }

  private async writeEntity(): Promise<void> {
    if (!this.entity || !this.filePath) return;
    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) return;
    await this.app.vault.modify(file, serializeEntity(this.entity));
  }
}
