import { Directive, ElementRef, OnDestroy, effect, inject, input, untracked } from '@angular/core';
import { money } from '../core/format';
import { easeOut, prefersReducedMotion } from '../core/motion';

@Directive({ selector: '[appCount]' })
export class CountUp implements OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  readonly value = input.required<number>({ alias: 'appCount' });
  readonly asMoney = input(false, { alias: 'appCountMoney' });
  private frame = 0;
  private observer?: IntersectionObserver;

  constructor() {
    effect(() => {
      const value = this.value();
      const asMoney = this.asMoney();
      untracked(() => this.play(value, asMoney));
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
  }

  private play(value: number, asMoney: boolean): void {
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    const node = this.el.nativeElement;
    const write = (next: number): void => {
      node.textContent = asMoney ? money(next) : String(Math.round(next));
    };
    if (prefersReducedMotion()) {
      write(value);
      return;
    }
    write(0);
    const run = (): void => {
      const start = performance.now();
      const tick = (now: number): void => {
        const t = Math.min(1, (now - start) / 720);
        write(value * easeOut(t));
        if (t < 1) {
          this.frame = requestAnimationFrame(tick);
        }
      };
      this.frame = requestAnimationFrame(tick);
    };
    this.observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        this.observer?.disconnect();
        run();
      },
      { threshold: 0.4 },
    );
    this.observer.observe(node);
  }
}
