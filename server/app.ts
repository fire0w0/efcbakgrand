import express from 'express';
import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler } from 'express';
import type { ApiError, ConfigResponse, CustomerDetailResponse, CustomerListResponse, Database, HealthResponse, HubResponse, MenuResponse, JoinResponse, StampResponse, RewardRedeemResponse, OfferResponse, Offer } from '../src/shared/contracts';
import { config } from './config';
import { metrics, summaries } from './domain';
import { generateOffer } from './offers';
import { readSeed } from './store';
import { conflict, HttpError, invalid, missing, normalizePhone, objectBody, offerMessage } from './validation';

const templateIds = new Set(readSeed().offers.map(offer => offer.id));

export interface AppOptions {
  write?: (db: Database) => void;
  generateOffer?: typeof generateOffer;
}

export function createApp(readSource: () => Database, options: AppOptions = {}) {
  // The original one-argument factory remains usable without touching runtime storage.
  let memory: Database | undefined;
  const read = options.write ? readSource : () => memory ?? structuredClone(readSource());
  const write = options.write ?? ((db: Database) => { memory = db; });
  const mutate = <T>(change: (db: Database) => T): T => {
    const db = structuredClone(read());
    const result = change(db);
    write(db);
    return result;
  };
  const customerIn = (db: Database, id: string) => db.customers.find(customer => customer.id === id) ?? missing('Customer');
  const offerIn = (db: Database, id: string) => {
    const offer = db.offers.find(offer => offer.id === id) ?? missing('Offer');
    if (templateIds.has(id)) conflict('Create a new draft before changing a cached template.');
    return offer;
  };
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '32kb', inflate: false, verify: (req, _res, buffer) => {
    // body-parser treats an empty payload as {}; the contract requires an actual object.
    if (['POST', 'PATCH'].includes(req.method ?? '') && buffer.length === 0) invalid('Expected a JSON object');
  } }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, mode: 'ready' } satisfies HealthResponse));
  app.get('/api/config', (_req, res) => res.json({
    as_of: config.demoNow, reward_target: 10, order_form_url: config.orderFormUrl, demo_mode: true,
  } satisfies ConfigResponse));
  app.get('/api/menu', (_req, res) => res.json({ menu_items: read().menu_items } satisfies MenuResponse));
  app.get('/api/customers', (req, res) => {
    if (Object.keys(req.query).some(key => !['sort', 'direction', 'lapsed'].includes(key)) ||
      Object.values(req.query).some(value => typeof value !== 'string')) invalid('Invalid list query');
    const sort = String(req.query.sort ?? 'name');
    const direction = String(req.query.direction ?? 'asc');
    const lapsed = req.query.lapsed === undefined ? undefined : String(req.query.lapsed);
    if (!['name', 'visits', 'favorite_item', 'last_visit', 'total_spend_cents'].includes(sort) ||
      !['asc', 'desc'].includes(direction) || (lapsed !== undefined && !['true', 'false'].includes(lapsed))) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid list query' } } satisfies ApiError);
      return;
    }
    let customers = summaries(read(), config.demoNow);
    if (lapsed !== undefined) customers = customers.filter(c => c.is_lapsed === (lapsed === 'true'));
    customers.sort((a, b) => {
      const av = sort === 'favorite_item' ? a.favorite_item?.name ?? null : a[sort as 'name' | 'visits' | 'last_visit' | 'total_spend_cents'];
      const bv = sort === 'favorite_item' ? b.favorite_item?.name ?? null : b[sort as 'name' | 'visits' | 'last_visit' | 'total_spend_cents'];
      if (av === null || bv === null) return av === bv ? a.id.localeCompare(b.id) : av === null ? 1 : -1;
      const comparison = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return comparison * (direction === 'asc' ? 1 : -1) || a.id.localeCompare(b.id);
    });
    res.json({ customers, as_of: config.demoNow } satisfies CustomerListResponse);
  });
  app.get('/api/customers/:id', (req, res) => {
    const db = read();
    const customer = summaries(db, config.demoNow).find(c => c.id === req.params.id);
    if (!customer) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found' } } satisfies ApiError);
    return res.json({ customer,
      orders: db.orders.filter(o => o.customer_id === customer.id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      offers: db.offers.filter(o => o.customer_id === customer.id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    } satisfies CustomerDetailResponse);
  });
  app.get('/api/hub/:id', (req, res) => {
    const db = read();
    const customer = db.customers.find(c => c.id === req.params.id);
    if (!customer) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found' } } satisfies ApiError);
    return res.json({ customer, reward_target: 10, order_form_url: config.orderFormUrl,
      offers: db.offers.filter(o => o.customer_id === customer.id && o.status !== 'draft')
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    } satisfies HubResponse);
  });
  app.get('/api/metrics', (_req, res) => res.json(metrics(read(), config.demoNow)));
  app.post('/api/hub/join', (req, res) => {
    const phone = normalizePhone(objectBody(req.body, ['phone']).phone);
    const result = mutate(db => {
      const existing = db.customers.find(customer => customer.phone === phone);
      if (existing) return { customer: existing, created: false } satisfies JoinResponse;
      const customer = { id: randomUUID(), name: 'New friend', phone, joined_at: config.demoNow, stamps: 0 };
      db.customers.push(customer);
      return { customer, created: true } satisfies JoinResponse;
    });
    res.status(result.created ? 201 : 200).json(result);
  });
  app.post('/api/customers/:id/stamps', (req, res) => {
    objectBody(req.body, []);
    const customer = mutate(db => {
      const customer = customerIn(db, req.params.id);
      if (customer.stamps >= 10) conflict('Reward card is full. Redeem the reward first.');
      customer.stamps += 1;
      return customer;
    });
    res.json({ customer } satisfies StampResponse);
  });
  app.post('/api/customers/:id/rewards/redeem', (req, res) => {
    objectBody(req.body, []);
    const customer = mutate(db => {
      const customer = customerIn(db, req.params.id);
      if (customer.stamps !== 10) conflict('Ten stamps are required to redeem a reward.');
      customer.stamps = 0;
      return customer;
    });
    res.json({ customer, redeemed: true } satisfies RewardRedeemResponse);
  });
  app.post('/api/customers/:id/offers/draft', async (req, res) => {
    objectBody(req.body, []);
    const snapshot = read();
    customerIn(snapshot, req.params.id);
    const draft = await (options.generateOffer ?? generateOffer)(snapshot, req.params.id);
    const offer = mutate(db => {
      // Re-read after generation: stamps, joins and other drafts may have changed meanwhile.
      customerIn(db, req.params.id);
      const offer: Offer = { id: randomUUID(), customer_id: req.params.id,
        message: offerMessage(draft.message), source: draft.source, status: 'draft', created_at: config.demoNow };
      db.offers.push(offer);
      return offer;
    });
    res.status(201).json({ offer } satisfies OfferResponse);
  });
  app.patch('/api/offers/:id', (req, res) => {
    const message = offerMessage(objectBody(req.body, ['message']).message);
    const offer = mutate(db => {
      const offer = offerIn(db, req.params.id);
      if (offer.status !== 'draft') conflict('Only draft offers can be edited.');
      offer.message = message;
      return offer;
    });
    res.json({ offer } satisfies OfferResponse);
  });
  app.post('/api/offers/:id/approve', (req, res) => {
    objectBody(req.body, []);
    const offer = mutate(db => {
      const offer = offerIn(db, req.params.id);
      if (offer.status === 'redeemed') conflict('A redeemed offer cannot be approved again.');
      offer.status = 'approved';
      return offer;
    });
    res.json({ offer } satisfies OfferResponse);
  });
  app.post('/api/offers/:id/redeem', (req, res) => {
    objectBody(req.body, []);
    const offer = mutate(db => {
      const offer = offerIn(db, req.params.id);
      if (offer.status === 'draft') conflict('Approve the offer before redeeming it.');
      offer.status = 'redeemed';
      return offer;
    });
    res.json({ offer } satisfies OfferResponse);
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found' } } satisfies ApiError));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } } satisfies ApiError);
      return;
    }
    const badBody = ['entity.parse.failed', 'entity.too.large', 'entity.verify.failed', 'encoding.unsupported',
      'charset.unsupported', 'request.aborted', 'request.size.invalid'].includes(error?.type) || error instanceof URIError;
    res.status(badBody ? 400 : 500).json({ error: {
      code: badBody ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message: badBody ? 'Invalid request body or path' : 'Unexpected server error',
    } } satisfies ApiError);
  };
  app.use(errors);
  return app;
}
