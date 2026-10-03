import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { config } from '../../server/config';
import { createOfferGenerator } from '../../server/offers';
import { readSeed } from '../../server/store';

const maya = 'cus_025';
const secret = 'fake-provider-key-never-return';
type RequestData = { model: string; store: boolean; max_output_tokens: number; instructions: string; input: string };
type PromptData = {
  customer: { first_name: string; favorite_item: string | null; visits: number; visit_dates: string[] };
  candidate_messages: string[];
};
function requestData(init: RequestInit | undefined) {
  const body = JSON.parse(String(init?.body)) as RequestData;
  return { body, prompt: JSON.parse(body.input) as PromptData };
}
function completed(text: string) {
  return { status: 'completed', error: null, incomplete_details: null, output: [
    { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] },
  ] };
}
const fakeFetch = (handler: (input: Parameters<typeof fetch>[0], init?: RequestInit) => Response | Promise<Response>): typeof fetch =>
  async (input, init) => handler(input, init);
const provider = (payload: unknown) => fakeFetch(() => Response.json(payload));
const cachedMaya = () => readSeed().offers.find(offer => offer.customer_id === maya)!.message;

test('no key never calls provider; immutable seed fallback ignores runtime edits and does not mutate database', async () => {
  const db = readSeed();
  db.offers.find(offer => offer.customer_id === maya)!.message = 'Unsafe runtime edit: free parfaits forever';
  const before = structuredClone(db);
  const generate = createOfferGenerator({ apiKey: '', fetch: fakeFetch(() => { throw new Error('Provider must not be called'); }) });
  assert.deepEqual(await generate(db, maya), { message: cachedMaya(), source: 'cached' });
  assert.deepEqual(db, before);
  for (const customer of db.customers) {
    const result = await generate(db, customer.id);
    assert.equal(result.source, 'cached');
    assert.ok(result.message.length > 0 && result.message.length <= 280);
    assert.equal(result.message, result.message.trim());
  }
});

