import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) loadEnvFile('.env');

export const config = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 3000),
  dataFile: process.env.DATA_FILE || 'data/runtime.json',
  demoNow: process.env.DEMO_NOW || '2026-10-02T22:30:00.000Z',
  orderFormUrl: process.env.ORDER_FORM_URL || null,
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 4000),
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
};
if (!Number.isFinite(Date.parse(config.demoNow))) throw new Error('Invalid DEMO_NOW');
if (config.orderFormUrl && !/^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/.test(config.orderFormUrl)) {
  throw new Error('ORDER_FORM_URL must be a published HTTPS Google Form link');
}
