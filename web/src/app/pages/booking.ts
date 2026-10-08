import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { chip, label, money, prettyDate, prettyWhen, todayIso } from '../core/format';
import { BookingDetail } from '../core/models';
import { Qr } from '../ui/qr';

@Component({
  selector: 'app-booking',
  imports: [FormsModule, RouterLink, Qr],
  templateUrl: './booking.html',
})
export class BookingPage {
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
  readonly notice = signal('');
  readonly busy = signal(false);

  method = 'PayPal';
  amount = 0;
  paidOn = todayIso();
  reference = '';

  constructor() {
    this.route.paramMap.subscribe((params) => void this.load(params.get('id') ?? ''));
  }

  async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const stay = await firstValueFrom(this.api.booking(id));
      this.stay.set(stay);
      this.amount = stay.invoice?.amountDue ?? 0;
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.loading.set(false);
    }
  }

  async act(kind: 'approve' | 'decline' | 'cancel'): Promise<void> {
    const stay = this.stay();
    if (!stay) {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const next =
        kind === 'approve'
          ? await firstValueFrom(this.api.approve(stay.id))
          : kind === 'decline'
            ? await firstValueFrom(this.api.decline(stay.id))
            : await firstValueFrom(this.api.cancel(stay.id));
      this.stay.set(next);
      this.amount = next.invoice?.amountDue ?? 0;
      this.notice.set(kind === 'approve' ? 'Approved.' : kind === 'decline' ? 'Declined.' : 'Cancelled.');
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.busy.set(false);
    }
  }

  async markPaid(): Promise<void> {
    const stay = this.stay();
    if (!stay?.invoice) {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const next = await firstValueFrom(
        this.api.pay(stay.invoice.id, {
          method: this.method,
          amount: Number(this.amount),
          paidOn: this.paidOn,
          reference: this.reference,
        }),
      );
      this.stay.set(next);
      this.amount = next.invoice?.amountDue ?? 0;
      this.reference = '';
      this.notice.set('Payment recorded.');
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.busy.set(false);
    }
  }

  async copyLink(): Promise<void> {
    const stay = this.stay();
    if (!stay) {
      return;
    }
    const url = `${location.origin}${stay.guestPath}`;
    await navigator.clipboard.writeText(url);
    this.notice.set('Guest link copied.');
  }
}
