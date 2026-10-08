export function money(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value ?? 0);
}

export function prettyDate(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function prettyWhen(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function chip(value: string | null | undefined): string {
  return (value ?? 'none').toLowerCase();
}

export function label(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

export function stayUnit(_slug: string | null | undefined, count: number): string {
  return count === 1 ? 'night' : 'nights';
}

export function feeName(_slug: string | null | undefined): string {
  return 'Cleaning';
}

export function guestCount(count: number): string {
  return `${count} ${count === 1 ? 'guest' : 'guests'}`;
}

export function paidPercent(paid: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (paid / total) * 100));
}

export function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}
