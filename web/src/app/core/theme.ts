import { Injectable, signal } from '@angular/core';

export type ThemeName = 'light' | 'dark';

const STORAGE_KEY = 'ulric-theme';

@Injectable({ providedIn: 'root' })
export class Theme {
  readonly theme = signal<ThemeName>('light');

  constructor() {
    const stored = this.readStored();
    const initial = stored ?? this.system();
    this.apply(initial, false);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
      if (!this.readStored()) {
        this.apply(event.matches ? 'dark' : 'light', false);
      }
    });
  }

  toggle(): void {
    this.apply(this.theme() === 'dark' ? 'light' : 'dark', true);
  }

  private apply(theme: ThemeName, persist: boolean): void {
    this.theme.set(theme);
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  }

  private readStored(): ThemeName | null {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  }

  private system(): ThemeName {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
