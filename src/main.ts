import { MarkdownView, Platform, Plugin } from "obsidian";
import {
  DEFAULT_SETTINGS,
  HeadingJoystickSettingTab,
  HeadingJoystickSettings,
} from "./settings";
import { KeyboardWatcher, KeyboardState } from "./keyboard-watcher";
import { Joystick } from "./joystick";
import {
  JoystickState,
  applyHeadingToLine,
  computeCursorAdjustment,
  newPrefixLength,
  stripHeadingPrefix,
} from "./heading-action";

export default class HeadingJoystickPlugin extends Plugin {
  settings: HeadingJoystickSettings = DEFAULT_SETTINGS;
  private watcher: KeyboardWatcher | null = null;
  private joystick: Joystick | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new HeadingJoystickSettingTab(this.app, this));

    if (Platform.isMobile || this.settings.enableOnDesktop) {
      this.activateFeature();
    }
  }

  onunload(): void {
    this.deactivateFeature();
  }

  private activateFeature(): void {
    if (this.joystick) return;

    this.joystick = new Joystick(this.settings, (state) =>
      this.handleCommit(state)
    );
    this.joystick.attach(document.body);

    this.watcher = new KeyboardWatcher((state) => this.handleKeyboard(state));
    this.watcher.start();

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.evaluate())
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.evaluate())
    );
  }

  private deactivateFeature(): void {
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }
    if (this.joystick) {
      this.joystick.detach();
      this.joystick = null;
    }
    if (this.debugEl) {
      this.debugEl.remove();
      this.debugEl = null;
    }
  }

  private handleKeyboard(_state: KeyboardState): void {
    this.evaluate();
  }

  private evaluate(): void {
    if (!this.joystick || !this.watcher) return;
    const { keyboardVisible, keyboardHeight, editorFocused } =
      this.watcher.getState();
    const editorReady = this.isEditorActive();

    // Editor focus is the primary signal. On iOS the webview itself resizes
    // when the keyboard opens, so keyboardHeight is often 0 and fixed
    // bottom-anchoring already sits above the keyboard; when the webview does
    // NOT resize, keyboardHeight compensates.
    if (editorFocused && editorReady) {
      const bottomOffset =
        keyboardHeight + this.settings.bottomMargin + this.mobileToolbarHeight();
      this.joystick.show(bottomOffset);
    } else {
      this.joystick.hide();
    }
    this.updateDebug(
      `kb:${keyboardVisible ? "y" : "n"}/${Math.round(keyboardHeight)} focus:${
        editorFocused ? "y" : "n"
      } editor:${editorReady ? "y" : "n"}`
    );
  }

  private debugEl: HTMLDivElement | null = null;

  private updateDebug(text: string): void {
    if (!this.settings.showDebug) {
      if (this.debugEl) {
        this.debugEl.remove();
        this.debugEl = null;
      }
      return;
    }
    if (!this.debugEl) {
      this.debugEl = document.createElement("div");
      this.debugEl.addClass("heading-joystick-debug");
      document.body.appendChild(this.debugEl);
    }
    this.debugEl.setText(text);
  }

  private isEditorActive(): boolean {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return false;
    const mode = view.getMode();
    return mode === "source";
  }

  private mobileToolbarHeight(): number {
    const el = document.querySelector<HTMLElement>(".mobile-toolbar");
    return el ? el.offsetHeight : 0;
  }

  private handleCommit(state: JoystickState | null): void {
    this.evaluate();
    if (state === null) return;

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const editor = view.editor;

    const cursor = editor.getCursor("head");
    const line = cursor.line;
    const original = editor.getLine(line);
    const { prefixLen: oldPrefixLen } = stripHeadingPrefix(original);

    const updated = applyHeadingToLine(original, state);
    editor.setLine(line, updated);

    const newCh = computeCursorAdjustment(
      cursor.ch,
      oldPrefixLen,
      newPrefixLength(state)
    );
    editor.setCursor({ line, ch: newCh });
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    if (this.joystick) this.joystick.refreshSettings(this.settings);
    if ((Platform.isMobile || this.settings.enableOnDesktop) && !this.joystick) {
      this.activateFeature();
    } else if (!Platform.isMobile && !this.settings.enableOnDesktop) {
      this.deactivateFeature();
    }
    this.evaluate();
  }
}
