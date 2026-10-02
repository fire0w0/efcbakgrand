// Display helpers for Grandma's dashboard. Business time is America/Toronto; money is CAD cents.
const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', year: 'numeric' });
const dayTime = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', weekday: 'short' });

export function formatCents(cents: number): string { return cad.format(cents / 100); }
export function formatDate(iso: string | null): string { return iso ? day.format(new Date(iso)) : '—'; }
export function formatDateTime(iso: string): string { return dayTime.format(new Date(iso)); }
export function formatWeekday(iso: string): string { return weekday.format(new Date(iso)); }
export function formatPercent(fraction: number): string { return `${Math.round(fraction * 100)}%`; }
/** The API returns unrounded fractional days; round only for display. */
export function roundDays(days: number | null): number | null { return days === null ? null : Math.round(days); }
export function pluralDays(days: number): string { return `${days} day${days === 1 ? '' : 's'}`; }
export function firstName(name: string): string { return name.trim().split(/\s+/)[0] || name; }
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
