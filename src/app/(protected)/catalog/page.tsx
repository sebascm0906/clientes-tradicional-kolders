"use client";
import { useEffect, useState, useMemo } from "react";
import { useB2BCartStore } from "@/store/cart";
import { Search, Loader2, AlertCircle, ChevronDown, ShoppingCart } from "lucide-react";

interface CatalogItem {
  id: number;
  name: string;
  sku: string | null;
  price: number;
  tax_rate?: number;
  uom: string;
  boxSize: number;
  stock: number;
  warning: string;
  family_key: string;
  family_label: string;
  subgroup_key: string;
  subgroup_label: string;
  sort_order: number;
}

export default function Catalog() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeFamily, setActiveFamily] = useState<string>("ALL");
  const [collapsedSubgroups, setCollapsedSubgroups] = useState<Set<string>>(new Set());

  const [partner, setPartner] = useState<any>(null);

  const cartItems = useB2BCartStore(state => state.items);
  const addItem = useB2BCartStore(state => state.addItem);
  const setQty = useB2BCartStore(state => state.setQty);

  // Cargar catálogo una sola vez
  useEffect(() => {
    fetch('/api/account/profile')
      .then(res => res.json())
      .then(data => { if (!data.error) setPartner(data); })
      .catch(() => {});

    fetch('/api/catalog')
      .then(res => {
        if (!res.ok) throw new Error('Error del servidor');
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setItems(data);
          // Default: LAURITA para Canal Tradicional (si tiene productos)
          const hasLaurita = data.some((d: CatalogItem) => d.family_key === 'LAURITA');
          setActiveFamily(hasLaurita ? 'LAURITA' : 'ALL');
        } else {
          setItems([]);
          setError("No se pudieron cargar los productos.");
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setError("Error de conexion. Verifica tu red e intenta de nuevo.");
      });
  }, []);

  // Familias disponibles (derivadas de los datos)
  const families = useMemo(() => {
    const familyMap = new Map<string, { key: string; label: string; count: number; minOrder: number }>();
    items.forEach(item => {
      const existing = familyMap.get(item.family_key);
      if (existing) {
        existing.count++;
        existing.minOrder = Math.min(existing.minOrder, item.sort_order);
      } else {
        familyMap.set(item.family_key, { key: item.family_key, label: item.family_label, count: 1, minOrder: item.sort_order });
      }
    });
    return Array.from(familyMap.values()).sort((a, b) => a.minOrder - b.minOrder);
  }, [items]);

  // Filtrar por búsqueda y familia activa
  const filteredItems = useMemo(() => {
    let filtered = items;

    if (activeFamily !== 'ALL') {
      filtered = filtered.filter(item => item.family_key === activeFamily);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(q) ||
        (item.sku && item.sku.toLowerCase().includes(q))
      );
    }

    return filtered;
  }, [items, activeFamily, search]);

  // Agrupar por subgrupo
  const groupedItems = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; items: CatalogItem[]; minOrder: number }>();
    filteredItems.forEach(item => {
      const groupKey = `${item.family_key}__${item.subgroup_key}`;
      const existing = groups.get(groupKey);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(groupKey, { key: groupKey, label: item.subgroup_label, items: [item], minOrder: item.sort_order });
      }
    });
    return Array.from(groups.values()).sort((a, b) => a.minOrder - b.minOrder);
  }, [filteredItems]);

  const toggleSubgroup = (key: string) => {
    setCollapsedSubgroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleQtyChange = (product_id: number, e: any, itemConfig: CatalogItem) => {
    const rawQty = parseInt(e.target.value) || 0;
    const cartExists = cartItems.find(i => i.product_id === product_id);

    if (rawQty === 0 && cartExists) {
      useB2BCartStore.getState().removeItem(product_id);
    } else if (rawQty > 0) {
      if (!cartExists) {
        addItem({
          product_id: itemConfig.id,
          name: itemConfig.name,
          sku: itemConfig.sku || "",
          price: itemConfig.price,
          tax_rate: itemConfig.tax_rate || 0,
          uom_name: itemConfig.uom,
          qty: rawQty,
          qtyPerPage: itemConfig.boxSize
        });
      } else {
        setQty(product_id, rawQty);
      }
    }
  };

  const getCartQty = (id: number): string => {
    const item = cartItems.find(i => i.product_id === id);
    return item ? String(item.qty) : "";
  };

  const totalCartItems = cartItems.reduce((sum, i) => sum + i.qty, 0);

  return (
    <div className="min-h-screen bg-background pb-96">
      {/* Header */}
      <div className="bg-primary pt-10 pb-5 px-4 text-white shadow-md">
        <div className="flex justify-between items-center mb-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold font-display truncate">{partner?.name || 'Cargando...'}</h1>
          </div>
          <div className="text-right flex-shrink-0 ml-3">
            <p className="text-[10px] text-blue-200 uppercase font-bold tracking-wider">Disponible</p>
            <p className="font-extrabold text-lg">
              ${(partner ? (partner.credit_limit - partner.credit_used) : 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar producto o SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 bg-white rounded-lg pl-10 pr-4 text-sm text-foreground outline-none border-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {/* Familia tabs — sticky */}
      <div className="px-2 py-2.5 border-b border-border bg-white sticky top-0 z-20 flex gap-1.5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveFamily('ALL')}
          className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
            activeFamily === 'ALL' ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground'
          }`}
        >
          Todas
        </button>
        {families.map(f => (
          <button
            key={f.key}
            onClick={() => setActiveFamily(f.key)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
              activeFamily === f.key ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {f.label}
            <span className="ml-1 opacity-70">{f.count}</span>
          </button>
        ))}
      </div>

      {/* Contenido principal */}
      <main className="px-3 py-3">
        {loading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="animate-spin text-primary w-8 h-8" />
          </div>
        ) : error ? (
          <div className="text-center p-10 bg-white border border-danger/20 rounded-xl">
            <AlertCircle size={32} className="text-danger mx-auto mb-3" />
            <p className="text-danger text-sm font-bold mb-3">{error}</p>
            <button
              onClick={() => { setLoading(true); setError(""); window.location.reload(); }}
              className="text-primary text-sm font-bold underline"
            >
              Reintentar
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center p-10 text-muted-foreground text-sm">
            {search ? 'No se encontraron productos para esta busqueda.' : 'No hay productos disponibles.'}
          </div>
        ) : (
          <div className="space-y-4">
            {groupedItems.map(group => {
              const isCollapsed = collapsedSubgroups.has(group.key);
              const groupCartCount = group.items.reduce((sum, item) => {
                const cartItem = cartItems.find(ci => ci.product_id === item.id);
                return sum + (cartItem ? cartItem.qty : 0);
              }, 0);

              return (
                <div key={group.key} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                  {/* Subgroup header — clickable accordion */}
                  <button
                    onClick={() => toggleSubgroup(group.key)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-border hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-sm text-foreground">{group.label}</h2>
                      <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                        {group.items.length}
                      </span>
                      {groupCartCount > 0 && (
                        <span className="flex items-center gap-0.5 text-xs font-bold text-primary bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                          <ShoppingCart className="w-3 h-3" />
                          {groupCartCount}
                        </span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                  </button>

                  {/* Productos */}
                  {!isCollapsed && (
                    <div className="divide-y divide-border">
                      {group.items.map(item => {
                        const cartQty = getCartQty(item.id);
                        const inCart = cartQty !== "";

                        return (
                          <div
                            key={item.id}
                            className={`px-4 py-3 flex items-center gap-3 transition-colors ${inCart ? 'bg-blue-50/40' : ''}`}
                          >
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-sm text-foreground leading-tight line-clamp-2" title={item.name}>
                                {item.name}
                              </h3>
                              <div className="flex items-center gap-2 mt-1">
                                {item.sku && <span className="text-[10px] text-muted-foreground">SKU: {item.sku}</span>}
                                <span className="text-[10px] text-muted-foreground">{item.uom}</span>
                                {item.boxSize > 1 && (
                                  <span className="text-[10px] font-bold text-primary bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                    Caja: {item.boxSize}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="text-right flex-shrink-0">
                              <span className="font-extrabold text-foreground text-sm">${item.price.toFixed(2)}</span>
                            </div>

                            <div className="flex-shrink-0">
                              <input
                                type="number"
                                min="0"
                                value={cartQty}
                                onChange={(e) => handleQtyChange(item.id, e, item)}
                                placeholder="0"
                                className={`w-16 h-9 border rounded-lg text-center font-bold text-sm outline-none transition-colors ${
                                  inCart
                                    ? 'bg-primary/10 border-primary text-primary focus:ring-2 focus:ring-primary'
                                    : 'bg-secondary border-border text-foreground focus:ring-2 focus:ring-primary focus:border-primary'
                                }`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating cart indicator — above bottom navbar */}
      {totalCartItems > 0 && (
        <a
          href="/cart"
          className="fixed bottom-20 right-4 bg-primary text-white rounded-full px-5 py-3 shadow-lg flex items-center gap-2 z-30 hover:bg-primary/90 transition-colors"
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="font-bold text-sm">{totalCartItems} items</span>
          <span className="text-xs opacity-80">
            ${cartItems.reduce((sum, i) => sum + i.price * i.qty, 0).toFixed(2)}
          </span>
        </a>
      )}
    </div>
  );
}
