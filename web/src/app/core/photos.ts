import { Injectable } from '@angular/core';
import { Photo } from './models';

export interface PhotoMeta { w: number; h: number; q: string }
export interface RoomGroup { id: string; name: string; photos: Photo[]; start: number }

// photos/meta.json is built by web/scripts/photo-meta.py (size, 20px blur-up placeholder, 800w variant)
@Injectable({ providedIn: 'root' })
export class Photos {
  private meta: Record<string, PhotoMeta> = {};
  private pending: Promise<void> | null = null;

  load(): Promise<void> {
    this.pending ??= fetch('photos/meta.json')
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: Record<string, PhotoMeta>) => { this.meta = data; })
      .catch(() => undefined);
    return this.pending;
  }

  info(src: string): PhotoMeta {
    return this.meta[src] ?? { w: 1600, h: 1067, q: '' };
  }

  small(src: string): string {
    return this.meta[src] ? src.replace(/\/([^/]+)$/, '/w800/$1') : src;
  }

  srcset(src: string): string | null {
    const m = this.meta[src];
    return m ? `${this.small(src)} 800w, ${src} ${m.w}w` : null;
  }
}

export function roomName(room: string): string {
  return room === 'Additional photos' ? 'More photos' : room || 'More photos';
}

export function roomGroups(photos: readonly Photo[]): RoomGroup[] {
  const groups: RoomGroup[] = [];
  photos.forEach((photo, index) => {
    const name = roomName(photo.room);
    let group = groups.find((item) => item.name === name);
    if (!group) {
      group = { id: 'room-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, photos: [], start: index };
      groups.push(group);
    }
    group.photos.push(photo);
  });
  // keep the extras last
  return groups.sort((a, b) => Number(a.name === 'More photos') - Number(b.name === 'More photos'));
}
