// Customer-side display helpers. Business time is America/Toronto; money is CAD cents.
const TORONTO = 'America/Toronto';
const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const short = new Intl.DateTimeFormat('en-CA', { timeZone: TORONTO, weekday: 'short', month: 'short', day: 'numeric' });
const dayOnly = new Intl.DateTimeFormat('en-CA', { timeZone: TORONTO, month: 'short', day: 'numeric' });
export const pickupFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TORONTO, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TORONTO, weekday: 'short', month: 'short', day: 'numeric' });
export const timeFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TORONTO, hour: 'numeric', minute: '2-digit' });
export const dateKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TORONTO, year: 'numeric', month: '2-digit', day: '2-digit' });

export const money = (cents: number) => cad.format(cents / 100);
export const dateShort = (iso: string) => short.format(new Date(iso));
export const dateDay = (iso: string) => dayOnly.format(new Date(iso));
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
export const message = (cause: unknown) => cause instanceof Error ? cause.message : 'Please try again.';
