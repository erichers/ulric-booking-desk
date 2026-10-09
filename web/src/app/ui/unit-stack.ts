import { Component, ElementRef, OnDestroy, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import type { ControlMode, NestedStays, ViewMode } from './nested-stays/model';
import { Theme } from '../core/theme';
import { StayUnit, blockLine, blockedBy, houseUnits } from '../core/nesting';
import { prefersReducedMotion } from '../core/motion';
import { InView } from './in-view';

@Component({
  selector: 'app-unit-stack',
  imports: [InView],
  template: `
    <div class="stack" appInView>
      <div class="stage" #stage [attr.data-mode]="mode()">
        <svg class="plan" viewBox="0 0 780 420" role="img" [attr.aria-label]="line()">
          <rect class="vol shell" [class.hot]="hot('four-bed')" x="16" y="28" width="500" height="364" pathLength="1" />
          <text class="plan-label" x="32" y="58">4-bed</text>
          <rect class="vol" [class.hot]="hot('three-bed')" x="32" y="78" width="300" height="290" pathLength="1" />
          <text class="plan-label" x="48" y="108">3-bed</text>
          <rect class="vol solid" [class.hot]="hot('two-bed')" x="48" y="168" width="170" height="168" pathLength="1" />
          <text class="plan-label" x="64" y="198">2-bed</text>
          <rect class="vol solid" [class.hot]="hot('studio')" x="348" y="78" width="148" height="160" pathLength="1" />
          <text class="plan-label" x="364" y="108">Studio</text>
          <rect class="vol solid" [class.hot]="hot('cottage')" x="548" y="120" width="200" height="180" pathLength="1" />
          <text class="plan-label" x="564" y="150">Cottage</text>
        </svg>
        <canvas #gl aria-hidden="true"></canvas>
        @if (exploring()) {
          <div class="ns-hud">
            <div class="ns-toolbar" data-ns-inset="bottom" role="toolbar" aria-label="3D view controls">
              <div class="ns-seg" role="radiogroup" aria-label="View mode">
                @for (v of views; track v.id) {
                  <button type="button" role="radio" [attr.aria-checked]="view() === v.id" [class.active]="view() === v.id" (click)="setView(v.id)">{{ v.name }}</button>
                }
              </div>
              <div class="ns-seg" role="group" aria-label="Focus a unit">
                <button type="button" [class.active]="picked() === null" [attr.aria-pressed]="picked() === null" (click)="focus(null)">All</button>
                @for (unit of units(); track unit.id) {
                  <button type="button" [class.active]="picked() === unit.id" [attr.aria-pressed]="picked() === unit.id" (click)="focus(unit.id)">{{ unit.name }}</button>
                }
              </div>
              <div class="ns-seg" role="group" aria-label="Camera">
                <button type="button" [class.active]="walking()" [attr.aria-pressed]="walking()" (click)="toggleWalk()">Walk</button>
                <button type="button" (click)="resetView()">Reset</button>
                <button type="button" class="ns-exit" (click)="exitExplore()" aria-label="Exit full screen">Exit</button>
              </div>
              <p class="ns-hint">{{ hint() }}</p>
            </div>
            @if (walking() && touch) {
              <div class="ns-joy" aria-hidden="true" (pointerdown)="joyDown($event)" (pointermove)="joyMove($event)" (pointerup)="joyUp()" (pointercancel)="joyUp()">
                <span [style.transform]="joy() ? 'translate(' + joy()!.x * 28 + 'px,' + joy()!.y * 28 + 'px)' : null"></span>
              </div>
            }
          </div>
        }
      </div>
      <div class="stack-bar">
        <div class="toggle" role="group" aria-label="Preview a booking">
          @for (unit of units(); track unit.id) {
            <button type="button" [class.active]="picked() === unit.id" [attr.aria-pressed]="picked() === unit.id" (click)="pick(unit.id)">{{ unit.name }}</button>
          }
          <button type="button" (click)="pick(null)">Clear</button>
        </div>
        @if (mode() === 'webgl') {
          <button type="button" class="ghost ns-explore" (click)="explore()">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" /></svg>
            Explore in 3D
          </button>
        }
      </div>
      <p class="quiet" aria-live="polite">{{ line() }}</p>
    </div>
  `,
})
export class UnitStack implements OnDestroy {
  private readonly theme = inject(Theme);
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('gl');
  private release: () => void = () => {};
  private model: NestedStays | null = null;
  private dead = false;
  private still = false;

  readonly units = input<readonly StayUnit[]>(houseUnits);
  // property pages preselect their own unit
  readonly initial = input<string | null>(null);
  readonly mode = signal<'svg' | 'webgl'>('svg');
  readonly picked = signal<string | null>(null);
  readonly blocked = computed(() => {
    const id = this.picked();
    return id ? blockedBy(id, this.units()) : [];
  });
  // non-breaking hyphen keeps "4-bed" on one line
  readonly line = computed(() => blockLine(this.picked(), this.units()).replace(/(\d)-bed/g, '$1\u2011bed'));

  // explore: full screen orbit / walk-through with view modes
  readonly exploring = signal(false);
  readonly walking = signal(false);
  readonly view = signal<ViewMode>('solid');
  readonly views: readonly { id: ViewMode; name: string }[] = [
    { id: 'solid', name: 'Solid' },
    { id: 'xray', name: 'X-ray' },
    { id: 'cutaway', name: 'Cutaway' },
    { id: 'wire', name: 'Wireframe' },
  ];
  // touch walk: one analog stick (drag the knob; distance from center sets the speed)
  readonly joy = signal<{ x: number; y: number } | null>(null);
  readonly touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  readonly hint = computed(() => {
    if (this.walking()) {
      return this.touch ? 'Drag to look. Use the stick to walk.' : 'Click to look, Esc leaves walk. WASD or arrows to walk, Shift to hurry.';
    }
    return this.touch ? 'Drag to orbit. Pinch to zoom, two fingers to pan.' : 'Drag to orbit, right-drag or Shift-drag to pan, scroll to zoom. Double-click a building to focus.';
  });
  private pseudoFull = false;
  private readonly onFsChange = () => {
    if (this.exploring() && !this.fullscreenElement() && !this.pseudoFull) {
      this.exitExplore();
    }
    // the stage changes size on enter and exit; the model's ResizeObserver refits on the next frame
  };
  private readonly onEsc = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || document.pointerLockElement) {
      return;
    }
    // one Esc leaves walk (drag-look and touch have no pointer lock to release); the next one leaves explore
    if (this.walking()) {
      this.leaveWalk();
    } else if (this.pseudoFull) {
      this.exitExplore();
    }
  };

  constructor() {
    effect(() => {
      const id = this.initial();
      untracked(() => this.picked.set(id));
    });
    effect(() => {
      const dark = this.theme.theme() === 'dark';
      untracked(() => this.model?.setTheme(dark, this.terracotta()));
    });
    effect(() => {
      const id = this.picked();
      untracked(() => this.show(id));
    });
    afterNextRender(() => {
      void this.mount();
    });
  }

  ngOnDestroy(): void {
    this.dead = true;
    this.unlisten();
    this.release();
  }

  pick(id: string | null): void {
    this.picked.set(this.picked() === id ? null : id);
  }

  // explore controls focus a unit (no toggle); focusing the same unit again just resets the camera
  focus(id: string | null): void {
    if (this.picked() === id) {
      this.resetView();
    } else {
      this.picked.set(id);
    }
  }

  async explore(): Promise<void> {
    const stage = this.stage()?.nativeElement;
    if (!stage || !this.model) {
      return;
    }
    this.listen();
    this.exploring.set(true);
    const el = stage as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' });
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch {
      // fall through to the in-page full view (iPhone Safari has no element full screen)
    }
    if (!this.fullscreenElement()) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    if (!this.fullscreenElement()) {
      this.pseudoFull = true;
      stage.classList.add('ns-full');
      document.documentElement.classList.add('ns-locked');
    }
    // let the toolbar render first: the model frames the house above it
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    this.model?.setControl('orbit');
    this.settleIfStill();
  }

  exitExplore(): void {
    if (!this.exploring()) {
      return;
    }
    const stage = this.stage()?.nativeElement;
    this.exploring.set(false);
    this.walking.set(false);
    this.view.set('solid');
    if (this.pseudoFull) {
      this.pseudoFull = false;
      stage?.classList.remove('ns-full');
      document.documentElement.classList.remove('ns-locked');
    }
    const doc = document as Document & { webkitExitFullscreen?: () => void };
    if (this.fullscreenElement()) {
      if (doc.exitFullscreen) {
        void doc.exitFullscreen().catch(() => undefined);
      } else {
        doc.webkitExitFullscreen?.();
      }
    }
    this.model?.setViewMode('solid');
    this.model?.setControl('auto');
    this.settleIfStill();
    this.unlisten();
  }

  setView(mode: ViewMode): void {
    this.view.set(mode);
    this.model?.setViewMode(mode);
    this.settleIfStill();
  }

  leaveWalk(): void {
    if (!this.walking()) {
      return;
    }
    this.walking.set(false);
    this.joy.set(null);
    this.model?.setControl('orbit');
    this.settleIfStill();
  }

  toggleWalk(): void {
    const walk = !this.walking();
    this.walking.set(walk);
    const ctl: ControlMode = walk ? 'walk' : 'orbit';
    this.model?.setControl(ctl);
    this.settleIfStill();
  }

  resetView(): void {
    this.model?.resetView();
    this.settleIfStill();
  }

  joyDown(event: PointerEvent): void {
    event.preventDefault();
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      /* synthetic or already released pointer */
    }
    this.joyMove(event);
  }

  joyMove(event: PointerEvent): void {
    if (event.type === 'pointermove' && !this.joy()) {
      return;
    }
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const rad = r.width / 2;
    let x = (event.clientX - r.left - rad) / rad;
    let y = (event.clientY - r.top - rad) / rad;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    this.joy.set({ x, y });
    this.model?.setJoy(x, -y);
  }

  joyUp(): void {
    this.joy.set(null);
    this.model?.setJoy(0, 0);
  }

  private fullscreenElement(): Element | null {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  }

  private listening = false;
  private listen(): void {
    if (this.listening) {
      return;
    }
    this.listening = true;
    document.addEventListener('fullscreenchange', this.onFsChange);
    document.addEventListener('webkitfullscreenchange', this.onFsChange);
    window.addEventListener('keydown', this.onEsc);
  }

  private unlisten(): void {
    if (!this.listening) {
      return;
    }
    this.listening = false;
    document.removeEventListener('fullscreenchange', this.onFsChange);
    document.removeEventListener('webkitfullscreenchange', this.onFsChange);
    window.removeEventListener('keydown', this.onEsc);
  }

  private settleIfStill(): void {
    if (this.still) {
      this.model?.settle();
    }
  }

  hot(id: string): boolean {
    return this.blocked().includes(id);
  }

  private show(id: string | null): void {
    if (!this.model) {
      return;
    }
    this.model.pick(id);
    if (this.still) {
      this.model.settle();
    }
  }

  private terracotta(): string {
    // pages can swap the highlight for a neutral one (--ns-hot on the host), e.g. property pages where the room chip owns the accent
    const host = this.stage()?.nativeElement ?? document.documentElement;
    const css = getComputedStyle(host);
    return css.getPropertyValue('--ns-hot').trim() || css.getPropertyValue('--terracotta').trim() || '#d97757';
  }

  private async mount(): Promise<void> {
    const canvas = this.canvas()?.nativeElement;
    const stage = this.stage()?.nativeElement;
    if (!canvas || !stage) {
      return;
    }
    let started = false;
    const gate = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || started) {
          return;
        }
        started = true;
        gate.disconnect();
        void this.startWebgl(canvas, stage);
      },
      { rootMargin: '200px 0px' },
    );
    gate.observe(stage);
    this.release = () => gate.disconnect();
  }

  private async startWebgl(canvas: HTMLCanvasElement, stage: HTMLElement): Promise<void> {
    try {
      // three and the house model load only when the section scrolls near the screen
      const { createNestedStays } = await import('./nested-stays/model');
      if (this.dead) {
        return;
      }
      this.still = prefersReducedMotion();
      const model = createNestedStays(stage, {
        canvas,
        units: this.units(),
        blockedBy: (id: string) => blockedBy(id, this.units()),
        colors: { terracotta: this.terracotta() },
        dark: this.theme.theme() === 'dark',
        onFocus: (id: string) => this.focus(id),
        // pointer lock lost (Esc) while walking: back to orbit in that one press
        onWalkEnd: () => this.leaveWalk(),
      });
      this.model = model;
      this.release = () => {
        this.model = null;
        model.dispose();
      };
      this.show(this.picked());
      if (this.still) {
        model.settle();
      }
      this.mode.set('webgl');
    } catch (error) {
      console.warn('Nested stays 3D view unavailable; showing the plan instead.', error);
      this.mode.set('svg');
    }
  }
}
