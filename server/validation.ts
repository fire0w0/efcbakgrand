import type { ErrorCode } from '../src/shared/contracts';

export class HttpError extends Error {
  constructor(public status: 400 | 404 | 409, public code: ErrorCode, message: string) {
    super(message);
  }
}

export function invalid(message: string): never {
  throw new HttpError(400, 'VALIDATION_ERROR', message);
}

export function objectBody(body: unknown, keys: string[]): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) invalid('Expected a JSON object');
  const record = body as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || !keys.every(key => Object.hasOwn(record, key))) {
    invalid(keys.length ? `Expected only ${keys.join(', ')}` : 'Expected an empty JSON object');
  }
  return record;
}

export function normalizePhone(value: unknown): string {
  if (typeof value !== 'string' || !/^[+0-9 ().-]+$/.test(value)) invalid('Enter a valid ten-digit North American phone number');
  const phone = value.replace(/[ ().-]/g, '');
  if (/^[0-9]{10}$/.test(phone)) return `+1${phone}`;
  if (/^\+?1[0-9]{10}$/.test(phone)) return `+${phone.replace(/^\+/, '')}`;
  return invalid('Enter ten digits, or eleven digits beginning with 1');
}

export function offerMessage(value: unknown): string {
  if (typeof value !== 'string') invalid('Message must be text');
  const message = value.trim();
  if (!message.length || message.length > 280) invalid('Message must be 1 to 280 characters');
  return message;
}

export function missing(entity: string): never {
  throw new HttpError(404, 'NOT_FOUND', `${entity} not found`);
}

export function conflict(message: string): never {
  throw new HttpError(409, 'CONFLICT', message);
}
