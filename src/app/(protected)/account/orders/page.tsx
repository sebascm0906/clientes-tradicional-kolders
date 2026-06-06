"use client";
import { useEffect, useState } from "react";
import { useB2BCartStore } from "@/store/cart";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

export default function OrderHistory() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const addItem = useB2BCartStore(state => state.addItem);

  useEffect(() => {
    fetch('/api/b2b/orders/history')
      .then(res => {
        if (!res.ok) throw new Error('Error del servidor');
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) setOrders(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const handleReorder = (order: any) => {
     order.lines.forEach((line: any) => {
         addItem({
             product_id: line.product_id,
             name: line.name.split('\n')[0],
             sku: '',
             price: line.price,
             uom_name: line.uom,
             qty: line.qty,
             qtyPerPage: 1
         });
     });
     router.push("/cart");
  };

  const getStatusBadge = (state: string) => {
    switch (state) {
      case 'draft': 
      case 'sent': return <span className="bg-warning/20 text-warning px-2 py-0.5 rounded text-[10px] font-bold">🟡 En revisión</span>;
      case 'sale': return <span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-[10px] font-bold">🔵 Confirmado</span>;
      case 'done': return <span className="bg-success/20 text-success px-2 py-0.5 rounded text-[10px] font-bold">🟢 Entregado</span>;
      case 'cancel': return <span className="bg-danger/20 text-danger px-2 py-0.5 rounded text-[10px] font-bold">🔴 Cancelado</span>;
      default: return null;
    }
  };

  const getInvoiceBadge = (status: string) => {
       if (status === 'to_invoice') return <span className="text-[10px] text-muted-foreground border border-border px-1.5 rounded">Por facturar</span>;
       if (status === 'invoiced') return <span className="text-[10px] bg-blue-50 text-primary border border-primary/20 px-1.5 rounded">Facturado</span>;
       return null;
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#1E3A8A] to-[#2563EB] pt-10 pb-4 px-4 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/account')}
            className="w-9 h-9 flex items-center justify-center bg-white/15 text-white rounded-xl"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-white text-lg font-black">Mis Pedidos</h1>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="animate-spin text-primary w-8 h-8" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center p-10 bg-card border border-border rounded-2xl">
            <div className="text-4xl mb-3">🧊</div>
            <p className="font-bold text-foreground mb-1">Sin pedidos aún</p>
            <p className="text-muted-foreground text-sm">Tus órdenes aparecerán aquí.</p>
          </div>
        ) : (
          orders.map(order => (
            <div key={order.id} className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-black text-foreground text-base">{order.name}</h3>
                    {getStatusBadge(order.state)}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-medium">
                    {new Date(order.date_order).toLocaleDateString()} · {new Date(order.date_order).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <div className="mt-1">{getInvoiceBadge(order.invoice_status)}</div>
                </div>
                <p className="font-black text-lg text-primary ml-3 flex-shrink-0">
                  ${order.amount_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>

              {expandedId === order.id && (
                <div className="px-4 pb-3 border-t border-border bg-secondary/50">
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider pt-3 mb-2">Detalle del pedido</p>
                  <div className="space-y-1.5">
                    {order.lines?.map((line: any, index: number) => (
                      <div key={index} className="flex justify-between items-center text-xs">
                        <span className="font-medium text-foreground max-w-[200px] truncate">{line.qty}× {line.name.split('\n')[0]}</span>
                        <span className="font-bold text-muted-foreground">${(line.qty * line.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3 border-t border-border flex gap-2">
                <button
                  onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                  className="flex-1 bg-secondary border border-border text-foreground text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5"
                >
                  {expandedId === order.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {expandedId === order.id ? 'Ocultar' : 'Ver detalle'}
                </button>
                <button
                  onClick={() => handleReorder(order)}
                  className="flex-1 bg-primary/10 text-primary border border-primary/20 text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 hover:bg-primary hover:text-white transition-all"
                >
                  <RefreshCw size={13} /> Reordenar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
