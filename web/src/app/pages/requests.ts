import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { guestCount, money, prettyDate, stayUnit } from '../core/format';
import { BookingSummary } from '../core/models';

@Component({
  selector: 'app-requests',
  imports: [RouterLink],
  templateUrl: './requests.html',
})
export class Requests {
  private readonly api = inject(Api);
  readonly money = money;
  readonly prettyDate = prettyDate;
  readonly stayUnit = stayUnit;
  readonly guestCount = guestCount;
  readonly loading = signal(true);
  readonly rows = signal<BookingSummary[]>([]);
  readonly error = signal('');
  readonly busy = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.rows.set(await firstValueFrom(this.api.bookings('Requested')));
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.loading.set(false);
    }
  }

  async decide(id: string, approve: boolean): Promise<void> {
    this.busy.set(id);
    this.error.set('');
    try {
      if (approve) {
        await firstValueFrom(this.api.approve(id));
      } else {
        await firstValueFrom(this.api.decline(id));
      }
      this.rows.update((rows) => rows.filter((row) => row.id !== id));
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.busy.set(null);
    }
  }
}
