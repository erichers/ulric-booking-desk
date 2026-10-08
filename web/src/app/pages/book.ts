import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { addDays, money, prettyDate, todayIso } from '../core/format';
import { BookingDetail, DayMark, Property, Quote } from '../core/models';
import { Calendar } from '../ui/calendar';
import { CottageMap } from '../ui/map';

@Component({
  selector: 'app-book',
  imports: [Calendar, RouterLink, FormsModule, CottageMap],
  templateUrl: './book.html',
})
export class Book {
  private readonly api = inject(Api);
  private readonly route = inject(ActivatedRoute);
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
    this.route.paramMap.subscribe(() => void this.load());
  }

  async load(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.loading.set(true);
    this.confirmation.set(null);
    this.checkIn.set(null);
    this.checkOut.set(null);
    this.quote.set(null);
    try {
      const property = await firstValueFrom(this.api.property(slug));
      const days = await firstValueFrom(this.api.availability(addDays(this.today, -10), addDays(this.today, 150), slug));
      this.property.set(property);
      this.days.set(days);
      this.guests = Math.min(property.kind === 'Photographer' ? 1 : 2, property.maxGuests);
      this.error.set('');
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.loading.set(false);
    }
  }

  async onPicked(selection: { checkIn: string; checkOut: string | null }): Promise<void> {
    const property = this.property();
    this.confirmation.set(null);
    this.checkIn.set(selection.checkIn);
    this.checkOut.set(selection.checkOut);
    this.quote.set(null);
    if (!selection.checkOut || !property) {
      return;
    }
    this.quoting.set(true);
    try {
      this.quote.set(await firstValueFrom(this.api.quote(selection.checkIn, selection.checkOut, property.slug)));
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
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    try {
      const stay = await firstValueFrom(this.api.requestStay({
        checkIn,
        checkOut,
        guests: Number(this.guests),
        guestName: this.guestName,
        guestEmail: this.guestEmail,
        guestPhone: this.guestPhone,
        notes: this.notes,
        propertySlug: property.slug,
      }));
      this.confirmation.set(stay);
      this.days.set(await firstValueFrom(this.api.availability(addDays(this.today, -10), addDays(this.today, 150), property.slug)));
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.submitting.set(false);
    }
  }

  unit(property: Property, count = 1): string {
    const label = property.rateLabel || 'night';
    return count === 1 ? label : `${label}s`;
  }
}
