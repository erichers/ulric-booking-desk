import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { addDays, money, prettyDate, todayIso } from '../core/format';
import { BookingDetail, DayMark, Property, Quote } from '../core/models';
import { Calendar } from '../ui/calendar';
import { CottageMap } from '../ui/map';

@Component({
  selector: 'app-home',
  imports: [Calendar, RouterLink, FormsModule, CottageMap],
  templateUrl: './home.html',
})
export class Home {
  private readonly api = inject(Api);
  readonly money = money;
  readonly prettyDate = prettyDate;
  readonly today = todayIso();

  readonly loading = signal(true);
  readonly property = signal<Property | null>(null);
  readonly days = signal<DayMark[]>([]);
  readonly error = signal('');
  readonly checkIn = signal<string | null>(null);
  readonly checkOut = signal<string | null>(null);
  readonly quote = signal<Quote | null>(null);
  readonly quoting = signal(false);
  readonly submitting = signal(false);
  readonly confirmation = signal<BookingDetail | null>(null);

  guests = 2;
  guestName = '';
  guestEmail = '';
  guestPhone = '';
  notes = '';

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const property = await firstValueFrom(this.api.property());
      const days = await firstValueFrom(this.api.availability(addDays(this.today, -10), addDays(this.today, 150)));
      this.property.set(property);
      this.days.set(days);
      this.guests = Math.min(2, property.maxGuests);
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.loading.set(false);
    }
  }

  async onPicked(selection: { checkIn: string; checkOut: string | null }): Promise<void> {
    this.confirmation.set(null);
    this.checkIn.set(selection.checkIn);
    this.checkOut.set(selection.checkOut);
    this.quote.set(null);
    if (!selection.checkOut) {
      return;
    }
    this.quoting.set(true);
    try {
      this.quote.set(await firstValueFrom(this.api.quote(selection.checkIn, selection.checkOut)));
      this.error.set('');
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.quoting.set(false);
    }
  }

  async submit(): Promise<void> {
    const property = this.property();
    const checkIn = this.checkIn();
    const checkOut = this.checkOut();
    if (!property || !checkIn || !checkOut) {
      this.error.set('Choose check-in and checkout on the calendar.');
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    try {
      const stay = await firstValueFrom(
        this.api.requestStay({
          checkIn,
          checkOut,
          guests: Number(this.guests),
          guestName: this.guestName,
          guestEmail: this.guestEmail,
          guestPhone: this.guestPhone,
          notes: this.notes,
        }),
      );
      this.confirmation.set(stay);
      this.days.set(await firstValueFrom(this.api.availability(addDays(this.today, -10), addDays(this.today, 150))));
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.submitting.set(false);
    }
  }
}
