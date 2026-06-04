import { App, Modal, Notice, TFile, stringifyYaml } from "obsidian";
import { getRegisteredTypes } from "./registry";
import type EntitiesPlugin from "./main";

export class CreateEntityModal extends Modal {
  private selectedType = "";
  private nameInput!: HTMLInputElement;

  /**
   * @param targetDir  If provided, the entity file is created in this
   *                   directory instead of settings.entitiesDir.
   */
  constructor(
    app: App,
    private plugin: EntitiesPlugin,
    private targetDir?: string,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("New Entity");
    const { contentEl } = this;
    contentEl.empty();

    const types = getRegisteredTypes();
    if (types.length === 0) {
      contentEl.createEl("p", {
        text: "No entity types are registered. Ensure views are installed and reload the plugin.",
      });
      return;
    }

    // ── Type selector ────────────────────────────────────────────────────────
    contentEl.createEl("div", { text: "Type", cls: "entity-modal-label" });
    const typeRow = contentEl.createDiv({ cls: "entity-type-row" });

    for (const t of types) {
      const btn = typeRow.createEl("button", {
        text: t.charAt(0).toUpperCase() + t.slice(1),
        cls: "entity-type-btn",
      });
      btn.addEventListener("click", () => {
        typeRow
          .querySelectorAll<HTMLButtonElement>(".entity-type-btn")
          .forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        this.selectedType = t;
      });
    }

    // Select the first type by default.
    const firstBtn = typeRow.querySelector<HTMLButtonElement>(".entity-type-btn");
    if (firstBtn) firstBtn.click();

    // ── Name field ───────────────────────────────────────────────────────────
    contentEl.createEl("div", { text: "Name", cls: "entity-modal-label" });
    this.nameInput = contentEl.createEl("input", { cls: "entity-name-input" });
    this.nameInput.type = "text";
    this.nameInput.placeholder = "Entity name";
    this.nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handleCreate();
    });

    // Update placeholder when type changes
    const updatePlaceholder = () => {
      if (this.selectedType === "meeting") {
        const today = new Date().toISOString().slice(0, 10);
        this.nameInput.placeholder = `${today} Meeting name`;
      } else {
        this.nameInput.placeholder = "Entity name";
      }
    };
    typeRow.querySelectorAll<HTMLButtonElement>(".entity-type-btn").forEach((btn) => {
      btn.addEventListener("click", updatePlaceholder);
    });
    updatePlaceholder();

    // ── Footer ───────────────────────────────────────────────────────────────
    const footer = contentEl.createDiv({ cls: "entity-modal-footer" });
    const createBtn = footer.createEl("button", { text: "Create", cls: "mod-cta" });
    createBtn.addEventListener("click", () => this.handleCreate());

    this.nameInput.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  /**
   * Parse the entity name into sensible default field values so the view
   * is pre-populated when the file first opens.
   */
  private buildInitialFields(type: string, name: string): Record<string, unknown> {
    switch (type) {
      case "person": {
        // Strip a leading date prefix if present (e.g. copied from a meeting name)
        const bare = name.replace(/^\d{4}-\d{2}-\d{2}\s+/, "").trim();
        const parts = bare.split(/\s+/);
        const firstName = parts[0] ?? "";
        const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
        const middleName = parts.length > 2 ? parts.slice(1, -1).join(" ") : "";
        const nameField: Record<string, unknown> = { firstName };
        if (middleName) nameField.middleName = middleName;
        if (lastName) nameField.lastName = lastName;
        return { name: nameField };
      }
      case "meeting": {
        // Name may already have a date prefix (e.g. "2026-06-01 Kickoff").
        const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})\s+(.*)/);
        if (dateMatch) {
          return { title: dateMatch[2].trim(), date: dateMatch[1] };
        }
        return { title: name };
      }
      case "org": {
        return { name };
      }
      default:
        return {};
    }
  }

  private async handleCreate(): Promise<void> {
    let name = this.nameInput.value.trim();
    if (!name) {
      new Notice("Enter a name for the entity.");
      return;
    }
    if (!this.selectedType) {
      new Notice("Select an entity type.");
      return;
    }

    // Prepend today's date to meeting names if not already present
    if (this.selectedType === "meeting") {
      const today = new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}/.test(name)) {
        name = `${today} ${name}`;
      }
    }

    const dir = (this.targetDir ?? this.plugin.settings.entitiesDir).trim();
    const filePath = dir ? `${dir}/${name}.md` : `${name}.md`;

    // Ensure the target folder exists.
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
      await this.app.vault.createFolder(dir);
    }

    if (this.app.vault.getAbstractFileByPath(filePath)) {
      new Notice(`"${filePath}" already exists.`);
      return;
    }

    const fields = this.buildInitialFields(this.selectedType, name);
    const yaml = stringifyYaml({ type: this.selectedType, ...fields }).trimEnd();
    const content = `---\n${yaml}\n---\n`;
    const file = await this.app.vault.create(filePath, content);
    this.close();
    await this.app.workspace.getLeaf(false).openFile(file as TFile);
  }
}
