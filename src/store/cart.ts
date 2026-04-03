"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface B2BCartItem {
  product_id: number;
  name: string;
  sku: string;
  price: number;
  uom_name: string;
  qty: number;
  qtyPerPage: number;
  note?: string; // B2B Specific Instructions
}

interface CartState {
  items: B2BCartItem[];
  addItem: (item: B2BCartItem) => void;
  removeItem: (product_id: number) => void;
  setQty: (product_id: number, qty: number) => void;
  setNote: (product_id: number, note: string) => void;
  clearCart: () => void;
  getTotal: () => number;
  getTotalItems: () => number;
}

export const useB2BCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (newItem) => {
        set((state) => {
          const existing = state.items.find((i) => i.product_id === newItem.product_id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.product_id === newItem.product_id ? { ...i, qty: i.qty + newItem.qty } : i
              ),
            };
          }
          return { items: [...state.items, newItem] };
        });
      },
      removeItem: (product_id) => {
        set((state) => ({
          items: state.items.filter((i) => i.product_id !== product_id),
        }));
      },
      setQty: (product_id, qty) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.product_id === product_id ? { ...i, qty: Math.max(1, qty) } : i
          ),
        }));
      },
      setNote: (product_id, note) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.product_id === product_id ? { ...i, note: note } : i
          ),
        }));
      },
      clearCart: () => set({ items: [] }),
      getTotal: () => {
        return get().items.reduce((total, item) => total + item.price * item.qty, 0);
      },
      getTotalItems: () => {
        return get().items.reduce((total, item) => total + item.qty, 0);
      },
    }),
    {
      name: "kold-b2b-cart",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
