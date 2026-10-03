import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) loadEnvFile('.env');

export type AiProvider = 'openai' | 'gemini';
const hasKey = (name: string) => Boolean((process.env[name] ?? '').trim());
// Explicit AI_PROVIDER wins. Otherwise a Gemini key alone selects Gemini; anything else keeps OpenAI.
const defaultProvider: AiProvider = hasKey('GEMINI_API_KEY') && !hasKey('OPENAI_API_KEY') ? 'gemini' : 'openai';

export const config = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 3000),
  dataFile: process.env.DATA_FILE || 'data/runtime.json',
  demoNow: process.env.DEMO_NOW || '2026-10-02T22:30:00.000Z',
  orderFormUrl: process.env.ORDER_FORM_URL || null,
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 4000),
  aiProvider: (process.env.AI_PROVIDER || defaultProvider) as AiProvider,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
};
if (!Number.isFinite(Date.parse(config.demoNow))) throw new Error('Invalid DEMO_NOW');
config.demoNow = new Date(config.demoNow).toISOString();
if (!Number.isInteger(config.aiTimeoutMs) || config.aiTimeoutMs < 1 || config.aiTimeoutMs > 4000) {
  throw new Error('AI_TIMEOUT_MS must be between 1 and 4000');
}
if (config.aiProvider !== 'openai' && config.aiProvider !== 'gemini') {
  throw new Error('AI_PROVIDER must be "openai" or "gemini"');
}
if (config.orderFormUrl && !/^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/.test(config.orderFormUrl)) {
  throw new Error('ORDER_FORM_URL must be a published HTTPS Google Form link');
}
