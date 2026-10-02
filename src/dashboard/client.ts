import { api } from '../shared/api';
import type {
  ConfigResponse, CustomerDetailResponse, CustomerListQuery, CustomerListResponse, MenuResponse,
  MetricsResponse, OfferEditRequest, OfferResponse, StampResponse,
} from '../shared/contracts';
import { createMockClient } from './mock';

// Thin dashboard-side adapter over the shared transport. Every call uses the relative /api
// contract from CONTRACTS.md. The only alternative is the explicit, branch-local ?mock=1 adapter.
export interface DashboardClient {
  config(): Promise<ConfigResponse>;
  menu(): Promise<MenuResponse>;
  customers(query: CustomerListQuery): Promise<CustomerListResponse>;
  customer(id: string): Promise<CustomerDetailResponse>;
  metrics(): Promise<MetricsResponse>;
  addStamp(customerId: string): Promise<StampResponse>;
  draftOffer(customerId: string): Promise<OfferResponse>;
  saveOffer(offerId: string, message: string): Promise<OfferResponse>;
  approveOffer(offerId: string): Promise<OfferResponse>;
}

function toQuery(query: CustomerListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : '';
}

const empty = { method: 'POST', body: '{}' } as const;
const segment = (id: string) => encodeURIComponent(id);

export const realClient: DashboardClient = {
  config: () => api('/config'),
  menu: () => api('/menu'),
  customers: query => api(`/customers${toQuery(query)}`),
  customer: id => api(`/customers/${segment(id)}`),
  metrics: () => api('/metrics'),
  addStamp: id => api(`/customers/${segment(id)}/stamps`, empty),
  draftOffer: id => api(`/customers/${segment(id)}/offers/draft`, empty),
  saveOffer: (id, message) => api(`/offers/${segment(id)}`, {
    method: 'PATCH', body: JSON.stringify({ message } satisfies OfferEditRequest),
  }),
  approveOffer: id => api(`/offers/${segment(id)}/approve`, empty),
};

/** Mock mode is never on by default; it needs an explicit ?mock=1 in the URL. */
export const isMockMode = new URLSearchParams(window.location.search).get('mock') === '1';

export const client: DashboardClient = isMockMode ? createMockClient(realClient) : realClient;
