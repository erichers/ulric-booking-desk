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
  draft: Property | null = null;

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      this.draft = structuredClone(await firstValueFrom(this.api.property()));
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
      this.draft = await firstValueFrom(this.api.saveProperty(this.draft));
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
      this.draft = await firstValueFrom(this.api.saveSignature(this.draft.hostSignatureName));
      this.signatureStamp.set(Date.now());
      this.notice.set('Host signature saved.');
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
