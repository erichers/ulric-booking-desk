import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild, viewChildren } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { Api } from '../core/api';
import { addDays, money, prettyDate, prettyWhen, todayIso } from '../core/format';
import { BookingDetail, DayMark, Photo, Property, Quote } from '../core/models';
import { StayUnit } from '../core/nesting';
import { Photos, RoomGroup, roomGroups, roomName } from '../core/photos';
import { Calendar } from '../ui/calendar';
import { Viewer } from '../ui/gallery';
import { Icon } from '../ui/icon';
import { CottageMap } from '../ui/map';
import { Modal } from '../ui/modal';
import { UnitStack } from '../ui/unit-stack';

type DialogKind = 'amenities' | 'about' | 'dates' | 'book';

// Approximate area only (privacy): never the house. Fernhollow is fictional; this demo pin is an arbitrary rural point. Circle radius in meters.
const AREA = { lat: 47.1, lng: -101.3, radius: 900, label: 'Fernhollow (fictional demo area)' };

import { MODEL_SOURCES } from '../ui/nested-stays/sources';
@Component({
  selector: 'app-book',
  imports: [Calendar, RouterLink, FormsModule, Viewer, Modal, UnitStack, Icon, CottageMap, NgTemplateOutlet],
  templateUrl: './book.html',
})
export class Book {
  protected readonly modelSources = MODEL_SOURCES;
  private readonly api = inject(Api);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly photos = inject(Photos);
  readonly money = money;
  readonly prettyDate = prettyDate;
  readonly prettyWhen = prettyWhen;
  readonly roomName = roomName;
  readonly today = todayIso();
  readonly area = AREA;

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
  readonly catalog = signal<Property[]>([]);
  readonly step = signal<'dates' | 'details'>('dates');
  readonly saved = signal(false);
  readonly shareNote = signal('');
  readonly slide = signal(0);
  readonly activeRoom = signal('');

  // >= 1024: sticky card in the right column; below: bottom bar + booking sheet
  readonly wide = signal(typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  // under 768 the hero is a swipe track instead of the grid (only one of them renders, so only one LCP image loads)
  readonly phone = signal(typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);

  // dialogs live in the URL so browser Back closes them (MOTION.md 3.5, 6.11)
  private readonly query = toSignal(this.route.queryParamMap.pipe(map((q) => ({
    photos: q.get('photos'), photo: q.get('photo'), dialog: q.get('dialog') as DialogKind | null,
  }))), { initialValue: { photos: null, photo: null, dialog: null } });
  readonly allPhotosOpen = computed(() => this.query().photos === 'all');
  readonly viewerIndex = computed(() => {
    const raw = this.query().photo;
    const n = this.property()?.gallery.length ?? 0;
    const i = raw === null ? -1 : Number(raw);
    return Number.isInteger(i) && i >= 0 && i < n ? i : -1;
  });
  readonly dialog = computed(() => this.query().dialog);
  private pushed = 0;

  readonly rooms = computed((): RoomGroup[] => roomGroups(this.property()?.gallery ?? []));
  readonly heroPhotos = computed((): Photo[] => (this.property()?.gallery ?? []).slice(0, 5));
  readonly amenityCount = computed(() => (this.property()?.amenities ?? []).reduce((n, group) => n + group.items.length, 0));
  readonly topAmenities = computed(() => (this.property()?.amenities ?? []).flatMap((group) => group.items).slice(0, 10));
  readonly stackUnits = computed((): StayUnit[] => this.catalog().map((row) => ({ id: row.slug, name: row.unitLabel, beds: row.bedrooms, contains: row.contains })));

  guests = 2;
  guestName = '';
  guestEmail = '';
  guestPhone = '';
  notes = '';

  private readonly roomEls = viewChildren<ElementRef<HTMLElement>>('roomEl');
  private roomIo?: IntersectionObserver;
  // under 1024 the in-flow price + Reserve row comes first; the fixed bar slides in only once that row has scrolled
  // above the viewport, so the bar never sits on top of the summary at the top of the page
  private readonly ctaEl = viewChild<ElementRef<HTMLElement>>('cta');
  private ctaIo?: IntersectionObserver;
  readonly barOn = signal(false);

  constructor() {
    this.route.paramMap.subscribe(() => void this.load());
    const mq = window.matchMedia('(min-width: 1024px)');
    const onMq = () => {
      this.wide.set(mq.matches);
      if (mq.matches && this.dialog() === 'book') {
        this.closeTop();
      }
    };
    mq.addEventListener('change', onMq);
    const pq = window.matchMedia('(max-width: 767px)');
    const onPq = () => this.phone.set(pq.matches);
    pq.addEventListener('change', onPq);
    inject(DestroyRef).onDestroy(() => {
      mq.removeEventListener('change', onMq);
      pq.removeEventListener('change', onPq);
      this.roomIo?.disconnect();
      this.ctaIo?.disconnect();
    });
    effect(() => {
      const el = this.ctaEl()?.nativeElement;
      this.ctaIo?.disconnect();
      if (!el) {
        this.barOn.set(false);
        return;
      }
      this.ctaIo = new IntersectionObserver(([e]) => this.barOn.set(!e.isIntersecting && e.boundingClientRect.top < 0));
      this.ctaIo.observe(el);
    });
    // active room chip follows the room in view (MOTION.md 3.7)
    effect(() => {
      const els = this.roomEls();
      this.roomIo?.disconnect();
      if (!els.length) {
        return;
      }
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64;
      this.roomIo = new IntersectionObserver((entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) {
          this.activeRoom.set((hit.target as HTMLElement).id);
        }
      }, { rootMargin: `-${header + 56 + 24}px 0px -60% 0px` });
      els.forEach((el) => this.roomIo!.observe(el.nativeElement));
      if (!this.activeRoom()) {
        this.activeRoom.set(els[0].nativeElement.id);
      }
    });
    // browser Back pops a layer without going through closeTop(): keep the push count in step with the URL
    effect(() => {
      const q = this.query();
      const depth = (q.photos ? 1 : 0) + (q.photo !== null ? 1 : 0) + (q.dialog ? 1 : 0);
      this.pushed = Math.min(this.pushed, depth);
    });
  }

