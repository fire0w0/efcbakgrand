import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { ApiError, ConfigResponse, CustomerDetailResponse, CustomerListResponse, Database, HealthResponse, HubResponse, MenuResponse } from '../src/shared/contracts';
import { config } from './config';
import { metrics, summaries } from './domain';

export function createApp(read: () => Database) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, mode: 'scaffold' } satisfies HealthResponse));
  app.get('/api/config', (_req, res) => res.json({
    as_of: config.demoNow, reward_target: 10, order_form_url: config.orderFormUrl, demo_mode: true,
  } satisfies ConfigResponse));
  app.get('/api/menu', (_req, res) => res.json({ menu_items: read().menu_items } satisfies MenuResponse));
  app.get('/api/customers', (req, res) => {
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
  const stub: express.RequestHandler = (_req, res) => {
    res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Commit-0 stub: Dev 1 implements this mutation.' } } satisfies ApiError);
  };
  app.post('/api/hub/join', stub);
  app.post('/api/customers/:id/stamps', stub);
  app.post('/api/customers/:id/rewards/redeem', stub);
  app.post('/api/customers/:id/offers/draft', stub);
  app.patch('/api/offers/:id', stub);
  app.post('/api/offers/:id/approve', stub);
  app.post('/api/offers/:id/redeem', stub);
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found' } } satisfies ApiError));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const badJson = error?.type === 'entity.parse.failed';
    res.status(badJson ? 400 : 500).json({ error: {
      code: badJson ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message: badJson ? 'Invalid JSON body' : 'Unexpected server error',
    } } satisfies ApiError);
  };
  app.use(errors);
  return app;
}
