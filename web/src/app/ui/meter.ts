import { Component, ElementRef, OnDestroy, afterNextRender, input, signal, viewChild } from '@angular/core';
import { prefersReducedMotion } from '../core/motion';

@Component({
  selector: 'app-meter',
  template: `
    <div
      #root
      class="meter"
      role="meter"
      aria-label="Amount paid"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="Math.round(percent())"
      [class.is-in]="shown()"
      [style.--fill]="percent()"
    >
      <span></span>
    </div>
  `,
})
export class Meter implements OnDestroy {
  readonly percent = input(0);
  readonly shown = signal(false);
  private readonly root = viewChild<ElementRef<HTMLElement>>('root');
  private observer?: IntersectionObserver;
  protected readonly Math = Math;

  constructor() {
    afterNextRender(() => this.arm());
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private arm(): void {
    const node = this.root()?.nativeElement;
    if (!node) {
      return;
    }
    if (prefersReducedMotion()) {
      this.shown.set(true);
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.shown.set(true);
          this.observer?.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    this.observer.observe(node);
  }
}
