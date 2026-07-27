import { pool } from '../pg-db';
import { uid } from './helpers';

/** Seed floor + starter menu when a hotel_restaurant tenant is onboarded.
 * Demo table names (T1–T12) are starters only — the hotel owner renames/adds/removes
 * freely in Menu → Tables; Floor and Waiter display whatever names they set. */
export async function seedHospitalityCatalog(tenantId: string): Promise<void> {
  const existing = await pool.query(`SELECT id FROM hosp_dining_tables WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
  if (existing.rows[0]) return;

  const tables: [string, number, string][] = [
    ['T1', 2, 'Window'],
    ['T2', 2, 'Window'],
    ['T3', 4, 'Main'],
    ['T4', 4, 'Main'],
    ['T5', 4, 'Main'],
    ['T6', 6, 'Main'],
    ['T7', 6, 'Garden'],
    ['T8', 8, 'Garden'],
    ['T9', 4, 'Garden'],
    ['T10', 2, 'Bar'],
    ['T11', 2, 'Bar'],
    ['T12', 4, 'Private'],
  ];
  for (const [name, seats, zone] of tables) {
    await pool.query(
      `INSERT INTO hosp_dining_tables (id, tenant_id, name, seats, zone, status)
       VALUES ($1,$2,$3,$4,$5,'available')`,
      [uid('ht'), tenantId, name, seats, zone],
    );
  }

  const catIds: Record<string, string> = {};
  for (const [name, sort] of [
    ['Starters', 1],
    ['Mains', 2],
    ['Breads', 3],
    ['Drinks', 4],
    ['Desserts', 5],
  ] as const) {
    const id = uid('hc');
    catIds[name] = id;
    await pool.query(`INSERT INTO hosp_menu_categories (id, tenant_id, name, sort_order) VALUES ($1,$2,$3,$4)`, [
      id,
      tenantId,
      name,
      sort,
    ]);
  }

  const itemIds: Record<string, string> = {};
  for (const [cat, name, desc, price] of [
    ['Starters', 'Paneer Tikka', 'Charred cottage cheese with mint chutney', 280],
    ['Starters', 'Veg Spring Rolls', 'Crispy rolls with sweet chili', 180],
    ['Starters', 'Chicken Wings', 'Spicy glazed wings', 320],
    ['Mains', 'Butter Chicken', 'Tomato-butter gravy', 380],
    ['Mains', 'Dal Makhani', 'Slow-cooked black lentils', 260],
    ['Mains', 'Veg Biryani', 'Fragrant basmati rice', 300],
    ['Mains', 'Margherita Pizza', 'Tomato, mozzarella, basil', 350],
    ['Breads', 'Butter Naan', 'Tandoor baked', 60],
    ['Breads', 'Garlic Naan', 'Garlic butter finish', 80],
    ['Drinks', 'Masala Chai', 'Spiced milk tea', 40],
    ['Drinks', 'Fresh Lime Soda', 'Sweet / salted', 70],
    ['Drinks', 'Mango Lassi', 'Sweet yogurt drink', 90],
    ['Desserts', 'Gulab Jamun', 'Warm milk dumplings', 120],
    ['Desserts', 'Brownie Sundae', 'Chocolate brownie + ice cream', 180],
  ] as const) {
    const id = uid('hi');
    itemIds[name] = id;
    await pool.query(
      `INSERT INTO hosp_menu_items (id, tenant_id, category_id, name, description, price)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, tenantId, catIds[cat], name, desc, price],
    );
  }

  const groupIds: Record<string, string> = {};
  for (const [name, required, maxSelect] of [
    ['Extra Toppings', false, 5],
    ['Spice Level', true, 1],
    ['Cheese', false, 2],
  ] as const) {
    const id = uid('hg');
    groupIds[name] = id;
    await pool.query(
      `INSERT INTO hosp_modifier_groups (id, tenant_id, name, required, max_select)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, tenantId, name, required, maxSelect],
    );
  }

  for (const [g, name, delta] of [
    ['Extra Toppings', 'Extra Paneer', 40],
    ['Extra Toppings', 'Mushrooms', 30],
    ['Extra Toppings', 'Jalapeños', 20],
    ['Extra Toppings', 'Olives', 25],
    ['Extra Toppings', 'Extra Chicken', 60],
    ['Spice Level', 'Mild', 0],
    ['Spice Level', 'Medium', 0],
    ['Spice Level', 'Extra Hot', 0],
    ['Cheese', 'Extra Cheese', 40],
    ['Cheese', 'No Cheese', 0],
  ] as const) {
    await pool.query(`INSERT INTO hosp_modifiers (id, group_id, name, price_delta) VALUES ($1,$2,$3,$4)`, [
      uid('hm'),
      groupIds[g],
      name,
      delta,
    ]);
  }

  const link = async (itemName: string, groupName: string) => {
    await pool.query(
      `INSERT INTO hosp_item_modifier_groups (menu_item_id, group_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [itemIds[itemName], groupIds[groupName]],
    );
  };
  for (const name of ['Butter Chicken', 'Dal Makhani', 'Chicken Wings', 'Veg Biryani']) {
    await link(name, 'Spice Level');
  }
  for (const name of ['Margherita Pizza', 'Paneer Tikka', 'Veg Spring Rolls']) {
    await link(name, 'Extra Toppings');
    await link(name, 'Cheese');
  }
  await link('Margherita Pizza', 'Spice Level');
}
