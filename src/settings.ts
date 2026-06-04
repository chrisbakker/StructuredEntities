import { App, PluginSettingTab, Setting } from "obsidian";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type EntitiesPlugin from "./main";

export interface EntitiesSettings {
  attachmentsDir: string;
  entitiesDir: string;
  disabledViews: string[];
}

export const DEFAULT_SETTINGS: EntitiesSettings = {
  attachmentsDir: "attachments",
  entitiesDir: "Entities",
  disabledViews: [],
};

export class EntitiesSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: EntitiesPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Attachments directory")
      .setDesc("Vault-relative folder where entity attachments (images, etc.) are stored.")
      .addText(text =>
        text
          .setPlaceholder("attachments")
          .setValue(this.plugin.settings.attachmentsDir)
          .onChange(async (value) => {
            this.plugin.settings.attachmentsDir = value.trim() || "attachments";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Entities directory")
      .setDesc("Vault-relative folder where new entity files are created.")
      .addText(text =>
        text
          .setPlaceholder("Entities")
          .setValue(this.plugin.settings.entitiesDir)
          .onChange(async (value) => {
            this.plugin.settings.entitiesDir = value.trim() || "Entities";
            await this.plugin.saveSettings();
          })
      );

    // ── Installed views ──────────────────────────────────────────────────────
    const installedViews = this.getInstalledViewTypes();
    if (installedViews.length > 0) {
      containerEl.createEl("h3", { text: "Installed views" });
      containerEl.createEl("p", {
        text: "Disabled views will not be loaded. Reload the plugin (or restart Obsidian) for changes to take effect.",
        cls: "setting-item-description",
      });

      for (const viewType of installedViews) {
        const label = viewType.charAt(0).toUpperCase() + viewType.slice(1);
        new Setting(containerEl)
          .setName(label)
          .addToggle(toggle =>
            toggle
              .setValue(!this.plugin.settings.disabledViews.includes(viewType))
              .onChange(async (enabled) => {
                if (enabled) {
                  this.plugin.settings.disabledViews =
                    this.plugin.settings.disabledViews.filter(v => v !== viewType);
                } else {
                  if (!this.plugin.settings.disabledViews.includes(viewType)) {
                    this.plugin.settings.disabledViews = [
                      ...this.plugin.settings.disabledViews,
                      viewType,
                    ];
                  }
                }
                await this.plugin.saveSettings();
              })
          );
      }
    }
  }

  private getInstalledViewTypes(): string[] {
    const adapter = this.plugin.app.vault.adapter as { basePath: string };
    const viewsDir = join(
      adapter.basePath,
      this.plugin.app.vault.configDir,
      "plugins",
      this.plugin.manifest.id,
      "views"
    );
    if (!existsSync(viewsDir)) return [];
    return readdirSync(viewsDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && existsSync(join(viewsDir, e.name, "index.js")))
      .map(e => e.name)
      .sort();
  }
}
