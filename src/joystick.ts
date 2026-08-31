import {
  JoystickState,
  computeState,
  normalizeAngle,
} from "./heading-action";
import type { HeadingJoystickSettings } from "./settings";

const SECTOR_LABELS: Record<number, string> = {
  1: "#",
  2: "##",
  3: "###",
  4: "####",
  5: "#####",
  6: "######",
};

// sector center angle (degrees) for each heading level, matching computeState()
const SECTOR_CENTER_ANGLE: Record<number, number> = {
  5: 0,
  6: 60,
  1: 120,
  2: 180,
  3: 240,
  4: 300,
};

export class Joystick {
  private settings: HeadingJoystickSettings;
  private onCommit: (state: JoystickState | null) => void;

  private knobEl: HTMLDivElement;
  private boundaryEl: HTMLDivElement;
  private centerLabelEl: HTMLDivElement;
  private sectorLabelEls: Map<number, HTMLDivElement> = new Map();

  private activeTouchId: number | null = null;
  private centerX = 0;
  private centerY = 0;
  private lastState: JoystickState = { kind: "deadzone" };
  private leftDeadzone = false;

  constructor(
    settings: HeadingJoystickSettings,
    onCommit: (state: JoystickState | null) => void
  ) {
    this.settings = settings;
    this.onCommit = onCommit;

    this.knobEl = document.createElement("div");
    this.knobEl.addClass("heading-joystick-knob");

    this.boundaryEl = document.createElement("div");
    this.boundaryEl.addClass("heading-joystick-boundary");

    this.centerLabelEl = document.createElement("div");
    this.centerLabelEl.addClass("heading-joystick-center-label");
    this.centerLabelEl.setText("plain");
    this.boundaryEl.appendChild(this.centerLabelEl);

    for (const level of [1, 2, 3, 4, 5, 6]) {
      const label = document.createElement("div");
      label.addClass("heading-joystick-sector-label");
      label.setText(SECTOR_LABELS[level]);
      this.boundaryEl.appendChild(label);
      this.sectorLabelEls.set(level, label);
    }

    this.applyStyles();
    this.hideBoundary();

    this.knobEl.addEventListener("touchstart", this.handleTouchStart, {
      passive: false,
    });
    this.knobEl.addEventListener("touchmove", this.handleTouchMove, {
      passive: false,
    });
    this.knobEl.addEventListener("touchend", this.handleTouchEnd, {
      passive: false,
    });
    this.knobEl.addEventListener("touchcancel", this.handleTouchCancel, {
      passive: false,
    });
  }

  attach(parent: HTMLElement): void {
    parent.appendChild(this.boundaryEl);
    parent.appendChild(this.knobEl);
  }

  detach(): void {
    this.knobEl.detach();
    this.boundaryEl.detach();
  }

  refreshSettings(settings: HeadingJoystickSettings): void {
    this.settings = settings;
    this.applyStyles();
  }

  private applyStyles(): void {
    const size = this.settings.knobSize;
    this.knobEl.style.width = `${size}px`;
    this.knobEl.style.height = `${size}px`;
    this.knobEl.style.opacity = `${this.settings.knobOpacity}`;

    const boundaryDiameter = this.settings.boundaryRadius * 2;
    this.boundaryEl.style.width = `${boundaryDiameter}px`;
    this.boundaryEl.style.height = `${boundaryDiameter}px`;
    this.layoutSectorLabels();
  }

