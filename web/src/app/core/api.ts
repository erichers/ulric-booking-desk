import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  BookingDetail,
  BookingSummary,
  Dashboard,
  DayMark,
  OutboxMessage,
  Property,
  Quote,
} from './models';

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  properties() {
    return this.http.get<Property[]>('api/properties');
  }

  property(slug?: string) {
    return slug
      ? this.http.get<Property>(`api/properties/${slug}`)
      : this.http.get<Property>('api/property');
  }

  saveProperty(body: unknown, slug?: string) {
    return slug
      ? this.http.put<Property>(`api/properties/${slug}`, body)
      : this.http.put<Property>('api/property', body);
  }

  saveSignature(name: string, slug?: string) {
    return this.http.post<Property>('api/property/signature', { name }, {
      params: slug ? { slug } : {},
    });
  }

  availability(from: string, to: string, slug?: string) {
    return this.http.get<DayMark[]>('api/availability', {
      params: slug ? { from, to, slug } : { from, to },
    });
  }

  quote(checkIn: string, checkOut: string, slug?: string) {
    return this.http.post<Quote>('api/quotes', { checkIn, checkOut, propertySlug: slug ?? null });
  }

  requestStay(body: unknown) {
    return this.http.post<BookingDetail>('api/bookings', body);
  }

  bookings(status?: string) {
    return this.http.get<BookingSummary[]>('api/bookings', {
      params: status ? { status } : {},
    });
  }

  booking(id: string) {
    return this.http.get<BookingDetail>(`api/bookings/${id}`);
  }

  approve(id: string) {
    return this.http.post<BookingDetail>(`api/bookings/${id}/approve`, {});
  }

  decline(id: string) {
    return this.http.post<BookingDetail>(`api/bookings/${id}/decline`, {});
  }

  cancel(id: string) {
    return this.http.post<BookingDetail>(`api/bookings/${id}/cancel`, {});
  }

  guest(token: string) {
    return this.http.get<BookingDetail>(`api/guest/${token}`);
  }

  sign(token: string, body: unknown) {
    return this.http.post<BookingDetail>(`api/guest/${token}/sign`, body);
  }

  pay(invoiceId: string, body: unknown) {
    return this.http.post<BookingDetail>(`api/invoices/${invoiceId}/payments`, body);
  }

  dashboard() {
    return this.http.get<Dashboard>('api/dashboard');
  }

  outbox() {
    return this.http.get<OutboxMessage[]>('api/outbox');
  }

  readError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.error;
      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
    }
    return 'The desk could not complete that.';
  }
}
