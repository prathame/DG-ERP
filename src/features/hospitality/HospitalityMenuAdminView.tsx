import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { compareHospTablesByZoneThenName, hospApi, type HospMenuItem, type HospTable } from './hospApi';
import {
  useHospShell,
  hospPageClass,
  hospEyebrowClass,
  hospTitleClass,
  hospSubClass,
  hospCardClass,
  hospPrimaryBtn,
  hospSecondaryBtn,
  hospDangerBtn,
  hospInputClass,
  hospChipActive,
  hospChipIdle,
} from './hospUi';
import { cn } from '../../lib/utils';

type AdminTab = 'menu' | 'modifiers' | 'tables';

type Category = { id: string; name: string; sort_order: number };
type ModGroup = {
  id: string;
  name: string;
  required: boolean;
  max_select: number;
  modifiers: Array<{ id: string; name: string; price_delta: number }>;
};

export function HospitalityMenuAdminView() {
  const shell = useHospShell();
  const { toast } = useToast();
  const [tab, setTab] = useState<AdminTab>('menu');
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<HospMenuItem[]>([]);
  const [tables, setTables] = useState<HospTable[]>([]);
  const [groups, setGroups] = useState<ModGroup[]>([]);
  const [activeCat, setActiveCat] = useState<string | 'all'>('all');
  const [confirm, setConfirm] = useState<{ title: string; message: string; onYes: () => void } | null>(null);

  const [itemForm, setItemForm] = useState<{
    id?: string;
    name: string;
    categoryId: string;
    price: string;
    memberPrice: string;
    description: string;
    available: boolean;
    modifierGroupIds: string[];
  } | null>(null);
  const [catForm, setCatForm] = useState<{ id?: string; name: string; sortOrder: string } | null>(null);
  const [tableForm, setTableForm] = useState<{ id?: string; name: string; seats: string; zone: string } | null>(null);
  const [groupForm, setGroupForm] = useState<{
    id?: string;
    name: string;
    required: boolean;
    maxSelect: string;
  } | null>(null);
  const [modForm, setModForm] = useState<{
    groupId: string;
    id?: string;
    name: string;
    priceDelta: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [menu, cats, tbl, mods] = await Promise.all([
        hospApi.menu(),
        hospApi.categories(),
        hospApi.tables(),
        hospApi.modifierGroups(),
      ]);
      setItems(menu.items);
      setCategories(cats.categories);
      setTables(tbl.tables);
      setGroups(mods.groups as ModGroup[]);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load menu', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = useMemo(
    () => (activeCat === 'all' ? items : items.filter(i => i.category_id === activeCat)),
    [items, activeCat],
  );

  const sortedTables = useMemo(() => [...tables].sort(compareHospTablesByZoneThenName), [tables]);

  const catName = (id: string) => categories.find(c => c.id === id)?.name || '—';

  return (
    <div className={hospPageClass(shell)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={hospEyebrowClass(shell)}>Hospitality</p>
          <h1 className={hospTitleClass(shell)}>Menu</h1>
          <p className={hospSubClass(shell)}>
            Restaurant catalog — dishes, prices, toppings, and floor tables (hotel owner sets numbering)
          </p>
        </div>
        <button type="button" className={hospSecondaryBtn(shell)} onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className="mr-1.5" />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'menu' as const, label: 'Dishes' },
            { id: 'modifiers' as const, label: 'Modifiers' },
            { id: 'tables' as const, label: 'Tables' },
          ] as const
        ).map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={tab === t.id ? hospChipActive(shell) : hospChipIdle(shell)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={cn(hospCardClass(shell), 'p-8 text-center text-sm opacity-60')}>Loading catalog…</div>
      ) : (
        <>
          {tab === 'menu' && (
            <div className={cn('grid gap-4', shell === 'capGlass' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-12')}>
              {/* Category rail */}
              <aside className={cn(hospCardClass(shell), 'p-3 md:col-span-3 space-y-1')}>
                <div className="flex justify-between items-center mb-2 px-1">
                  <h2 className="text-xs font-bold uppercase tracking-wide opacity-60">Categories</h2>
                  <button
                    type="button"
                    className={hospSecondaryBtn(shell)}
                    onClick={() => setCatForm({ name: '', sortOrder: String(categories.length) })}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCat('all')}
                  className={cn(
                    'w-full text-left rounded-xl px-3 py-2 text-sm font-semibold',
                    activeCat === 'all' ? 'bg-[var(--dg-primary)]/15 text-[var(--dg-primary)]' : 'hover:bg-black/5',
                  )}
                >
                  All dishes
                </button>
                {categories.map(c => (
                  <div key={c.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setActiveCat(c.id)}
                      className={cn(
                        'flex-1 text-left rounded-xl px-3 py-2 text-sm font-semibold',
                        activeCat === c.id ? 'bg-[var(--dg-primary)]/15 text-[var(--dg-primary)]' : 'hover:bg-black/5',
                      )}
                    >
                      {c.name}
                    </button>
                    <button
                      type="button"
                      className="p-1.5 opacity-40 hover:opacity-100"
                      onClick={() => setCatForm({ id: c.id, name: c.name, sortOrder: String(c.sort_order ?? 0) })}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 opacity-40 hover:opacity-100 text-rose-600"
                      onClick={() =>
                        setConfirm({
                          title: 'Delete category?',
                          message: `Delete “${c.name}” and its items?`,
                          onYes: () => {
                            void hospApi
                              .deleteCategory(c.id)
                              .then(() => {
                                toast('Category deleted', 'success');
                                void load();
                              })
                              .catch(e => toast(e instanceof Error ? e.message : 'Delete failed', 'error'));
                          },
                        })
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {!categories.length && (
                  <p className="text-xs opacity-50 px-2 py-4">Add a category to start building the menu.</p>
                )}
              </aside>

              {/* Dish cards */}
              <section className="md:col-span-9 space-y-3">
                <div className="flex justify-between items-center gap-2">
                  <h2 className="font-bold text-sm">
                    {activeCat === 'all' ? 'All dishes' : catName(activeCat)}
                    <span className="font-normal opacity-50 ml-2">{visibleItems.length}</span>
                  </h2>
                  <button
                    type="button"
                    className={hospPrimaryBtn(shell)}
                    disabled={!categories.length}
                    onClick={() =>
                      setItemForm({
                        name: '',
                        categoryId: activeCat !== 'all' ? activeCat : categories[0]?.id || '',
                        price: '',
                        memberPrice: '',
                        description: '',
                        available: true,
                        modifierGroupIds: [],
                      })
                    }
                  >
                    <Plus size={14} className="mr-1" /> Add dish
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {visibleItems.map(it => (
                    <article key={it.id} className={cn(hospCardClass(shell), 'p-4 flex flex-col gap-2')}>
                      <div className="flex justify-between gap-2 items-start">
                        <div>
                          <h3 className="font-bold text-sm leading-snug">{it.name}</h3>
                          <p className={cn('text-xs', hospSubClass(shell))}>{catName(it.category_id)}</p>
                        </div>
                        <p className="text-base font-bold shrink-0">₹{Number(it.price).toLocaleString('en-IN')}</p>
                      </div>
                      {it.description && (
                        <p className={cn('text-xs line-clamp-2', hospSubClass(shell))}>{it.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                        {!it.available && (
                          <span className="text-[10px] font-bold uppercase tracking-wide rounded-md px-1.5 py-0.5 bg-rose-100 text-rose-700">
                            Off menu
                          </span>
                        )}
                        {(it.modifierGroups?.length ?? 0) > 0 && (
                          <span className="text-[10px] font-bold uppercase tracking-wide rounded-md px-1.5 py-0.5 bg-black/5 opacity-70">
                            {it.modifierGroups.length} mod
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          className={cn(hospSecondaryBtn(shell), 'flex-1')}
                          onClick={() =>
                            setItemForm({
                              id: it.id,
                              name: it.name,
                              categoryId: it.category_id,
                              price: String(it.price),
                              memberPrice: it.member_price != null ? String(it.member_price) : '',
                              description: it.description || '',
                              available: it.available !== false,
                              modifierGroupIds: (it.modifierGroups || []).map(g => g.id),
                            })
                          }
                        >
                          <Pencil size={14} className="mr-1" /> Edit
                        </button>
                        <button
                          type="button"
                          className={hospDangerBtn(shell)}
                          onClick={() =>
                            setConfirm({
                              title: 'Delete dish?',
                              message: `Remove “${it.name}” from the menu?`,
                              onYes: () => {
                                void hospApi
                                  .deleteMenuItem(it.id)
                                  .then(() => {
                                    toast('Dish deleted', 'success');
                                    void load();
                                  })
                                  .catch(e => toast(e instanceof Error ? e.message : 'Delete failed', 'error'));
                              },
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {!visibleItems.length && (
                  <div className={cn(hospCardClass(shell), 'p-10 text-center text-sm opacity-50')}>
                    No dishes here yet
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === 'modifiers' && (
            <section className={cn(hospCardClass(shell), 'p-4 space-y-4')}>
              <div className="flex justify-between items-center">
                <h2 className="font-bold text-sm">Modifier groups</h2>
                <button
                  type="button"
                  className={hospPrimaryBtn(shell)}
                  onClick={() => setGroupForm({ name: '', required: false, maxSelect: '3' })}
                >
                  <Plus size={14} className="mr-1" /> Add group
                </button>
              </div>
              {groups.map(g => (
                <div key={g.id} className="rounded-xl border border-black/5 p-3 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-semibold text-sm">{g.name}</p>
                      <p className="text-xs opacity-50">
                        {g.required ? 'Required' : 'Optional'} · max {g.max_select}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={hospSecondaryBtn(shell)}
                        onClick={() =>
                          setGroupForm({
                            id: g.id,
                            name: g.name,
                            required: !!g.required,
                            maxSelect: String(g.max_select),
                          })
                        }
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className={hospSecondaryBtn(shell)}
                        onClick={() => setModForm({ groupId: g.id, name: '', priceDelta: '0' })}
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        type="button"
                        className={hospDangerBtn(shell)}
                        onClick={() =>
                          setConfirm({
                            title: 'Delete group?',
                            message: `Remove “${g.name}”?`,
                            onYes: () => {
                              void hospApi
                                .deleteModifierGroup(g.id)
                                .then(() => {
                                  toast('Group deleted', 'success');
                                  void load();
                                })
                                .catch(e => toast(e instanceof Error ? e.message : 'Delete failed', 'error'));
                            },
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <ul className="pl-2 space-y-1">
                    {(g.modifiers || []).map(m => (
                      <li key={m.id} className="flex justify-between text-sm items-center gap-2">
                        <span>
                          {m.name}{' '}
                          <span className="opacity-50">
                            {Number(m.price_delta) >= 0 ? '+' : ''}₹{Number(m.price_delta).toLocaleString('en-IN')}
                          </span>
                        </span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className={hospSecondaryBtn(shell)}
                            onClick={() =>
                              setModForm({
                                groupId: g.id,
                                id: m.id,
                                name: m.name,
                                priceDelta: String(m.price_delta),
                              })
                            }
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            className={hospDangerBtn(shell)}
                            onClick={() =>
                              setConfirm({
                                title: 'Delete option?',
                                message: `Remove “${m.name}”?`,
                                onYes: () => {
                                  void hospApi
                                    .deleteModifier(m.id)
                                    .then(() => {
                                      toast('Option deleted', 'success');
                                      void load();
                                    })
                                    .catch(e => toast(e instanceof Error ? e.message : 'Delete failed', 'error'));
                                },
                              })
                            }
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {!groups.length && <p className="text-sm opacity-50 text-center py-6">No modifier groups yet</p>}
            </section>
          )}

          {tab === 'tables' && (
            <section className={cn(hospCardClass(shell), 'p-4 space-y-4')}>
              <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                  <h2 className="font-bold text-sm">Dining tables</h2>
                  <p className={cn('text-xs mt-1 max-w-md', hospSubClass(shell))}>
                    Hotel owner sets each table’s name/number, seats, and zone. Floor and Waiter show these exactly —
                    use any scheme (T1, A1, Window-1, Garden-2). Rename, add, or remove anytime.
                  </p>
                </div>
                <button
                  type="button"
                  className={hospPrimaryBtn(shell)}
                  onClick={() => setTableForm({ name: '', seats: '4', zone: 'Main' })}
                >
                  <Plus size={14} className="mr-1" /> Add table
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {sortedTables.map(t => (
                  <article key={t.id} className={cn(hospCardClass(shell), 'p-3 space-y-2')}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-sm">{t.name}</p>
                        <p className={cn('text-xs', hospSubClass(shell))}>
                          {t.zone} · {t.seats} seats
                        </p>
                      </div>
                      <span className="text-[10px] font-bold uppercase opacity-50">{t.status}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={cn(hospSecondaryBtn(shell), 'flex-1')}
                        onClick={() =>
                          setTableForm({
                            id: t.id,
                            name: t.name,
                            seats: String(t.seats),
                            zone: t.zone || 'Main',
                          })
                        }
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className={hospDangerBtn(shell)}
                        onClick={() =>
                          setConfirm({
                            title: 'Delete table?',
                            message: `Remove “${t.name}”?`,
                            onYes: () => {
                              void hospApi
                                .deleteTable(t.id)
                                .then(() => {
                                  toast('Table deleted', 'success');
                                  void load();
                                })
                                .catch(e => toast(e instanceof Error ? e.message : 'Delete failed', 'error'));
                            },
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!tables.length && (
                <div className="text-center py-8 space-y-1">
                  <p className="text-sm font-semibold opacity-70">No tables yet</p>
                  <p className={cn('text-xs max-w-sm mx-auto', hospSubClass(shell))}>
                    Add tables with your own numbers (e.g. T1, Garden-2). Seed demo data only creates starters — the
                    hotel owner can rename or replace them freely.
                  </p>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {itemForm && (
        <Modal title={itemForm.id ? 'Edit dish' : 'Add dish'} onClose={() => setItemForm(null)}>
          <label className="block text-xs font-bold opacity-60 mb-1">Name</label>
          <input
            className={hospInputClass(shell)}
            value={itemForm.name}
            onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
          />
          <label className="block text-xs font-bold opacity-60 mb-1 mt-3">Category</label>
          <select
            className={hospInputClass(shell)}
            value={itemForm.categoryId}
            onChange={e => setItemForm({ ...itemForm, categoryId: e.target.value })}
          >
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="block text-xs font-bold opacity-60 mb-1 mt-3">Price (₹)</label>
          <input
            className={hospInputClass(shell)}
            inputMode="decimal"
            value={itemForm.price}
            onChange={e => setItemForm({ ...itemForm, price: e.target.value })}
          />
          <label className="block text-xs font-bold opacity-60 mb-1 mt-3">Member price (₹, optional)</label>
          <input
            className={hospInputClass(shell)}
            inputMode="decimal"
            value={itemForm.memberPrice}
            onChange={e => setItemForm({ ...itemForm, memberPrice: e.target.value })}
            placeholder="Leave blank to use plan % off"
          />
          <label className="block text-xs font-bold opacity-60 mb-1 mt-3">Description</label>
          <input
            className={hospInputClass(shell)}
            value={itemForm.description}
            onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
          />
          <label className="flex items-center gap-2 mt-3 text-sm">
            <input
              type="checkbox"
              checked={itemForm.available}
              onChange={e => setItemForm({ ...itemForm, available: e.target.checked })}
            />
            Available on menu
          </label>
          {groups.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-bold opacity-60 mb-2">Modifier groups</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {groups.map(g => (
                  <label key={g.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={itemForm.modifierGroupIds.includes(g.id)}
                      onChange={e => {
                        const ids = e.target.checked
                          ? [...itemForm.modifierGroupIds, g.id]
                          : itemForm.modifierGroupIds.filter(x => x !== g.id);
                        setItemForm({ ...itemForm, modifierGroupIds: ids });
                      }}
                    />
                    {g.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            className={cn(hospPrimaryBtn(shell), 'w-full mt-4')}
            onClick={() => {
              const price = Number(itemForm.price);
              if (!itemForm.name.trim() || !itemForm.categoryId || !Number.isFinite(price) || price < 0) {
                toast('Name, category, and valid price are required', 'error');
                return;
              }
              const memberPriceRaw = itemForm.memberPrice.trim();
              const memberPrice =
                memberPriceRaw === '' ? null : Number(memberPriceRaw);
              if (memberPrice != null && (!Number.isFinite(memberPrice) || memberPrice < 0)) {
                toast('Member price must be a valid amount', 'error');
                return;
              }
              const body = {
                name: itemForm.name.trim(),
                categoryId: itemForm.categoryId,
                price,
                memberPrice,
                description: itemForm.description,
                available: itemForm.available,
                modifierGroupIds: itemForm.modifierGroupIds,
              };
              void (itemForm.id ? hospApi.updateMenuItem(itemForm.id, body) : hospApi.createMenuItem(body))
                .then(() => {
                  toast(itemForm.id ? 'Dish updated' : 'Dish added', 'success');
                  setItemForm(null);
                  void load();
                })
                .catch(e => toast(e instanceof Error ? e.message : 'Save failed', 'error'));
            }}
          >
            Save
          </button>
        </Modal>
      )}

      {catForm && (
        <Modal title={catForm.id ? 'Edit category' : 'Add category'} onClose={() => setCatForm(null)}>
          <label className="block text-xs font-bold opacity-60 mb-1">Name</label>
          <input
            className={hospInputClass(shell)}
            value={catForm.name}
            onChange={e => setCatForm({ ...catForm, name: e.target.value })}
          />
          <label className="block text-xs font-bold opacity-60 mb-1 mt-3">Sort order</label>
          <input
            className={hospInputClass(shell)}
            inputMode="numeric"
            value={catForm.sortOrder}
            onChange={e => setCatForm({ ...catForm, sortOrder: e.target.value })}
          />
          <button
            type="button"
            className={cn(hospPrimaryBtn(shell), 'w-full mt-4')}
            onClick={() => {
              if (!catForm.name.trim()) {
                toast('Name required', 'error');
                return;
              }
              const body = { name: catForm.name.trim(), sortOrder: Number(catForm.sortOrder) || 0 };
              void (catForm.id ? hospApi.updateCategory(catForm.id, body) : hospApi.createCategory(body))
                .then(() => {
                  toast(catForm.id ? 'Category updated' : 'Category added', 'success');
                  setCatForm(null);
                  void load();
                })
                .catch(e => toast(e instanceof Error ? e.message : 'Save failed', 'error'));
            }}
          >
            Save
          </button>
        </Modal>
      )}

      {tableForm && (
        <Modal title={tableForm.id ? 'Edit table' : 'Add table'} onClose={() => setTableForm(null)}>
          <label className="block text-xs font-bold opacity-60 mb-1">Name / number</label>
          <input
            className={hospInputClass(shell)}
            value={tableForm.name}
            onChange={e => setTableForm({ ...tableForm, name: e.target.value })}
            placeholder="e.g. T1, A1, Window-1"
          />
          <p className="text-[11px] opacity-50 mt-1">Shown on Floor and Waiter as typed — any numbering scheme.</p>
          <label className="block text-xs font-bold opacity-60 mb-1 mt-3">Seats</label>
          <input
            className={hospInputClass(shell)}
            inputMode="numeric"
            value={tableForm.seats}
            onChange={e => setTableForm({ ...tableForm, seats: e.target.value })}
          />
          <label className="block text-xs font-bold opacity-60 mb-1 mt-3">Zone</label>
          <input
            className={hospInputClass(shell)}
            value={tableForm.zone}
            onChange={e => setTableForm({ ...tableForm, zone: e.target.value })}
            placeholder="e.g. Main, Garden, Bar"
          />
          <button
            type="button"
            className={cn(hospPrimaryBtn(shell), 'w-full mt-4')}
            onClick={() => {
              if (!tableForm.name.trim()) {
                toast('Name required', 'error');
                return;
              }
              const body = {
                name: tableForm.name.trim(),
                seats: Number(tableForm.seats) || 4,
                zone: tableForm.zone.trim() || 'Main',
              };
              void (tableForm.id ? hospApi.updateTable(tableForm.id, body) : hospApi.createTable(body))
                .then(() => {
                  toast(tableForm.id ? 'Table updated' : 'Table added', 'success');
                  setTableForm(null);
                  void load();
                })
                .catch(e => toast(e instanceof Error ? e.message : 'Save failed', 'error'));
            }}
          >
            Save
          </button>
        </Modal>
      )}

      {groupForm && (
        <Modal title={groupForm.id ? 'Edit group' : 'Add modifier group'} onClose={() => setGroupForm(null)}>
          <label className="block text-xs font-bold opacity-60 mb-1">Name</label>
          <input
            className={hospInputClass(shell)}
            value={groupForm.name}
            onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
          />
          <label className="block text-xs font-bold opacity-60 mb-1 mt-3">Max select</label>
          <input
            className={hospInputClass(shell)}
            inputMode="numeric"
            value={groupForm.maxSelect}
            onChange={e => setGroupForm({ ...groupForm, maxSelect: e.target.value })}
          />
          <label className="flex items-center gap-2 mt-3 text-sm">
            <input
              type="checkbox"
              checked={groupForm.required}
              onChange={e => setGroupForm({ ...groupForm, required: e.target.checked })}
            />
            Required
          </label>
          <button
            type="button"
            className={cn(hospPrimaryBtn(shell), 'w-full mt-4')}
            onClick={() => {
              if (!groupForm.name.trim()) {
                toast('Name required', 'error');
                return;
              }
              const body = {
                name: groupForm.name.trim(),
                required: groupForm.required,
                maxSelect: Number(groupForm.maxSelect) || 3,
              };
              void (groupForm.id ? hospApi.updateModifierGroup(groupForm.id, body) : hospApi.createModifierGroup(body))
                .then(() => {
                  toast(groupForm.id ? 'Group updated' : 'Group added', 'success');
                  setGroupForm(null);
                  void load();
                })
                .catch(e => toast(e instanceof Error ? e.message : 'Save failed', 'error'));
            }}
          >
            Save
          </button>
        </Modal>
      )}

      {modForm && (
        <Modal title={modForm.id ? 'Edit option' : 'Add option'} onClose={() => setModForm(null)}>
          <label className="block text-xs font-bold opacity-60 mb-1">Name</label>
          <input
            className={hospInputClass(shell)}
            value={modForm.name}
            onChange={e => setModForm({ ...modForm, name: e.target.value })}
          />
          <label className="block text-xs font-bold opacity-60 mb-1 mt-3">Price delta (₹)</label>
          <input
            className={hospInputClass(shell)}
            inputMode="decimal"
            value={modForm.priceDelta}
            onChange={e => setModForm({ ...modForm, priceDelta: e.target.value })}
          />
          <button
            type="button"
            className={cn(hospPrimaryBtn(shell), 'w-full mt-4')}
            onClick={() => {
              if (!modForm.name.trim()) {
                toast('Name required', 'error');
                return;
              }
              const body = { name: modForm.name.trim(), priceDelta: Number(modForm.priceDelta) || 0 };
              void (
                modForm.id ? hospApi.updateModifier(modForm.id, body) : hospApi.createModifier(modForm.groupId, body)
              )
                .then(() => {
                  toast(modForm.id ? 'Option updated' : 'Option added', 'success');
                  setModForm(null);
                  void load();
                })
                .catch(e => toast(e instanceof Error ? e.message : 'Save failed', 'error'));
            }}
          >
            Save
          </button>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            confirm.onYes();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1a1d21] rounded-2xl shadow-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-base">{title}</h3>
          <button type="button" className="text-sm opacity-50 hover:opacity-100" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
