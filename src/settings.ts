import { App, PluginSettingTab, Setting } from "obsidian";
import type EntitiesPlugin from "./main";

export interface EntitiesSettings {
  attachmentsDir: string;
  entitiesDir: string;
}

export const DEFAULT_SETTINGS: EntitiesSettings = {
  attachmentsDir: "attachments",
  entitiesDir: "Entities",
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
  }
}
