import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { money } from '../core/format';
import { Property } from '../core/models';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
})
export class Home {
  private readonly api = inject(Api);
  readonly money = money;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly listings = signal<Property[]>([]);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.listings.set(await firstValueFrom(this.api.properties()));
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.loading.set(false);
    }
  }

  unit(listing: Property): string {
    return listing.rateLabel === 'session' ? 'session' : 'night';
  }
}
