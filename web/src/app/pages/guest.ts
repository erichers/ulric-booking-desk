import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { chip, label, money, prettyDate, prettyWhen } from '../core/format';
import { BookingDetail } from '../core/models';
import { Qr } from '../ui/qr';

@Component({
  selector: 'app-guest',
  imports: [RouterLink, Qr, FormsModule],
  templateUrl: './guest.html',
})
export class Guest {
  private readonly api = inject(Api);
  private readonly route = inject(ActivatedRoute);
  readonly money = money;
  readonly prettyDate = prettyDate;
  readonly prettyWhen = prettyWhen;
  readonly chip = chip;
  readonly label = label;

  readonly loading = signal(true);
  readonly stay = signal<BookingDetail | null>(null);
  readonly error = signal('');
  readonly signing = signal(false);
  readonly mode = signal<'typed' | 'drawn'>('typed');
  readonly drawing = signal(false);

  signatureName = '';
  private pointerDown = false;
  private last: { x: number; y: number; t: number } | null = null;
  private mid: { x: number; y: number } | null = null;
  private readonly pad = viewChild<ElementRef<HTMLCanvasElement>>('pad');

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const token = params.get('token') ?? '';
      void this.load(token);
    });
  }

  async load(token: string): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const stay = await firstValueFrom(this.api.guest(token));
      this.stay.set(stay);
      this.signatureName = stay.guestName;
    } catch (error) {
      this.stay.set(null);
      this.error.set(this.api.readError(error));
    } finally {
      this.loading.set(false);
    }
  }

  async signTyped(): Promise<void> {
    const stay = this.stay();
    if (!stay) {
      return;
    }
    this.signing.set(true);
    this.error.set('');
    try {
      await document.fonts.load('78px "Great Vibes"');
      const image = this.renderTyped(this.signatureName.trim());
      const next = await firstValueFrom(
        this.api.sign(stay.guestToken, { type: 'typed', name: this.signatureName, imagePngBase64: image }),
      );
      this.stay.set(next);
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.signing.set(false);
    }
  }

  async signDrawn(): Promise<void> {
    const stay = this.stay();
    const canvas = this.pad()?.nativeElement;
    if (!stay || !canvas || !this.drawing()) {
      this.error.set('Draw the signature first.');
      return;
    }
    this.signing.set(true);
    this.error.set('');
    try {
      const next = await firstValueFrom(
        this.api.sign(stay.guestToken, {
          type: 'drawn',
          name: this.signatureName || stay.guestName,
          imagePngBase64: canvas.toDataURL('image/png'),
        }),
      );
      this.stay.set(next);
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.signing.set(false);
    }
  }

  startDraw(event: PointerEvent): void {
    const canvas = this.pad()?.nativeElement;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    const point = this.point(canvas, event);
    context.strokeStyle = '#1f1e1d';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    this.last = { ...point, t: performance.now() };
    this.mid = point;
    this.pointerDown = true;
  }

  moveDraw(event: PointerEvent): void {
    if (!this.pointerDown) {
      return;
    }
    const canvas = this.pad()?.nativeElement;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }
    const point = this.point(canvas, event);
    const last = this.last;
    const mid = this.mid;
    if (!last || !mid) {
      return;
    }
    const now = performance.now();
    const speed = Math.hypot(point.x - last.x, point.y - last.y) / Math.max(now - last.t, 8);
    context.lineWidth = Math.max(0.7, Math.min(3.8, 3.2 - speed * 4));
    const next = { x: (last.x + point.x) / 2, y: (last.y + point.y) / 2 };
    context.beginPath();
    context.moveTo(mid.x, mid.y);
    context.quadraticCurveTo(last.x, last.y, next.x, next.y);
    context.stroke();
    this.mid = next;
    this.last = { ...point, t: now };
    this.drawing.set(true);
  }

  endDraw(): void {
    this.pointerDown = false;
    this.last = null;
    this.mid = null;
  }

  clearPad(): void {
    const canvas = this.pad()?.nativeElement;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    this.drawing.set(false);
    this.last = null;
    this.mid = null;
  }

  private renderTyped(name: string): string {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 260;
    const context = canvas.getContext('2d');
    if (!context) {
      return '';
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#1f1e1d';
    context.font = '86px "Great Vibes", cursive';
    context.textBaseline = 'middle';
    context.fillText(name, 28, 140);
    return canvas.toDataURL('image/png');
  }

  private point(canvas: HTMLCanvasElement, event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }
}
