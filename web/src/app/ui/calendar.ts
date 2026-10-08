import { Component, computed, input, output, signal } from '@angular/core';
import { DayMark } from '../core/models';

interface Cell {
  date: string | null;
  day: number;
  state: 'Open' | 'Held' | 'Booked' | 'Blocked' | 'Outside';
  heldBy: string;
  label: string;
}

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.html',
})
export class Calendar {
  readonly days = input<DayMark[]>([]);
  readonly checkIn = input<string | null>(null);
  readonly checkOut = input<string | null>(null);
  readonly today = input<string>('');
  readonly picked = output<{ checkIn: string; checkOut: string | null; note: string }>();

  readonly cursor = signal(startOfMonth(new Date()));
  readonly note = signal('');
  readonly slide = signal('');

  readonly title = computed(() =>
    this.cursor().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  );

  readonly cells = computed(() => {
    const states = new Map(this.days().map((day) => [day.date, day]));
    const cursor = this.cursor();
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const count = new Date(year, month + 1, 0).getDate();
    const cells: Cell[] = [];
    for (let i = 0; i < startPad; i++) {
      cells.push({ date: null, day: 0, state: 'Outside', heldBy: '', label: '' });
    }
    for (let day = 1; day <= count; day++) {
      const date = iso(year, month, day);
      const mark = states.get(date);
      const state = mark?.state ?? 'Open';
      const heldBy = mark?.blockedBy ?? '';
      const long = new Date(year, month, day).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
      });
      const label = state === 'Blocked' && heldBy ? `${long}, held by ${heldBy}` : `${long}, ${state.toLowerCase()}`;
      cells.push({ date, day, state, heldBy, label });
    }
    return cells;
  });

  shift(months: number): void {
    const cursor = this.cursor();
    this.cursor.set(new Date(cursor.getFullYear(), cursor.getMonth() + months, 1));
    const next = months > 0 ? 'slide-forward' : 'slide-back';
    this.slide.set('');
    requestAnimationFrame(() => this.slide.set(next));
  }

  select(cell: Cell): void {
    if (!cell.date || cell.state === 'Outside') {
      return;
    }
    if (this.today() && cell.date < this.today()) {
      this.note.set('Choose a night from today onward.');
      return;
    }

    const checkIn = this.checkIn();
    const checkOut = this.checkOut();
    if (!checkIn || checkOut) {
      if (cell.state !== 'Open') {
        this.note.set(closedNote(cell));
        return;
      }
      this.note.set('Now choose the checkout morning.');
      this.picked.emit({ checkIn: cell.date, checkOut: null, note: this.note() });
      return;
    }

    if (cell.date <= checkIn) {
      if (cell.state !== 'Open') {
        this.note.set(closedNote(cell));
        return;
      }
      this.note.set('Now choose the checkout morning.');
      this.picked.emit({ checkIn: cell.date, checkOut: null, note: this.note() });
      return;
    }

    if (!this.nightsOpen(checkIn, cell.date)) {
      this.note.set('Those dates are not open.');
      return;
    }

    this.note.set('');
    this.picked.emit({ checkIn, checkOut: cell.date, note: '' });
  }

  mark(cell: Cell): string {
    if (!cell.date) {
      return 'outside';
    }
    const classes = [cell.state.toLowerCase()];
    if (cell.date === this.today()) {
      classes.push('today');
    }
    if (this.today() && cell.date < this.today()) {
      classes.push('past');
    }
    const checkIn = this.checkIn();
    const checkOut = this.checkOut();
    if (checkIn && cell.date === checkIn) {
      classes.push('edge');
    }
    if (checkOut && cell.date === checkOut) {
      classes.push('edge');
    }
    if (checkIn && checkOut && cell.date > checkIn && cell.date < checkOut) {
      classes.push('between');
    }
    return classes.join(' ');
  }

  private nightsOpen(checkIn: string, checkOut: string): boolean {
    const states = new Map(this.days().map((day) => [day.date, day.state]));
    let cursor = checkIn;
    while (cursor < checkOut) {
      const state = states.get(cursor) ?? 'Open';
      if (state !== 'Open') {
        return false;
      }
      cursor = nextDay(cursor);
    }
    return true;
  }
}

function closedNote(cell: Cell): string {
  if (cell.state === 'Blocked') {
    return cell.heldBy ? `Held by ${cell.heldBy}.` : 'Held by another stay.';
  }
  return cell.state === 'Held' ? 'That date is held for a request.' : 'That date is booked.';
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${`${month + 1}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
}

function nextDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day + 1);
  return iso(date.getFullYear(), date.getMonth(), date.getDate());
}