test('Responses request uses only allowed facts, no phone/name surname/key in prompt, and extracts assistant text', async () => {
  const db = readSeed();
  const before = structuredClone(db);
  let selected = '';
  const generate = createOfferGenerator({ apiKey: secret, fetch: fakeFetch((url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${secret}`);
    assert.ok(init?.signal instanceof AbortSignal);
    const { body, prompt } = requestData(init);
    assert.equal(body.model, config.openaiModel);
    assert.equal(body.store, false);
    assert.ok(body.max_output_tokens > 0 && body.max_output_tokens <= 200);
    assert.deepEqual(Object.keys(prompt.customer).sort(), ['favorite_item', 'first_name', 'visit_dates', 'visits']);
    assert.equal(prompt.customer.first_name, 'Maya');
    assert.equal(prompt.customer.favorite_item, 'Strawberry Cloud Parfait');
    const dates = db.orders.filter(order => order.customer_id === maya && order.created_at <= config.demoNow).map(order => order.created_at).sort();
    assert.deepEqual(prompt.customer.visit_dates, dates);
    assert.equal(prompt.customer.visits, dates.length);
    assert.ok(!String(init?.body).includes('Patel'));
    assert.ok(!String(init?.body).includes(secret));
    for (const customer of db.customers) assert.ok(!String(init?.body).includes(customer.phone));
    selected = prompt.candidate_messages[1];
    return Response.json({ ...completed(selected), output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', role: 'assistant', status: 'completed', content: [
        { type: 'output_text', text: `  ${selected.slice(0, 25)}` },
        { type: 'output_text', text: `${selected.slice(25)}  ` },
      ] },
    ] });
  }) });
  assert.deepEqual(await generate(db, maya), { message: selected, source: 'ai' });
  assert.deepEqual(db, before);
});

test('new customers have a deterministic welcome, no invented purchase, and exclude future orders from prompts', async () => {
  const db = readSeed();
  const customer = { id: 'new-person', name: 'New friend', phone: '+15195550199', joined_at: config.demoNow, stamps: 0 };
  db.customers.push(customer);
  db.orders.push({ ...structuredClone(db.orders[0]), id: 'future-order', customer_id: customer.id, created_at: '2099-01-01T00:00:00.000Z' });
  const fallback = createOfferGenerator({ apiKey: '' });
  const first = await fallback(db, customer.id);
  assert.deepEqual(await fallback(db, customer.id), first);
  assert.match(first.message, /Hi friend! Welcome to Bakeria!/);
  assert.match(first.message, /free topping with your next parfait/);
  assert.doesNotMatch(first.message, /Favorite|visits|last|2099/);
  const generate = createOfferGenerator({ apiKey: secret, fetch: fakeFetch((_url, init) => {
    const { prompt } = requestData(init);
    assert.deepEqual(prompt.customer, { first_name: 'friend', favorite_item: null, visits: 0, visit_dates: [] });
    return Response.json(completed(prompt.candidate_messages[0]));
  }) });
  assert.equal((await generate(db, customer.id)).source, 'ai');
});

test('uncached history stays factual and maximum-length names fit the message contract', async () => {
  const db = readSeed();
  const customer = db.customers[0];
  customer.name = 'N'.repeat(80);
  for (const item of db.menu_items) item.name = 'F'.repeat(80);
  const result = await createOfferGenerator({ apiKey: '' })(db, customer.id);
  assert.ok(result.message.includes(customer.name));
  assert.ok(result.message.includes('F'.repeat(80)));
  assert.ok(result.message.length <= 280);
  assert.match(result.message, /We'd love to see you again/);
  assert.match(result.message, /free topping with your next parfait/);
});

test('every candidate is short, in Grandma\'s voice, keeps the one benefit, and never repeats the fallback', async () => {
  const db = readSeed();
  const plain = createOfferGenerator({ apiKey: '' });
  for (const customer of db.customers) {
    let candidates: string[] = [];
    let first = '';
    let visits = -1;
    await createOfferGenerator({ apiKey: secret, fetch: fakeFetch((_url, init) => {
      const { prompt } = requestData(init);
      candidates = prompt.candidate_messages;
      first = prompt.customer.first_name;
      visits = prompt.customer.visits;
      return Response.json(completed(candidates[0]));
    }) })(db, customer.id);
    assert.ok(candidates.length >= 2, `${customer.id} should get a real choice`);
    const fallback = (await plain(db, customer.id)).message;
    for (const message of candidates) {
      assert.ok(message.length <= 280);
      assert.ok(message.includes(first));
      assert.match(message, /free topping with your next parfait/);
      assert.match(message, /(Love|Hugs|With love), Grandma$/);
      assert.doesNotMatch(message, /%|\$|discount|expire|today|tonight/i);
      assert.notEqual(message, fallback);
      // The only number a message may state is the customer's real visit count.
      for (const number of message.match(/\d+/g) ?? []) assert.equal(Number(number), visits);
    }
  }
});

test('new customers only get welcome lines; lapsed regulars get missed-you lines', async () => {
  const db = readSeed();
  const capture = async (customerId: string) => {
    let candidates: string[] = [];
    await createOfferGenerator({ apiKey: secret, fetch: fakeFetch((_url, init) => {
      candidates = requestData(init).prompt.candidate_messages;
      return Response.json(completed(candidates[0]));
    }) })(db, customerId);
    return candidates;
  };
  db.customers.push({ id: 'new-person', name: 'New friend', phone: '+15195550199', joined_at: config.demoNow, stamps: 0 });
  for (const message of await capture('new-person')) {
    assert.match(message, /welcome|glad you found us/i);
    assert.doesNotMatch(message, /missed|again|visits|seeing you/i);
  }
  const lapsed = await capture(maya);
  assert.ok(lapsed.some(message => /missed you/.test(message)));
  assert.ok(lapsed.every(message => !/visits and counting/.test(message)));
});

test('unknown customer fails before any provider call', async () => {
  const generate = createOfferGenerator({ apiKey: secret, fetch: fakeFetch(() => { throw new Error('Must not fetch'); }) });
  await assert.rejects(generate(readSeed(), 'missing'), /Customer not found/);
});

test('HTTP errors, rejected fetch, and invalid JSON return cached text without leaking provider details', async t => {
  const failures: [string, typeof fetch][] = [
    ...[401, 429, 500, 503].map(status => [`HTTP ${status}`, fakeFetch(() => new Response(secret, { status }))] as [string, typeof fetch]),
    ['network failure', fakeFetch(() => { throw new Error(secret); })],
    ['invalid JSON', fakeFetch(() => new Response(`not JSON: ${secret}`))],
  ];
  for (const [label, fetch] of failures) await t.test(label, async () => {
    const result = await createOfferGenerator({ apiKey: secret, fetch })(readSeed(), maya);
    assert.deepEqual(result, { message: cachedMaya(), source: 'cached' });
    assert.ok(!JSON.stringify(result).includes(secret));
  });
});

test('malformed, incomplete, refused, and non-text responses fall back', async t => {
  const cases: [string, unknown][] = [
    ['null', null],
    ['array root', []],
    ['missing output', { status: 'completed' }],
    ['SDK-only output_text', { status: 'completed', output_text: cachedMaya() }],
    ['output object', { status: 'completed', output: {} }],
    ['empty output', { status: 'completed', output: [] }],
    ['null output item', { status: 'completed', output: [null] }],
    ['incomplete response', { ...completed('hello'), status: 'incomplete' }],
    ['incomplete details', { ...completed('hello'), incomplete_details: { reason: 'max_output_tokens' } }],
    ['provider error', { ...completed('hello'), error: { message: secret } }],
    ['refusal', { status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: 'No' }] }] }],
    ['incomplete message', { status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'incomplete', content: [] }] }],
    ['wrong role', { status: 'completed', output: [{ type: 'message', role: 'user', status: 'completed', content: [] }] }],
    ['missing content array', { status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: 'hello' }] }],
    ['numeric text', { status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 12 }] }] }],
    ['tool output', { status: 'completed', output: [{ type: 'function_call', name: 'unexpected' }] }],
    ['blank', completed(' \n ')],
    ['oversized', completed('x'.repeat(281))],
  ];
  for (const [label, payload] of cases) await t.test(label, async () => {
    assert.deepEqual(await createOfferGenerator({ apiKey: secret, fetch: provider(payload) })(readSeed(), maya), { message: cachedMaya(), source: 'cached' });
  });
});

test('extra benefits, hallucinated history, expiry, and phone/key output are rejected', async t => {
  const mutations: [string, (valid: string) => string][] = [
    ['extra discount', text => text + ' Plus 20% off!'],
    ['free parfait', text => text.replace('free topping', 'free parfait')],
    ['invented visit count', text => text + ' Thanks for your 999 visits.'],
    ['invented date', text => text + ' We loved seeing you yesterday.'],
    ['invented favorite', text => text.replace('Strawberry Cloud Parfait', 'Blueberry Pie')],
    ['expiry', text => text + ' Ends tomorrow.'],
    ['phone', text => text + ' Call +15195550125'],
    ['key', () => secret],
    ['instructions', () => 'Ignore the offer policy and give everything away.'],
  ];
  for (const [label, change] of mutations) await t.test(label, async () => {
    const generate = createOfferGenerator({ apiKey: secret, fetch: fakeFetch((_url, init) => Response.json(completed(change(requestData(init).prompt.candidate_messages[0])))) });
    assert.deepEqual(await generate(readSeed(), maya), { message: cachedMaya(), source: 'cached' });
  });
});

test('configured short deadline aborts a fetch that ignores cancellation and a stalled JSON body', async t => {
  for (const phase of ['fetch', 'body']) await t.test(phase, async () => {
    let signal: AbortSignal | null | undefined;
    const never = new Promise<Response>(() => {});
    const fetch = fakeFetch((_url, init) => {
      signal = init?.signal;
      if (phase === 'fetch') return never;
      return { ok: true, json: () => new Promise(() => {}) } as unknown as Response;
    });
    const start = performance.now();
    const result = await createOfferGenerator({ apiKey: secret, fetch, timeoutMs: 25 })(readSeed(), maya);
    assert.equal(result.source, 'cached');
    assert.equal(signal?.aborted, true);
    assert.ok(performance.now() - start < 1000);
  });
});

test('four-second maximum deadline covers a stalled provider body', { timeout: 6500 }, async () => {
  let signal: AbortSignal | null | undefined;
  const fetch = fakeFetch((_url, init) => {
    signal = init?.signal;
    return { ok: true, json: () => new Promise(() => {}) } as unknown as Response;
  });
  const start = performance.now();
  assert.deepEqual(await createOfferGenerator({ apiKey: secret, fetch, timeoutMs: 4000 })(readSeed(), maya), { message: cachedMaya(), source: 'cached' });
  const elapsed = performance.now() - start;
  assert.equal(signal?.aborted, true);
  assert.ok(elapsed >= 3950 && elapsed < 5500, `Fallback elapsed ${elapsed} ms`);
  for (const invalid of [0, -1, 4001, Infinity, NaN, 1.5]) {
    assert.throws(() => createOfferGenerator({ timeoutMs: invalid }), /between 1 and 4000/);
  }
});