  private layoutSectorLabels(): void {
    const r = this.settings.boundaryRadius;
    const labelRadius = r * 0.7;
    for (const [level, el] of this.sectorLabelEls) {
      const angle = SECTOR_CENTER_ANGLE[level];
      const rad = (angle * Math.PI) / 180;
      // screen y grows downward, so negate the sine component
      const x = r + labelRadius * Math.cos(rad);
      const y = r - labelRadius * Math.sin(rad);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }

  // called by the plugin when keyboard/focus state says the joystick should show
  show(bottomOffset: number): void {
    const rightOffset = this.settings.boundaryRadius + 12;
    this.knobEl.style.right = `${rightOffset}px`;
    this.knobEl.style.bottom = `${bottomOffset}px`;
    this.knobEl.style.left = "";
    this.knobEl.style.top = "";
    this.knobEl.style.display = "flex";
  }

  hide(): void {
    if (this.activeTouchId !== null) return;
    this.knobEl.style.display = "none";
    this.hideBoundary();
  }

  isDragging(): boolean {
    return this.activeTouchId !== null;
  }

  private handleTouchStart = (evt: TouchEvent): void => {
    if (this.activeTouchId !== null) return;
    // preventDefault stops the keyboard from dismissing; stopPropagation stops
    // Obsidian's own swipe-gesture handlers from hijacking the drag.
    evt.preventDefault();
    evt.stopPropagation();

    const touch = evt.changedTouches[0];
    if (!touch) return;
    this.activeTouchId = touch.identifier;
    this.centerX = touch.clientX;
    this.centerY = touch.clientY;
    this.lastState = { kind: "deadzone" };
    this.leftDeadzone = false;

    this.knobEl.addClass("is-active");
    this.showBoundaryAt(this.centerX, this.centerY);
    this.updateHighlight(this.lastState);
    this.moveKnob(this.centerX, this.centerY);
  };

  private handleTouchMove = (evt: TouchEvent): void => {
    if (this.activeTouchId === null) return;
    const touch = this.findActiveTouch(evt.changedTouches);
    if (!touch) return;
    evt.preventDefault();
    evt.stopPropagation();

    const dx = touch.clientX - this.centerX;
    const dy = touch.clientY - this.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    // atan2(-dy, dx): negate dy so counterclockwise-on-screen increases the angle
    const angle = normalizeAngle((Math.atan2(-dy, dx) * 180) / Math.PI);

    const deadzoneRadius =
      this.settings.boundaryRadius * (this.settings.deadzonePercent / 100);
    const state = computeState(distance, angle, deadzoneRadius);
    if (state.kind === "sector") this.leftDeadzone = true;
    this.lastState = state;
    this.updateHighlight(state);
    this.moveKnobClamped(dx, dy);
  };

  private handleTouchEnd = (evt: TouchEvent): void => {
    if (this.activeTouchId === null) return;
    const touch = this.findActiveTouch(evt.changedTouches);
    if (!touch) return;
    evt.preventDefault();
    evt.stopPropagation();

    // Releasing in the center always clears the heading, even if the line was
    // already a heading before the gesture and even if the touch never moved.
    const finalState: JoystickState = this.leftDeadzone
      ? this.lastState
      : { kind: "deadzone" };

    this.resetVisuals();
    this.onCommit(finalState);
  };

  private handleTouchCancel = (evt: TouchEvent): void => {
    if (this.activeTouchId === null) return;
    const touch = this.findActiveTouch(evt.changedTouches);
    if (!touch) return;
    evt.preventDefault();
    evt.stopPropagation();

    // abort: apply nothing, just reset visuals
    this.resetVisuals();
    this.onCommit(null);
  };

  private findActiveTouch(list: TouchList): Touch | null {
    for (let i = 0; i < list.length; i++) {
      if (list[i].identifier === this.activeTouchId) return list[i];
    }
    return null;
  }

  private resetVisuals(): void {
    this.activeTouchId = null;
    this.leftDeadzone = false;
    this.lastState = { kind: "deadzone" };
    this.knobEl.removeClass("is-active");
    this.hideBoundary();
    // knob returns to its anchored idle position
    this.knobEl.style.transform = "";
  }

  private showBoundaryAt(x: number, y: number): void {
    const r = this.settings.boundaryRadius;
    this.boundaryEl.style.left = `${x - r}px`;
    this.boundaryEl.style.top = `${y - r}px`;
    this.boundaryEl.style.right = "";
    this.boundaryEl.style.bottom = "";
    this.boundaryEl.style.display = "block";
  }

  private hideBoundary(): void {
    this.boundaryEl.style.display = "none";
    this.clearHighlights();
  }

  private moveKnob(x: number, y: number): void {
    const size = this.settings.knobSize;
    this.knobEl.style.left = `${x - size / 2}px`;
    this.knobEl.style.top = `${y - size / 2}px`;
    this.knobEl.style.right = "";
    this.knobEl.style.bottom = "";
    this.knobEl.style.transform = "";
  }

  private moveKnobClamped(dx: number, dy: number): void {
    const r = this.settings.boundaryRadius;
    const distance = Math.sqrt(dx * dx + dy * dy);
    let cx = dx;
    let cy = dy;
    if (distance > r) {
      const scale = r / distance;
      cx = dx * scale;
      cy = dy * scale;
    }
    this.moveKnob(this.centerX + cx, this.centerY + cy);
  }

  private updateHighlight(state: JoystickState): void {
    this.clearHighlights();
    if (state.kind === "deadzone") {
      this.centerLabelEl.addClass("is-highlighted");
      return;
    }
    const el = this.sectorLabelEls.get(state.level);
    if (el) el.addClass("is-highlighted");
  }

  private clearHighlights(): void {
    this.centerLabelEl.removeClass("is-highlighted");
    for (const el of this.sectorLabelEls.values()) {
      el.removeClass("is-highlighted");
    }
  }
}
