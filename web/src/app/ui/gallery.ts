import { Component, ElementRef, computed, effect, inject, input, output, untracked, viewChild } from '@angular/core';
import { Photo } from '../core/models';
import { Photos, roomName } from '../core/photos';
import { Modal } from './modal';

// Single-photo viewer (MOTION.md 3.5 / 6.11): ink background, a scroll-snap track (swipe on touch),
// prev/next at 768 and up, counter top center, Esc/Back close (parent owns the URL state).
@Component({
  selector: 'app-viewer',
  imports: [Modal],
  template: `
    <app-modal variant="viewer" [label]="title() + ' photo viewer'" [open]="index() >= 0" (dismiss)="dismiss.emit()" (keys)="key($event)">
      <div class="gal">
        <div class="gal-bar">
          <button type="button" class="gal-btn" (click)="dismiss.emit()" data-autofocus aria-label="Close photo viewer">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg>
            <span>Close</span>
          </button>
          <p class="gal-count" aria-live="polite">{{ shown() + 1 }} / {{ photos().length }}</p>
          <p class="gal-room">{{ current() ? room(current()!) : '' }}</p>
        </div>
        <div class="gal-stage">
          <button type="button" class="gal-nav prev" (click)="go(-1)" aria-label="Previous photo" [disabled]="shown() === 0">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" /></svg>
          </button>
          <div class="gal-track" #track (scrollend)="settle()" (scroll)="onScroll()">
            @for (photo of photos(); track photo.src; let i = $index) {
              @let m = meta.info(photo.src);
              <figure class="gal-fig" [attr.aria-hidden]="i !== shown()">
                <img class="gal-img" [src]="photo.src" [attr.width]="m.w" [attr.height]="m.h"
                  [attr.loading]="near(i) ? 'eager' : 'lazy'" decoding="async"
                  [style.background-image]="m.q ? 'url(' + m.q + ')' : null"
                  [alt]="photo.caption || room(photo)" draggable="false" />
                @if (photo.caption) {
                  <figcaption>{{ photo.caption }}</figcaption>
                }
              </figure>
            }
          </div>
          <button type="button" class="gal-nav next" (click)="go(1)" aria-label="Next photo" [disabled]="shown() === photos().length - 1">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" /></svg>
          </button>
        </div>
      </div>
    </app-modal>
  `,
})
export class Viewer {
  readonly meta = inject(Photos);
  readonly photos = input<readonly Photo[]>([]);
  readonly title = input('');
  readonly index = input(-1);
  readonly indexChange = output<number>();
  readonly dismiss = output<void>();
  readonly shown = computed(() => Math.max(0, this.index()));
  readonly current = computed(() => this.photos()[this.shown()] ?? null);
  readonly room = (photo: Photo) => roomName(photo.room);
  private readonly track = viewChild<ElementRef<HTMLElement>>('track');
  private scrollTimer = 0;
  private programmatic = false;

  constructor() {
    // keep the track on the URL index (open, Back/forward, deep links)
    effect(() => {
      const i = this.index();
      const el = this.track()?.nativeElement;
      if (i < 0 || !el) {
        return;
      }
      untracked(() => requestAnimationFrame(() => {
        const target = i * el.clientWidth;
        if (Math.abs(el.scrollLeft - target) > 2) {
          this.programmatic = true;
          el.scrollTo({ left: target, behavior: 'instant' as ScrollBehavior });
          requestAnimationFrame(() => { this.programmatic = false; });
        }
      }));
    });
  }

  near(i: number): boolean {
    return Math.abs(i - this.shown()) <= 1;
  }

  go(step: number): void {
    const n = this.photos().length;
    const next = Math.min(n - 1, Math.max(0, this.shown() + step));
    if (next === this.shown()) {
      return;
    }
    const el = this.track()?.nativeElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollTo({ left: next * el.clientWidth, behavior: reduce ? 'instant' as ScrollBehavior : 'smooth' });
    this.indexChange.emit(next);
  }

  onScroll(): void {
    // fallback for browsers without scrollend
    clearTimeout(this.scrollTimer);
    this.scrollTimer = window.setTimeout(() => this.settle(), 140);
  }

  settle(): void {
    const el = this.track()?.nativeElement;
    if (!el || this.programmatic || this.index() < 0) {
      return;
    }
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== this.index()) {
      this.indexChange.emit(i);
    }
  }

  key(event: KeyboardEvent): void {
    const n = this.photos().length;
    const map: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, Home: -n, End: n };
    if (event.key in map) {
      event.preventDefault();
      this.go(map[event.key]);
    }
  }
}
