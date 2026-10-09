import { Component, ElementRef, effect, input, output, untracked, viewChild } from '@angular/core';

let uid = 0;

// Native <dialog> + showModal (inert page, top layer), an explicit Tab loop, Esc/Close/backdrop emit `dismiss`,
// focus returns to the opener. The parent owns `open` (it lives in the URL so Back closes it).
// variant: center (640 dialog, full screen under 768) | sheet (bottom sheet at 768-1023, full screen under 768) | paper (full viewport, --paper) | viewer (full viewport, ink)
@Component({
  selector: 'app-modal',
  template: `
    <dialog #dlg class="modal" [attr.data-variant]="variant()" [attr.aria-labelledby]="hid"
      (cancel)="$event.preventDefault(); dismiss.emit()" (keydown)="onKey($event)" (click)="backdrop($event)">
      <div class="modal-box">
        @if (variant() !== 'viewer') {
          <header class="modal-head">
            <button type="button" class="icon-btn" (click)="dismiss.emit()" aria-label="Close" data-autofocus>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg>
            </button>
            <h2 [id]="hid" tabindex="-1">{{ label() }}</h2>
          </header>
        } @else {
          <h2 class="sr-only" [id]="hid">{{ label() }}</h2>
        }
        <ng-content />
      </div>
    </dialog>
  `,
})
export class Modal {
  readonly label = input('');
  readonly variant = input<'center' | 'sheet' | 'paper' | 'viewer'>('center');
  readonly open = input(false);
  readonly dismiss = output<void>();
  readonly keys = output<KeyboardEvent>();
  readonly hid = `dlg-h-${++uid}`;
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  private opener: HTMLElement | null = null;
  private timer = 0;

  constructor() {
    effect(() => {
      const want = this.open();
      untracked(() => this.sync(want));
    });
  }

  get element(): HTMLDialogElement {
    return this.dlg().nativeElement;
  }

  private sync(want: boolean): void {
    const dialog = this.dlg().nativeElement;
    if (want && !dialog.open) {
      clearTimeout(this.timer);
      dialog.classList.remove('closing');
      this.opener = document.activeElement as HTMLElement | null;
      dialog.removeAttribute('data-motion');
      dialog.showModal();
      document.documentElement.classList.add('modal-locked');
      // full-viewport layers (paper, viewer, and every dialog under 768) hide the inert page underneath
      requestAnimationFrame(() => {
        const r = dialog.getBoundingClientRect();
        if (r.width >= innerWidth - 1 && r.height >= innerHeight - 1) {
          dialog.dataset['cover'] = '1';
          document.documentElement.classList.add('modal-cover');
        }
      });
      (dialog.querySelector<HTMLElement>('[data-autofocus]') ?? this.focusables()[0])?.focus({ preventScroll: true });
      this.whenDone(dialog, () => dialog.setAttribute('data-motion', 'done'));
    } else if (!want && dialog.open) {
      dialog.classList.add('closing');
      this.whenDone(dialog, () => {
        dialog.classList.remove('closing');
        dialog.close();
        delete dialog.dataset['cover'];
        if (!document.querySelector('dialog[open]')) {
          document.documentElement.classList.remove('modal-locked');
        }
        if (!document.querySelector('dialog[open][data-cover]')) {
          document.documentElement.classList.remove('modal-cover');
        }
        this.opener?.focus({ preventScroll: true });
        this.opener = null;
      });
    }
  }

  // settle after the dialog's own CSS animation (none under reduced motion)
  private whenDone(dialog: HTMLDialogElement, done: () => void): void {
    requestAnimationFrame(() => {
      const running = dialog.getAnimations({ subtree: true }).filter((a) => a.playState === 'running');
      if (!running.length) {
        done();
        return;
      }
      let finished = false;
      const finish = () => { if (!finished) { finished = true; done(); } };
      Promise.all(running.map((a) => a.finished.catch(() => undefined))).then(finish);
      this.timer = window.setTimeout(finish, 700);
    });
  }

  private focusables(): HTMLElement[] {
    return Array.from(this.dlg().nativeElement.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter((el) => el.getClientRects().length > 0);
  }

  onKey(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      const items = this.focusables();
      if (!items.length) {
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !this.dlg().nativeElement.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !this.dlg().nativeElement.contains(active))) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    this.keys.emit(event);
  }

  backdrop(event: MouseEvent): void {
    if ((this.variant() === 'center' || this.variant() === 'sheet') && event.target === this.dlg().nativeElement) {
      this.dismiss.emit();
    }
  }
}
