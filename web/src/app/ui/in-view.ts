import { Directive, ElementRef, OnDestroy, inject } from '@angular/core';
import { prefersReducedMotion } from '../core/motion';

@Directive({ selector: '[appInView]' })
export class InView implements OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;

  constructor() {
    const node = this.el.nativeElement;
    if (prefersReducedMotion()) {
      node.classList.add('is-in');
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          node.classList.add('is-in');
          this.observer?.disconnect();
        }
      },
      { threshold: 0.22 },
    );
    this.observer.observe(node);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
