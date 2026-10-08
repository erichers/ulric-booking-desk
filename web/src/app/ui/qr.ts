import { AfterViewInit, Component, ElementRef, effect, input, viewChild } from '@angular/core';
import QRCode from 'qrcode';

@Component({
  selector: 'app-qr',
  template: `<canvas #canvas class="qr" [attr.aria-label]="label()"></canvas>`,
})
export class Qr implements AfterViewInit {
  readonly value = input.required<string>();
  readonly label = input('Payment QR code');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private ready = false;

  constructor() {
    effect(() => {
      this.value();
      if (this.ready) {
        void this.draw();
      }
    });
  }

  ngAfterViewInit(): void {
    this.ready = true;
    void this.draw();
  }

  private async draw(): Promise<void> {
    const canvas = this.canvas()?.nativeElement;
    if (!canvas) {
      return;
    }
    const styles = getComputedStyle(document.documentElement);
    const ink = styles.getPropertyValue('--ink').trim() || '#1f1e1d';
    await QRCode.toCanvas(canvas, this.value(), {
      margin: 1,
      width: 148,
      color: { dark: ink, light: '#00000000' },
    });
  }
}
