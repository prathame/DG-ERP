/**
 * Sample electrician catalog + clients for Offline Mobile QA / first-run demo.
 * Keep in sync with samples/electrician-price-list.csv
 */

export type DemoClient = {
  name: string;
  phone: string;
  address: string;
};

export type DemoPriceItem = {
  productName: string;
  price: number;
  ruleName?: string;
  minQty?: number;
};

/** Sample clients (Masters → Clients). */
export const ELECTRICIAN_DEMO_CLIENTS: DemoClient[] = [
  { name: 'Sharma Residence', phone: '9876543210', address: '12 Green Park, Delhi' },
  { name: 'Patel Apartments', phone: '9876501234', address: '45 MG Road, Pune' },
  { name: 'City Cafe', phone: '9123456780', address: '8 Market Lane, Jaipur' },
];

/** Catalog rates (Masters → Prices). Same rows as samples/electrician-price-list.csv */
export const ELECTRICIAN_DEMO_PRICE_ITEMS: DemoPriceItem[] = [
  { productName: 'Ceiling fan installation', price: 499 },
  { productName: 'Ceiling fan repair', price: 299 },
  { productName: 'Tube light / LED fitting', price: 199 },
  { productName: 'Switch board repair', price: 249 },
  { productName: 'New switch point wiring', price: 349 },
  { productName: 'MCB replacement', price: 399 },
  { productName: 'DB / distribution board wiring', price: 1499 },
  { productName: 'Earthing check & fix', price: 799 },
  { productName: 'Inverter wiring', price: 999 },
  { productName: 'AC point wiring', price: 699 },
  { productName: 'Geyser installation', price: 899 },
  { productName: 'Full house wiring inspection', price: 1499 },
  { productName: 'Emergency call-out (visit)', price: 299 },
  { productName: 'Extra wire per metre', price: 25 },
];
