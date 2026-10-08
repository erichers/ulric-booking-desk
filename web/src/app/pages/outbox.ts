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

  constructor() {
    void this.load();
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
