import { App, PluginSettingTab, Setting } from "obsidian";
import type HeadingJoystickPlugin from "./main";

export interface HeadingJoystickSettings {
  knobSize: number;
  boundaryRadius: number;
  knobOpacity: number;
  bottomMargin: number;
  deadzonePercent: number;
  enableOnDesktop: boolean;
  showDebug: boolean;
}

export const DEFAULT_SETTINGS: HeadingJoystickSettings = {
  knobSize: 56,
  boundaryRadius: 80,
  knobOpacity: 0.35,
  bottomMargin: 12,
  deadzonePercent: 35,
  enableOnDesktop: false,
  showDebug: false,
};

export class HeadingJoystickSettingTab extends PluginSettingTab {
  plugin: HeadingJoystickPlugin;

  constructor(app: App, plugin: HeadingJoystickPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Knob size")
      .setDesc("Diameter of the joystick knob in pixels.")
      .addSlider((slider) =>
        slider
          .setLimits(32, 96, 2)
          .setValue(this.plugin.settings.knobSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.knobSize = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Boundary radius")
      .setDesc("Radius of the boundary circle shown while dragging, in pixels.")
      .addSlider((slider) =>
        slider
          .setLimits(48, 140, 2)
          .setValue(this.plugin.settings.boundaryRadius)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.boundaryRadius = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Knob opacity")
      .setDesc("Idle opacity of the knob (0.1 - 1.0).")
      .addSlider((slider) =>
        slider
          .setLimits(0.1, 1, 0.05)
          .setValue(this.plugin.settings.knobOpacity)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.knobOpacity = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Bottom margin")
      .setDesc("Gap between the knob and the top of the keyboard, in pixels.")
      .addSlider((slider) =>
        slider
          .setLimits(0, 60, 1)
          .setValue(this.plugin.settings.bottomMargin)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.bottomMargin = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Deadzone")
      .setDesc("Center deadzone as a percent of the boundary radius; releasing inside it sets plain text.")
      .addSlider((slider) =>
        slider
          .setLimits(10, 70, 1)
          .setValue(this.plugin.settings.deadzonePercent)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.deadzonePercent = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Enable on desktop")
      .setDesc("For developer testing with mobile emulation. Off by default.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableOnDesktop)
          .onChange(async (value) => {
            this.plugin.settings.enableOnDesktop = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show debug overlay")
      .setDesc(
        "Shows keyboard/focus/editor detection state at the top of the screen. For troubleshooting only."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showDebug)
          .onChange(async (value) => {
            this.plugin.settings.showDebug = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
