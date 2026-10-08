import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Theme } from './core/theme';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  readonly theme = inject(Theme);
  private readonly router = inject(Router);
  readonly hostDesk = signal(false);

  constructor() {
    this.sync();
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      this.sync();
      this.playRoute();
    });
  }

  private sync(): void {
    this.hostDesk.set(this.router.url.startsWith('/host'));
  }

  private playRoute(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const main = document.getElementById('content');
    if (!main) {
      return;
    }
    main.classList.remove('route-in');
    void main.offsetWidth;
    main.classList.add('route-in');
  }
}
