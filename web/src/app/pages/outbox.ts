import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { chip, prettyWhen } from '../core/format';
import { OutboxMessage } from '../core/models';

@Component({
  selector: 'app-outbox',
  templateUrl: './outbox.html',
})
export class Outbox {
  private readonly api = inject(Api);
  readonly prettyWhen = prettyWhen;
  readonly chip = chip;
  readonly loading = signal(true);
  readonly rows = signal<OutboxMessage[]>([]);
  readonly error = signal('');
  readonly copied = signal('');

  constructor() {
    void this.load();
  }

  async copy(message: OutboxMessage): Promise<void> {
    const text = `${message.subject}\n${message.recipient}\n\n${message.body}`;
    await navigator.clipboard.writeText(text);
    this.copied.set(message.id);
  }

  async load(): Promise<void> {
    try {
      this.rows.set(await firstValueFrom(this.api.outbox()));
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.loading.set(false);
    }
  }
}
