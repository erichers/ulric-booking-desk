import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { chip, label, money, prettyDate } from '../core/format';
import { BookingSummary } from '../core/models';

@Component({
  selector: 'app-bookings',
  imports: [RouterLink],
  templateUrl: './bookings.html',
})
export class Bookings {
  private readonly api = inject(Api);
  readonly money = money;
  readonly prettyDate = prettyDate;
  readonly chip = chip;
  readonly label = label;
  readonly filters = ['', 'Requested', 'Approved', 'Confirmed', 'Declined', 'Expired', 'Cancelled'];
  readonly filter = signal('');
  readonly loading = signal(true);
  readonly rows = signal<BookingSummary[]>([]);
  readonly error = signal('');

  constructor() {
    void this.load('');
  }

  async load(filter: string): Promise<void> {
    this.filter.set(filter);
    this.loading.set(true);
    try {
      this.rows.set(await firstValueFrom(this.api.bookings(filter || undefined)));
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.loading.set(false);
    }
  }
}
