import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { money } from '../core/format';
import { houseUnits, StayUnit } from '../core/nesting';
import { Property } from '../core/models';
import { FlowDiagram } from '../ui/flow-diagram';
import { UnitStack } from '../ui/unit-stack';

@Component({
  selector: 'app-home',
  imports: [RouterLink, UnitStack, FlowDiagram],
  templateUrl: './home.html',
})
export class Home {
  private readonly api = inject(Api);
  readonly money = money;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly listings = signal<Property[]>([]);
  readonly stackUnits = computed((): readonly StayUnit[] => {
    const rows = this.listings();
    if (!rows.length) {
      return houseUnits;
    }
    return rows.map((row) => ({
      id: row.slug,
      name: row.unitLabel,
      beds: row.bedrooms,
      contains: row.contains,
    }));
  });

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

}