  async load(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('slug');
    this.loading.set(true);
    this.confirmation.set(null);
    this.checkIn.set(null);
    this.checkOut.set(null);
    this.quote.set(null);
    this.step.set('dates');
    this.slide.set(0);
    this.activeRoom.set('');
    try {
      const [rows] = await Promise.all([firstValueFrom(this.api.properties()), this.photos.load()]);
      this.catalog.set(rows);
      if (!slug) {
        this.property.set(null);
        this.days.set([]);
        this.error.set('');
        return;
      }
      const property = rows.find((item) => item.slug === slug) ?? await firstValueFrom(this.api.property(slug));
      const days = await firstValueFrom(this.api.availability(addDays(this.today, -10), addDays(this.today, 150), property.slug));
      this.property.set(property);
      this.days.set(days);
      this.guests = Math.min(2, property.maxGuests);
      this.saved.set(localStorage.getItem('saved:' + property.slug) === '1');
      this.error.set('');
    } catch (error) {
      this.property.set(null);
      this.error.set(this.api.readError(error));
    } finally {
      this.loading.set(false);
    }
  }

  // ---- dialogs via query params
  private openParams(params: Record<string, string | null>): void {
    this.pushed++;
    void this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }

  closeTop(): void {
    if (this.pushed > 0) {
      this.pushed--;
      history.back();
      return;
    }
    // opened from a deep link: drop the top layer without adding history
    const q = this.query();
    const params = q.photo !== null ? { photo: null } : q.dialog ? { dialog: null } : { photos: null };
    void this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  openViewer(photo?: Photo): void {
    const list = this.property()?.gallery ?? [];
    const index = photo ? Math.max(0, list.indexOf(photo)) : 0;
    this.openParams({ photo: String(index) });
  }

  setViewer(index: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { photo: String(index) }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  openAllPhotos(): void {
    this.openParams({ photos: 'all' });
  }

  openDialog(kind: DialogKind): void {
    this.openParams({ dialog: kind });
  }

  onSlide(event: Event): void {
    const el = event.target as HTMLElement;
    this.slide.set(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  }

  jump(id: string, event?: Event): void {
    event?.preventDefault();
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    const target = el.querySelector<HTMLElement>('h2[tabindex], h3[tabindex]') ?? el;
    target.focus({ preventScroll: true });
    history.replaceState(history.state, '', `${location.pathname}${location.search}#${id}`);
  }

  async share(listing: Property): Promise<void> {
    const url = location.href.split('#')[0].split('?')[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: listing.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      this.shareNote.set('Link copied');
    } catch {
      this.shareNote.set('');
    }
    setTimeout(() => this.shareNote.set(''), 2400);
  }

  toggleSave(listing: Property): void {
    const next = !this.saved();
    this.saved.set(next);
    if (next) {
      localStorage.setItem('saved:' + listing.slug, '1');
    } else {
      localStorage.removeItem('saved:' + listing.slug);
    }
  }

  // ---- content helpers
  // listing copy is imported from the host's other listings; keep the page Ulric-branded (no platform name)
  clean(text: string): string {
    return (text || '')
      .replace(/\s*The full policy is on the Airbnb listing\.?/gi, '')
      .replace(/(another one of )?our (other )?Airbnb( rentals?)?/gi, (_m, another, other, plural) => `${another ?? ''}our ${other ?? ''}${plural ? plural.trim() : 'rental'}`)
      .replace(/\bAirbnb\b/gi, 'the listing');
  }

  roomBeds(listing: Property, room: string): string {
    return listing.sleeping.find((spot) => spot.room === room)?.beds ?? '';
  }

  roomPhoto(room: string): Photo | null {
    return this.rooms().find((group) => group.name === room)?.photos[0] ?? null;
  }

  photoIndex(photo: Photo): number {
    return (this.property()?.gallery ?? []).indexOf(photo);
  }

  facts(listing: Property): string {
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    return [
      `Sleeps ${listing.maxGuests}`,
      plural(listing.bedrooms, 'bedroom', 'bedrooms'),
      plural(listing.beds, 'bed', 'beds'),
      plural(listing.baths, 'bath', 'baths'),
    ].join(' · ');
  }

  icon(item: string): string {
    const t = item.toLowerCase();
    const table: [RegExp, string][] = [
      [/wifi|internet/, 'wifi'], [/kitchen|stove|oven|microwave|cooking|refrigerator|dishes|toaster/, 'kitchen'],
      [/coffee|kettle/, 'coffee'], [/parking|ev charger|garage/, 'parking'], [/washer|dryer|laundry|iron/, 'laundry'],
      [/tv|roku|netflix|streaming/, 'tv'], [/workspace|desk|office/, 'desk'], [/heat|air condition|fan/, 'climate'],
      [/smoke|carbon|fire|first aid/, 'safety'], [/bed|linen|pillow|blanket|hanger|closet/, 'bed'],
      [/patio|backyard|garden|deck|grill|bbq|outdoor/, 'yard'], [/shower|bath|hair dryer|shampoo|soap|towel|water/, 'bath'],
    ];
    return table.find(([re]) => re.test(t))?.[1] ?? 'dot';
  }

  rules(text: string): string[] {
    return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  }

  unit(property: Property, count = 1): string {
    const label = property.rateLabel || 'night';
    return count === 1 ? label : `${label}s`;
  }

  holds(listing: Property): string {
    if (!listing.blocks.length) {
      return 'This stay links to nothing else.';
    }
    const names = listing.blocks.map((name) => `the ${name}`);
    if (names.length === 1) {
      return `Booking this stay also holds ${names[0]}.`;
    }
    if (names.length === 2) {
      return `Booking this stay also holds ${names[0]} and ${names[1]}.`;
    }
    return `Booking this stay also holds ${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}.`;
  }

  // ---- booking flow (unchanged request-then-approve; payment details only after approval)
  choose(slug: string): void {
    if (!slug || slug === this.property()?.slug) {
      return;
    }
    void this.router.navigate(['/book', slug]);
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
    if (this.dialog() === 'dates') {
      this.closeTop();
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

  reserve(): void {
    if (!(this.checkIn() && this.checkOut())) {
      if (this.wide() || this.dialog() === 'book') {
        this.openDialog('dates');
      } else {
        this.jump('dates');
      }
      return;
    }
    this.step.set('details');
    setTimeout(() => document.querySelector<HTMLInputElement>('.bk-live #bk-name')?.focus(), 60);
  }

  barReserve(): void {
    this.openDialog('book');
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
      this.step.set('dates');
      this.days.set(await firstValueFrom(this.api.availability(addDays(this.today, -10), addDays(this.today, 150), property.slug)));
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.submitting.set(false);
    }
  }
}
