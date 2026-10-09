import { AfterViewInit, Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { Theme } from '../core/theme';
import { inject } from '@angular/core';

@Component({
  selector: 'app-map',
  template: `<div #host class="map" role="img" [attr.aria-label]="label()"></div>`,
})
export class CottageMap implements AfterViewInit, OnDestroy {
  readonly lat = input.required<number>();
  readonly lng = input.required<number>();
  readonly label = input('Map');
  // approximate area (meters): draws a soft circle and no point marker (privacy)
  readonly area = input<number | null>(null);
  readonly zoom = input(12);
  private readonly theme = inject(Theme);
  private readonly host = viewChild<ElementRef<HTMLDivElement>>('host');
  private map?: L.Map;
  private marker?: L.CircleMarker;
  private circle?: L.Circle;
  private ready = false;

  constructor() {
    effect(() => {
      this.theme.theme();
      if (this.ready) {
        this.paintMarker();
      }
    });
  }

  ngAfterViewInit(): void {
    const element = this.host()?.nativeElement;
    if (!element) {
      return;
    }
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    // never capture page scroll: no wheel zoom, and no one-finger drag on touch
    this.map = L.map(element, { scrollWheelZoom: false, attributionControl: true, dragging: !coarse }).setView(
      [this.lat(), this.lng()],
      this.zoom(),
    );
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 16,
      attribution: '&copy; OpenStreetMap',
    }).addTo(this.map);
    const area = this.area();
    if (area) {
      this.circle = L.circle([this.lat(), this.lng()], { radius: area, weight: 2, interactive: false }).addTo(this.map);
    } else {
      this.marker = L.circleMarker([this.lat(), this.lng()], { radius: 9, weight: 2 }).addTo(this.map);
    }
    this.paintMarker();
    this.ready = true;
    setTimeout(() => this.map?.invalidateSize(), 50);
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private paintMarker(): void {
    const styles = getComputedStyle(document.documentElement);
    const fill = styles.getPropertyValue('--terracotta').trim() || '#d97757';
    const ink = styles.getPropertyValue('--ink').trim() || '#1f1e1d';
    this.marker?.setStyle({ color: ink, fillColor: fill, fillOpacity: 1 });
    this.circle?.setStyle({ color: ink, fillColor: ink, fillOpacity: 0.12 });
  }
}
