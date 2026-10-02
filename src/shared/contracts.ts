// GENERATED from docs/CONTRACTS.md. Do not edit directly.
export type ID = string;
export type ISODateTime = string;
export type Cents = number;
export type OfferStatus = 'draft' | 'approved' | 'redeemed';
export type OfferSource = 'ai' | 'cached';
export interface MenuItem {
  id: ID;
  name: string;
  price_cents: Cents;
}
export interface Customer {
  id: ID;
  name: string;
  phone: string;
  joined_at: ISODateTime;
  stamps: number;
}
export interface OrderItem {
  menu_item_id: ID;
  quantity: number;
  unit_price_cents: Cents;
}
export interface Order {
  id: ID;
  customer_id: ID;
  items: OrderItem[];
  total_cents: Cents;
  created_at: ISODateTime;
}
export type PreorderStatus = 'scheduled' | 'collected' | 'cancelled';
export interface Preorder extends Order {
  request_id: ID;
  pickup_name: string;
  pickup_at: ISODateTime;
  note: string;
  status: PreorderStatus;
  collected_at: ISODateTime | null;
}
export interface PreorderRequest {
  request_id: ID;
  pickup_name: string;
  pickup_at: ISODateTime;
  note: string;
  items: { menu_item_id: ID; quantity: number; }[];
}
export interface PreorderResponse { preorder: Preorder; }
export interface OrderEntry extends Order {
  customer_name: string;
  phone: string;
  pickup_name: string;
  pickup_at: ISODateTime;
  note: string;
  status: PreorderStatus;
  source: 'history' | 'order_ahead';
}
export interface OrderListResponse { orders: OrderEntry[]; as_of: ISODateTime; }
export interface Offer {
  id: ID;
  customer_id: ID;
  message: string;
  status: OfferStatus;
  source: OfferSource;
  created_at: ISODateTime;
}
export interface Database {
  menu_items: MenuItem[];
  customers: Customer[];
  orders: Order[];
  offers: Offer[];
  preorders?: Preorder[];
}
export interface CustomerSummary extends Customer {
  visits: number;
  favorite_item: MenuItem | null;
  last_visit: ISODateTime | null;
  total_spend_cents: Cents;
  usual_gap_days: number | null;
  days_since_last_visit: number | null;
  is_lapsed: boolean;
}
export interface CustomerListQuery {
  sort?: 'name' | 'visits' | 'favorite_item' | 'last_visit' | 'total_spend_cents';
  direction?: 'asc' | 'desc';
  lapsed?: 'true' | 'false';
}
export interface HealthResponse { ok: true; mode: 'scaffold' | 'ready'; }
export interface ConfigResponse {
  as_of: ISODateTime;
  reward_target: number;
  order_form_url: string | null;
  demo_mode: true;
}
export interface MenuResponse { menu_items: MenuItem[]; }
export interface CustomerListResponse { customers: CustomerSummary[]; as_of: ISODateTime; }
export interface CustomerDetailResponse { customer: CustomerSummary; orders: Order[]; offers: Offer[]; }
export interface HubResponse {
  customer: Customer;
  reward_target: number;
  order_form_url: string | null;
  offers: Offer[];
  preorders: Preorder[];
  as_of: ISODateTime;
}
export interface JoinRequest { phone: string; }
export interface JoinResponse { customer: Customer; created: boolean; }
export interface EmptyRequest {}
export interface StampResponse { customer: Customer; }
export interface RewardRedeemResponse { customer: Customer; redeemed: true; }
export interface OfferEditRequest { message: string; }
export interface OfferResponse { offer: Offer; }
export interface MetricsResponse {
  as_of: ISODateTime;
  returning_customer_rate: number;
  lapsed_regulars: number;
  offers_approved: number;
  offers_redeemed: number;
  revenue_at_risk_cents: Cents | null;
  revenue_recovered_cents: Cents | null;
}
export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'NOT_IMPLEMENTED' | 'INTERNAL_ERROR';
export interface ApiError { error: { code: ErrorCode; message: string; }; }
