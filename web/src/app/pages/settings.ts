import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { Property } from '../core/models';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  templateUrl: './settings.html',
})
export class Settings {
  private readonly api = inject(Api);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly signatureStamp = signal(Date.now());
  readonly listings = signal<Property[]>([]);
  slug = '';
  draft: Property | null = null;

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      const listings = await firstValueFrom(this.api.properties());
      this.listings.set(listings);
      this.slug = this.slug || listings[0]?.slug || '';
      this.draft = structuredClone(listings.find((item) => item.slug === this.slug) ?? listings[0] ?? null);
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    if (!this.draft) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      this.draft = await firstValueFrom(this.api.saveProperty(this.draft, this.slug));
      const saved = this.draft;
      this.listings.update((rows) => rows.map((row) => (row.slug === this.slug && saved ? saved : row)));
      this.notice.set('Settings saved.');
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async saveSignature(): Promise<void> {
    if (!this.draft) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      this.draft = await firstValueFrom(this.api.saveSignature(this.draft.hostSignatureName, this.slug));
      this.signatureStamp.set(Date.now());
      const saved = this.draft;
      this.listings.update((rows) => rows.map((row) => (row.slug === this.slug && saved ? saved : row)));
      this.notice.set('Host signature saved.');
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.saving.set(false);
    }
  }

  pick(slug: string): void {
    this.slug = slug;
    this.notice.set('');
    const match = this.listings().find((item) => item.slug === slug);
    this.draft = match ? structuredClone(match) : this.draft;
  }
}
