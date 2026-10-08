import { AfterViewInit, Component, ElementRef, OnDestroy, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Chart } from 'chart.js/auto';
import { firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { chip, label, money, prettyDate } from '../core/format';
import { Dashboard } from '../core/models';
import { Theme } from '../core/theme';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
})
export class DeskHome implements AfterViewInit, OnDestroy {
  private readonly api = inject(Api);
  private readonly theme = inject(Theme);
  readonly money = money;
  readonly prettyDate = prettyDate;
  readonly chip = chip;
  readonly label = label;

  readonly loading = signal(true);
  readonly desk = signal<Dashboard | null>(null);
  readonly error = signal('');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('chart');
  private chart?: Chart;

  constructor() {
    void this.load();
    effect(() => {
      this.theme.theme();
      this.desk();
      this.canvas();
      setTimeout(() => this.draw());
    });
  }

  async load(): Promise<void> {
    try {
      this.desk.set(await firstValueFrom(this.api.dashboard()));
    } catch (error) {
      this.error.set(this.api.readError(error));
    } finally {
      this.loading.set(false);
    }
  }

  ngAfterViewInit(): void {
    this.draw();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private draw(): void {
    const canvas = this.canvas()?.nativeElement;
    const desk = this.desk();
    if (!canvas || !desk) {
      return;
    }
    const styles = getComputedStyle(document.documentElement);
    const bar = styles.getPropertyValue('--terracotta').trim() || '#d97757';
    const ink = styles.getPropertyValue('--ink-soft').trim() || '#5e5a53';
    const grid = styles.getPropertyValue('--line').trim() || '#e4e0d6';
    this.chart?.destroy();
    this.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: desk.revenueByMonth.map((month) => month.label),
        datasets: [
          {
            label: 'Collected',
            data: desk.revenueByMonth.map((month) => month.amount),
            backgroundColor: bar,
            borderRadius: 0,
            maxBarThickness: 42,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => money(Number(item.raw)),
            },
          },
        },
        scales: {
          x: { ticks: { color: ink }, grid: { display: false } },
          y: { ticks: { color: ink, callback: (value) => money(Number(value)) }, grid: { color: grid }, beginAtZero: true },
        },
      },
    });
  }
}
