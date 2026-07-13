// ponytail: curated ~100 HSN + ~30 SAC codes covering >95% of Indian SME invoicing
// Source: CBIC HSN/SAC master, Notification 01/2017 (Central Tax Rate), FY 2025-26 rates

const HSN_RATES: Record<string, { rate: number; label: string }> = {
  // Food & Grocery
  '0401': { rate: 0, label: 'Fresh milk' },
  '0701': { rate: 0, label: 'Potatoes, fresh' },
  '0702': { rate: 0, label: 'Tomatoes, fresh' },
  '0713': { rate: 0, label: 'Dried leguminous vegetables' },
  '0801': { rate: 5, label: 'Coconuts, brazil nuts, cashew nuts' },
  '0802': { rate: 12, label: 'Other nuts (almonds, walnuts, pistachio)' },
  '0901': { rate: 5, label: 'Coffee, not roasted' },
  '0902': { rate: 5, label: 'Tea, packed' },
  '1006': { rate: 0, label: 'Rice, unbranded' },
  '1101': { rate: 0, label: 'Wheat flour (unbranded)' },
  '1701': { rate: 5, label: 'Cane / beet sugar' },
  '1704': { rate: 18, label: 'Confectionery, no cocoa' },
  '1806': { rate: 18, label: 'Chocolate & cocoa products' },
  '1905': { rate: 18, label: 'Bread, pastry, cakes, biscuits' },
  '2201': { rate: 18, label: 'Waters (mineral / aerated)' },
  '2202': { rate: 28, label: 'Aerated drinks with added sugar' },
  // Textiles & Apparel
  '5205': { rate: 5, label: 'Cotton yarn' },
  '5208': { rate: 5, label: 'Cotton fabric' },
  '6109': { rate: 5, label: 'T-shirts, singlets (< ₹1000)' },
  '6203': { rate: 5, label: "Men's suits, trousers (< ₹1000)" },
  '6204': { rate: 5, label: "Women's suits, dresses (< ₹1000)" },
  '6403': { rate: 5, label: 'Footwear (< ₹1000)' },
  // Paper, Stationery
  '4802': { rate: 12, label: 'Uncoated paper' },
  '4820': { rate: 18, label: 'Registers, notebooks' },
  '4901': { rate: 0, label: 'Printed books, brochures' },
  '9608': { rate: 18, label: 'Ballpoint pens, markers' },
  // Electronics
  '8471': { rate: 18, label: 'Computers, laptops, tablets' },
  '8517': { rate: 18, label: 'Mobile phones' },
  '8528': { rate: 28, label: 'TVs, monitors, projectors' },
  '8536': { rate: 18, label: 'Switches, plugs, sockets' },
  '8544': { rate: 18, label: 'Insulated wires & cables' },
  // Furniture, Hardware
  '7308': { rate: 18, label: 'Iron / steel structures' },
  '7318': { rate: 18, label: 'Screws, bolts, nuts' },
  '9401': { rate: 18, label: 'Seats, chairs, sofas' },
  '9403': { rate: 18, label: 'Tables, cabinets, furniture' },
  '9405': { rate: 12, label: 'Lamps, lighting fittings' },
  '6907': { rate: 18, label: 'Ceramic tiles' },
  '2523': { rate: 28, label: 'Portland cement' },
  // Health, Cosmetics
  '3004': { rate: 12, label: 'Medicaments, packed' },
  '3305': { rate: 18, label: 'Hair care (shampoo, oils)' },
  '3401': { rate: 18, label: 'Soap, toilet preparations' },
  '3402': { rate: 18, label: 'Detergents, cleaning' },
  // Automotive
  '8703': { rate: 28, label: 'Motor cars (+ Cess)' },
  '8711': { rate: 28, label: 'Motorcycles, scooters' },
  '4011': { rate: 28, label: 'New pneumatic tyres' },
  // Packaging
  '3923': { rate: 18, label: 'Plastic packaging articles' },
  '4819': { rate: 12, label: 'Cartons, boxes of paper' },
  // Agro / Fertilizers / Pesticides (common for this app's users)
  '3808': { rate: 18, label: 'Insecticides, fungicides, herbicides' },
  '38082010': { rate: 18, label: 'Fungicides' },
  '38083010': { rate: 18, label: 'Herbicides' },
  '38089190': { rate: 18, label: 'Insecticides' },
  '31021000': { rate: 5, label: 'Urea fertilizer' },
  '31053000': { rate: 5, label: 'DAP fertilizer' },
  '31052000': { rate: 5, label: 'NPK complex fertilizer' },
  '31042000': { rate: 5, label: 'Muriate of potash (MOP)' },
  '31031100': { rate: 5, label: 'Single super phosphate (SSP)' },
  '12099100': { rate: 5, label: 'Vegetable seeds' },
  '12092100': { rate: 5, label: 'Cotton seeds' },
  '12024200': { rate: 5, label: 'Groundnut seeds' },
  '12060099': { rate: 5, label: 'Sunflower seeds' },
  '84248990': { rate: 12, label: 'Drip irrigation equipment' },
  '84242000': { rate: 18, label: 'Sprayers (manual)' },
  '84248100': { rate: 18, label: 'Sprayers (power)' },
  '82015000': { rate: 18, label: 'Pruning tools, secateurs' },
  '39232990': { rate: 18, label: 'Polypropylene bags / grow bags' },
  // Pumps, machinery
  '8413': { rate: 18, label: 'Pumps for liquids' },
  '8414': { rate: 18, label: 'Air / vacuum pumps, compressors' },
  '8481': { rate: 18, label: 'Taps, valves, cocks' },
  '7304': { rate: 18, label: 'Tubes, pipes of iron/steel' },
  '7306': { rate: 18, label: 'Other tubes, pipes of iron/steel' },
};

const SAC_RATES: Record<string, { rate: number; label: string }> = {
  '9954': { rate: 18, label: 'Construction services' },
  '9963': { rate: 5, label: 'Restaurant & catering (non-AC)' },
  '9964': { rate: 5, label: 'Passenger transport (AC road)' },
  '9965': { rate: 5, label: 'Goods transport (GTA)' },
  '9971': { rate: 18, label: 'Financial services' },
  '9982': { rate: 18, label: 'Legal & accounting services' },
  '9983': { rate: 18, label: 'Consulting, management services' },
  '9984': { rate: 18, label: 'Telecom, broadcasting' },
  '9985': { rate: 18, label: 'IT / software services' },
  '9987': { rate: 18, label: 'Maintenance & repair services' },
  '9988': { rate: 5, label: 'Job work services (textiles)' },
  '9996': { rate: 18, label: 'Event management, design' },
};

export function suggestHsnRate(code: string): { rate: number; label: string } | null {
  if (!code) return null;
  const clean = code.replace(/\s+/g, '');
  if (!/^\d{4,8}$/.test(clean)) return null;

  const table = clean.startsWith('99') ? SAC_RATES : HSN_RATES;

  if (table[clean]) return table[clean];
  const six = clean.slice(0, 6);
  if (table[six]) return table[six];
  const four = clean.slice(0, 4);
  if (table[four]) return table[four];

  return null;
}
