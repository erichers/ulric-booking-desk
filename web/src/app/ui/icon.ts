import { Component, computed, input } from '@angular/core';

const PATHS: Record<string, string> = {
  wifi: 'M2 8.5a9 9 0 0 1 12 0M4.5 11a5.5 5.5 0 0 1 7 0M8 13.6h.01',
  kitchen: 'M3 2v5a2 2 0 0 0 4 0V2M5 2v12M11 14V2c-1.7 0-2.5 2-2.5 5S9.5 9 11 9',
  coffee: 'M3 6h8v4a4 4 0 0 1-8 0zM11 7h1.5a1.5 1.5 0 0 1 0 3H11M5 2v2M8 2v2',
  parking: 'M3 2h10v12H3zM6.5 11V5H9a1.5 1.5 0 0 1 0 3H6.5',
  laundry: 'M3 2h10v12H3zM3 5h10M8 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  tv: 'M2 4h12v8H2zM6 14h4',
  desk: 'M2 6h12M3 6v8M13 6v8M9 6v4h4',
  climate: 'M8 2v12M3 5l10 6M13 5L3 11',
  safety: 'M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z',
  bed: 'M2 13V4M2 9h12v4M14 9a2 2 0 0 0-2-2H7v2M4.5 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  yard: 'M8 14V8M8 8C5 8 4 6 4 4c2 0 4 1 4 4zM8 9c3 0 4-2 4-4-2 0-4 1-4 4M3 14h10',
  bath: 'M2 8h12v2a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3zM4 8V4a2 2 0 0 1 4 0',
  home: 'M2 7.5L8 2l6 5.5M4 6v8h8V6',
  key: 'M10 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM7.2 8.8L2 14M4 12l1.5 1.5',
  star: 'M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3 4.3 13.3l.8-4.1L2 6.3l4.2-.5z',
  link: 'M6.5 9.5l3-3M7 4.5l1-1a3 3 0 0 1 4.2 4.2l-1 1M9 11.5l-1 1a3 3 0 0 1-4.2-4.2l1-1',
  calendar: 'M2 4h12v10H2zM2 7h12M5 2v3M11 2v3',
  grid: 'M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z',
  dot: 'M8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3',
};

@Component({
  selector: 'app-icon',
  template: `<svg viewBox="0 0 16 16" aria-hidden="true" class="ico"><path [attr.d]="d()" /></svg>`,
  host: { class: 'ico-wrap' },
})
export class Icon {
  readonly name = input('dot');
  readonly d = computed(() => PATHS[this.name()] ?? PATHS['dot']);
}
