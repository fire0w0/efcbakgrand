import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../../server/config';
import { createOfferGenerator } from '../../server/offers';
import { readSeed } from '../../server/store';

// Gemini provider: same grounded candidates and fallback rules as the OpenAI path.
const maya = 'cus_025';
const secret = 'fake-gemini-key-never-return';
type GeminiBody = {
  system_instruction: { parts: { text: string }[] };
  contents: { role: string; parts: { text: string }[] }[];
  generationConfig: { maxOutputTokens: number; thinkingConfig?: { thinkingBudget: number } };
};
type PromptData = {
  customer: { first_name: string; favorite_item: string | null; visits: number; visit_dates: string[] };
  candidate_messages: string[];
};
function requestData(init: RequestInit | undefined) {
  const body = JSON.parse(String(init?.body)) as GeminiBody;
  return { body, prompt: JSON.parse(body.contents[0].parts[0].text) as PromptData };
}
const reply = (text: string, finishReason = 'STOP') => ({
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason, index: 0 }],
  usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
  modelVersion: 'gemini-2.5-flash',
});
const fakeFetch = (handler: (input: Parameters<typeof fetch>[0], init?: RequestInit) => Response | Promise<Response>): typeof fetch =>
  async (input, init) => handler(input, init);
const cachedMaya = () => readSeed().offers.find(offer => offer.customer_id === maya)!.message;
const gemini = (extra: Parameters<typeof createOfferGenerator>[0]) => createOfferGenerator({ provider: 'gemini', ...extra });

test('no Gemini key never calls the provider and returns the cached draft', async () => {
  const generate = gemini({ apiKey: '', fetch: fakeFetch(() => { throw new Error('Provider must not be called'); }) });
  assert.deepEqual(await generate(readSeed(), maya), { message: cachedMaya(), source: 'cached' });
});

test('generateContent request carries the key in a header, grounded facts only, and thinking disabled', async () => {
  const db = readSeed();
  const before = structuredClone(db);
  let selected = '';
  const generate = gemini({ apiKey: secret, fetch: fakeFetch((url, init) => {
    assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`);
    assert.ok(!String(url).includes(secret), 'key must not be in the URL');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('x-goog-api-key'), secret);
    assert.ok(init?.signal instanceof AbortSignal);
    const { body, prompt } = requestData(init);
    assert.match(body.system_instruction.parts[0].text, /free topping with the next parfait/);
    assert.equal(body.contents[0].role, 'user');
    assert.ok(body.generationConfig.maxOutputTokens > 0 && body.generationConfig.maxOutputTokens <= 200);
    assert.equal(body.generationConfig.thinkingConfig?.thinkingBudget, 0);
    assert.deepEqual(Object.keys(prompt.customer).sort(), ['favorite_item', 'first_name', 'visit_dates', 'visits']);
    assert.equal(prompt.customer.first_name, 'Maya');
    assert.equal(prompt.customer.favorite_item, 'Strawberry Cloud Parfait');
    assert.ok(!String(init?.body).includes('Patel'));
    assert.ok(!String(init?.body).includes(secret));
    for (const customer of db.customers) assert.ok(!String(init?.body).includes(customer.phone));
    selected = prompt.candidate_messages[2];
    // Multi-part answers with surrounding whitespace and a thought summary still parse.
    return Response.json({ ...reply(''), candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [
      { text: 'planning...', thought: true },
      { text: `  ${selected.slice(0, 10)}` },
      { text: `${selected.slice(10)} \n` },
    ] } }] });
  }) });
  assert.deepEqual(await generate(db, maya), { message: selected, source: 'ai' });
  assert.deepEqual(db, before);
});

test('explicit model option overrides the configured Gemini model', async () => {
  let url = '';
  const generate = gemini({ apiKey: secret, model: 'gemini-2.5-flash-lite', fetch: fakeFetch((input, init) => {
    url = String(input);
    return Response.json(reply(requestData(init).prompt.candidate_messages[0]));
  }) });
  assert.equal((await generate(readSeed(), maya)).source, 'ai');
  assert.match(url, /models\/gemini-2\.5-flash-lite:generateContent$/);
});

test('HTTP errors, rejected fetch, and invalid JSON fall back without leaking provider details', async t => {
  const failures: [string, typeof fetch][] = [
    ...[400, 403, 429, 500, 503].map(status => [`HTTP ${status}`, fakeFetch(() => new Response(secret, { status }))] as [string, typeof fetch]),
    ['network failure', fakeFetch(() => { throw new Error(secret); })],
    ['invalid JSON', fakeFetch(() => new Response(`not JSON: ${secret}`))],
  ];
  for (const [label, fetch] of failures) await t.test(label, async () => {
    const result = await gemini({ apiKey: secret, fetch })(readSeed(), maya);
    assert.deepEqual(result, { message: cachedMaya(), source: 'cached' });
    assert.ok(!JSON.stringify(result).includes(secret));
  });
});

test('malformed, blocked, truncated, and non-text Gemini responses fall back', async t => {
  const good = cachedMaya();
  const cases: [string, unknown][] = [
    ['null', null],
    ['array root', []],
    ['empty object', {}],
    ['error object', { error: { code: 400, message: secret, status: 'INVALID_ARGUMENT' } }],
    ['prompt blocked', { promptFeedback: { blockReason: 'SAFETY' }, candidates: [] }],
    ['no candidates', { candidates: [] }],
    ['null candidate', { candidates: [null] }],
    ['max tokens', reply(good, 'MAX_TOKENS')],
    ['safety stop', reply(good, 'SAFETY')],
    ['missing content', { candidates: [{ finishReason: 'STOP' }] }],
    ['parts not array', { candidates: [{ finishReason: 'STOP', content: { parts: 'hello' } }] }],
    ['numeric text', { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 12 }] } }] }],
    ['function call part', { candidates: [{ finishReason: 'STOP', content: { parts: [{ functionCall: { name: 'x' } }] } }] }],
    ['only thoughts', { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'hmm', thought: true }] } }] }],
    ['blank', reply(' \n ')],
    ['oversized', reply('x'.repeat(281))],
  ];
  for (const [label, payload] of cases) await t.test(label, async () => {
    const generate = gemini({ apiKey: secret, fetch: fakeFetch(() => Response.json(payload)) });
    assert.deepEqual(await generate(readSeed(), maya), { message: cachedMaya(), source: 'cached' });
  });
});

test('Gemini output that is not an exact grounded candidate is rejected', async t => {
  const mutations: [string, (valid: string) => string][] = [
    ['extra discount', text => text + ' Plus 20% off!'],
    ['free parfait', text => text.replace('free topping', 'free parfait')],
    ['quoted', text => `"${text}"`],
    ['commentary', text => `Here is the warmest option: ${text}`],
    ['key', () => secret],
  ];
  for (const [label, change] of mutations) await t.test(label, async () => {
    const generate = gemini({ apiKey: secret, fetch: fakeFetch((_url, init) => Response.json(reply(change(requestData(init).prompt.candidate_messages[0])))) });
    assert.deepEqual(await generate(readSeed(), maya), { message: cachedMaya(), source: 'cached' });
  });
});

test('short deadline aborts a stalled Gemini fetch', async () => {
  let signal: AbortSignal | null | undefined;
  const fetch = fakeFetch((_url, init) => { signal = init?.signal; return new Promise<Response>(() => {}); });
  const result = await gemini({ apiKey: secret, fetch, timeoutMs: 25 })(readSeed(), maya);
  assert.equal(result.source, 'cached');
  assert.equal(signal?.aborted, true);
});
