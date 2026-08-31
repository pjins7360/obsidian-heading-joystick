const KEYBOARD_HEIGHT_THRESHOLD = 100;

export interface KeyboardState {
  keyboardVisible: boolean;
  keyboardHeight: number;
  editorFocused: boolean;
}

export class KeyboardWatcher {
  private keyboardVisible = false;
  private keyboardHeight = 0;
  private editorFocused = false;
  private onChange: (state: KeyboardState) => void;
  private vv: VisualViewport | null;

  constructor(onChange: (state: KeyboardState) => void) {
    this.onChange = onChange;
    this.vv = window.visualViewport ?? null;
  }

  start(): void {
    if (this.vv) {
      this.vv.addEventListener("resize", this.handleViewportResize);
      this.vv.addEventListener("scroll", this.handleViewportResize);
    }
    // iOS Obsidian resizes the whole webview when the keyboard opens, so the
    // visualViewport delta can stay ~0; window resize catches that case.
    window.addEventListener("resize", this.handleViewportResize);
    document.addEventListener("focusin", this.handleFocusIn, true);
    document.addEventListener("focusout", this.handleFocusOut, true);
    const active = document.activeElement as HTMLElement | null;
    this.editorFocused = this.isEditorTarget(active);
    this.handleViewportResize();
  }

  stop(): void {
    if (this.vv) {
      this.vv.removeEventListener("resize", this.handleViewportResize);
      this.vv.removeEventListener("scroll", this.handleViewportResize);
    }
    window.removeEventListener("resize", this.handleViewportResize);
    document.removeEventListener("focusin", this.handleFocusIn, true);
    document.removeEventListener("focusout", this.handleFocusOut, true);
  }

  getState(): KeyboardState {
    return {
      keyboardVisible: this.keyboardVisible,
      keyboardHeight: this.keyboardHeight,
      editorFocused: this.editorFocused,
    };
  }

  private handleViewportResize = (): void => {
    const height = this.vv
      ? window.innerHeight - this.vv.height
      : 0;
    // small threshold ignores toolbar chrome noise
    const visible = height > KEYBOARD_HEIGHT_THRESHOLD;
    if (visible !== this.keyboardVisible || Math.round(height) !== Math.round(this.keyboardHeight)) {
      this.keyboardVisible = visible;
      this.keyboardHeight = visible ? height : 0;
      this.emit();
    }
  };

  private handleFocusIn = (evt: FocusEvent): void => {
    const target = evt.target as HTMLElement | null;
    if (this.isEditorTarget(target)) {
      if (!this.editorFocused) {
        this.editorFocused = true;
        this.emit();
      }
    }
  };

  private handleFocusOut = (evt: FocusEvent): void => {
    const target = evt.target as HTMLElement | null;
    if (this.isEditorTarget(target)) {
      if (this.editorFocused) {
        this.editorFocused = false;
        this.emit();
      }
    }
  };

  private isEditorTarget(el: HTMLElement | null): boolean {
    if (!el) return false;
    return !!el.closest(".cm-editor") || el.isContentEditable;
  }

  private emit(): void {
    this.onChange(this.getState());
  }
}
