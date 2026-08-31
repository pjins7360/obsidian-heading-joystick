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
      this.app.workspace.on("active-leaf-change", () => this.schedulePositionSettle())
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.schedulePositionSettle())
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
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private handleKeyboard(_state: KeyboardState): void {
    this.schedulePositionSettle();
  }

  private rafHandle: number | null = null;
  private settleUntil = 0;

  // Obsidian's own .mobile-toolbar (and possibly other native chrome) can
  // appear/resize/animate independent of any DOM event we listen for, so a
  // short polling burst after a trigger keeps the knob glued to it smoothly
  // instead of jumping once an event finally fires.
  private schedulePositionSettle(durationMs = 700): void {
    this.settleUntil = Date.now() + durationMs;
    if (this.rafHandle === null) this.tick();
  }

  private tick = (): void => {
    this.evaluate();
    if (Date.now() < this.settleUntil) {
      this.rafHandle = requestAnimationFrame(this.tick);
    } else {
      this.rafHandle = null;
    }
  };

  private evaluate(): void {
    if (!this.joystick || !this.watcher) return;
    const { keyboardVisible, keyboardHeight, editorFocused } =
      this.watcher.getState();
    const editorReady = this.isEditorActive();

    if (editorFocused && editorReady) {
      const { offset, source } = this.computeBottomOffset(keyboardHeight);
      this.joystick.show(offset);
      this.updateDebug(
        `kb:${keyboardVisible ? "y" : "n"}/${Math.round(
          keyboardHeight
        )} src:${source} off:${Math.round(offset)}`
      );
    } else {
      this.joystick.hide();
      this.updateDebug(`hidden focus:${editorFocused ? "y" : "n"} editor:${editorReady ? "y" : "n"}`);
    }
  }

  // Obsidian positions .mobile-toolbar directly above the keyboard itself
  // (it's their own solved problem), so anchoring off its real screen
  // position sidesteps unreliable visualViewport keyboard-height detection
  // in this webview. Falls back to the visualViewport estimate if the
  // toolbar is absent (e.g. user disabled it in Obsidian's settings).
  private computeBottomOffset(keyboardHeight: number): {
    offset: number;
    source: "toolbar" | "viewport";
  } {
    const toolbar = document.querySelector<HTMLElement>(".mobile-toolbar");
    if (toolbar && toolbar.offsetParent !== null) {
      const rect = toolbar.getBoundingClientRect();
      const aboveToolbar = window.innerHeight - rect.top;
      if (aboveToolbar > 0) {
        return { offset: aboveToolbar + this.settings.bottomMargin, source: "toolbar" };
      }
    }
    return { offset: keyboardHeight + this.settings.bottomMargin, source: "viewport" };
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
