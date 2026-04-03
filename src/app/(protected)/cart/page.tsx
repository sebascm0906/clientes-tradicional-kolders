"use client";
import { useEffect, useState } from "react";
import { useB2BCartStore } from "@/store/cart";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, ArrowLeft } from "lucide-react";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";

export default function CartPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  const { items, setQty, setNote, removeItem, clearCart, getTotal } = useB2BCartStore();

  const [partner, setPartner] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  const [dateStr, setDateStr] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [horario, setHorario] = useState("Mañana (8:00 - 13:00)");
  const [paymentMethod, setPaymentMethod] = useState("credito");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setMounted(true);
    fetch('/api/account/profile')
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setPartner(data);
          if (data.credit_limit <= 0) {
            setPaymentMethod("transferencia");
          }
        }
        setLoadingProfile(false);
      })
      .catch(() => {
        setLoadingProfile(false);
      });
  }, []);

  if (!mounted) return null;

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
         <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center text-muted-foreground mb-4">
            <Trash2 size={32} />
         </div>
         <h1 className="text-xl font-bold font-display text-foreground mb-2">Tu carrito está vacío</h1>
         <p className="text-sm text-muted-foreground mb-8 text-balance">
            Agrega cajas o piezas desde el catálogo B2B.
         </p>
         <Link href="/catalog" className="bg-primary text-white font-bold px-8 py-4 rounded-xl shadow-lg">
            Ir al Catálogo
         </Link>
      </div>
    );
  }

  const subtotal = getTotal();
  const iva = Math.round(subtotal * 0.16 * 100) / 100;
  const total = Math.round((subtotal + iva) * 100) / 100;

  let creditoDisponible = 0;
  let superaCredito = false;
  if (partner) {
      creditoDisponible = partner.credit_limit - partner.credit_used;
      superaCredito = total > creditoDisponible;
  }

  const handleCheckout = async () => {
    if (checkoutLoading) return;
    setCheckoutLoading(true);
    setCheckoutError("");

    try {
      // Paso 1: Validar carrito server-side contra Odoo (precios, stock, existencia)
      const validateRes = await fetch('/api/cart/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart_lines: items })
      });

      const validation = await validateRes.json();
      if (!validateRes.ok) {
        setCheckoutError(validation.error || "Error validando el carrito.");
        return;
      }

      if (!validation.valid) {
        const msgs = validation.issues.map((i: any) => i.message).join('\n');
        setCheckoutError(`Problemas detectados:\n${msgs}`);
        return;
      }

      // Paso 2: Crear la orden en Odoo con datos validados
      const res = await fetch('/api/b2b/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart_lines: items,
          delivery_date: dateStr,
          delivery_schedule: horario,
          payment_method: paymentMethod,
          notes: notes
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setCheckoutError(data.error || "Error al crear la orden. Intenta nuevamente.");
      } else {
        clearCart();
        router.push(`/order/confirmed?orderName=${data.order_name}&status=${data.status}&executive=${encodeURIComponent(data.ejecutivo_nombre)}&executiveId=${data.ejecutivo_id}`);
      }
    } catch (e) {
      setCheckoutError("Error de conexión. Verifica tu red e intenta de nuevo.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32">
        <div className="bg-white border-b border-border p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
            <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center bg-muted text-foreground rounded-full">
                <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-bold text-foreground">Carrito B2B</h1>
            <div className="ml-auto">
               <button onClick={clearCart} className="text-danger flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-danger/10">
                 <Trash2 size={14} /> Vaciar
               </button>
            </div>
        </div>

        <div className="p-4 space-y-6">
            {/* Tabla de Productos densa */}
            <div className="bg-white border border-border rounded-xl px-0 py-2 shadow-sm relative overflow-hidden">
               <table className="w-full text-left text-sm whitespace-nowrap">
                   <thead>
                      <tr className="border-b border-border bg-muted/30 text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                         <th className="px-3 py-2">Producto</th>
                         <th className="px-3 py-2 text-center w-24">QTY</th>
                         <th className="px-3 py-2 text-right">Sub.</th>
                         <th className="px-3 py-2 w-10"></th>
                      </tr>
                   </thead>
                   <tbody>
                      {items.map(l => (
                         <tr key={l.product_id} className="border-b border-border/50 text-foreground font-medium">
                            <td className="px-3 py-3 w-full">
                               <div className="text-xs font-bold truncate max-w-[180px]" title={l.name}>{l.name}</div>
                               <div className="text-[10px] text-muted-foreground flex gap-2 mt-0.5">
                                 {l.sku && <span>{l.sku}</span>}
                                 <span className="text-primary font-bold">${l.price.toFixed(2)}</span>
                               </div>
                               <input
                                  className="w-full mt-2 bg-secondary text-xs h-6 px-2 rounded outline-none placeholder:text-muted-foreground"
                                  placeholder="Nota..."
                                  value={l.note || ''}
                                  onChange={e => setNote(l.product_id, e.target.value)}
                               />
                            </td>
                            <td className="px-3 py-3 text-center w-24 align-top pt-3.5">
                               <input
                                  type="number"
                                  value={l.qty}
                                  onChange={e => setQty(l.product_id, parseInt(e.target.value)||1)}
                                  className="w-16 h-8 text-center text-sm font-bold bg-secondary border border-border rounded"
                               />
                            </td>
                            <td className="px-3 py-3 text-right align-top pt-4">
                               <span className="font-extrabold text-sm">${(Math.round(l.price * l.qty * 100) / 100).toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                            </td>
                            <td className="px-3 py-3 text-right align-top pt-4 text-danger">
                               <button onClick={() => removeItem(l.product_id)}><Trash2 size={16} /></button>
                            </td>
                         </tr>
                      ))}
                   </tbody>
               </table>
            </div>

            {/* Detalles de Entrega */}
            <div className="bg-white border border-border rounded-xl p-4 shadow-sm space-y-4">
                <h3 className="font-bold text-foreground mb-4">Logística B2B</h3>

                <div className="space-y-1">
                   <label className="text-xs font-bold text-muted-foreground uppercase">Sucursal de Entrega</label>
                   <div className="w-full h-11 bg-secondary rounded-lg px-3 flex items-center text-sm">
                      {loadingProfile ? <Loader2 size={16} className="animate-spin text-muted-foreground" /> : <span className="font-medium truncate">{partner?.address || 'Dirección principal no registrada'}</span>}
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase">Fecha (Mín 24h)</label>
                      <input
                         type="date"
                         min={format(addDays(new Date(), 1), "yyyy-MM-dd")}
                         value={dateStr}
                         onChange={e => setDateStr(e.target.value)}
                         className="w-full h-11 bg-white border border-border rounded-lg px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary"
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase">Horario</label>
                      <select
                         value={horario}
                         onChange={e => setHorario(e.target.value)}
                         className="w-full h-11 bg-white border border-border rounded-lg px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary"
                      >
                          <option value="Mañana (8:00 - 13:00)">Mañana</option>
                          <option value="Tarde (13:00 - 18:00)">Tarde</option>
                      </select>
                   </div>
                </div>

                <div className="space-y-1">
                   <label className="text-xs font-bold text-muted-foreground uppercase">Observaciones Generales</label>
                   <textarea
                     value={notes}
                     onChange={e => setNotes(e.target.value)}
                     maxLength={2000}
                     className="w-full h-20 resize-none bg-white border border-border rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                     placeholder="Ej: Solo recibir por entrada trasera..."
                   />
                </div>
            </div>

             {/* Detalles Pago / Financiero */}
             <div className="bg-white border border-border rounded-xl p-4 shadow-sm space-y-4">
                <h3 className="font-bold text-foreground mb-1">Términos Comerciales</h3>

                <div className="p-3 bg-secondary rounded-lg mb-4">
                   <div className="flex justify-between items-center text-sm font-medium mb-1">
                      <span>Subtotal Operativo (sin IVA)</span>
                      <span>${subtotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                   </div>
                   <div className="flex justify-between items-center text-sm font-medium text-muted-foreground mb-3">
                      <span>IVA (16%)</span>
                      <span>${iva.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                   </div>
                   <div className="flex justify-between items-center border-t border-border pt-2 text-primary font-extrabold text-lg">
                      <span>Total final</span>
                      <span>${total.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                   </div>
                </div>

                {loadingProfile ? null : (
                    <>
                    <div className="space-y-1 mb-4">
                       <label className="text-xs font-bold text-muted-foreground uppercase">Método para esta orden</label>
                       <select
                         value={paymentMethod}
                         onChange={e => setPaymentMethod(e.target.value)}
                         className="w-full h-11 bg-white border border-border rounded-lg px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary"
                       >
                           {partner.credit_limit > 0 && <option value="credito">Condición Autorizada: {partner.payment_term?.name || 'Crédito'}</option>}
                           <option value="transferencia">Transferencia Bancaria SPEI</option>
                           <option value="efectivo">Efectivo contra entrega</option>
                       </select>
                    </div>

                    {paymentMethod === 'credito' && (
                        <div className={`p-3 rounded-lg border ${superaCredito ? 'bg-danger/10 border-danger/30 text-danger' : 'bg-success/10 border-success/30 text-success'}`}>
                            <div className="flex justify-between font-bold text-sm mb-1">
                               <span>Límite Total:</span>
                               <span>${partner.credit_limit.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                            </div>
                            <div className="flex justify-between font-medium text-sm mb-1">
                               <span>Crédito Usado Previo:</span>
                               <span>${partner.credit_used.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                            </div>
                            <div className="h-0.5 bg-black/10 my-2"></div>
                             <div className="flex justify-between font-bold text-sm">
                               <span>Disponible tras pedido:</span>
                               <span className={superaCredito ? 'font-extrabold underline' : ''}>
                                  ${(Math.round((creditoDisponible - total) * 100) / 100).toLocaleString('en-US', {minimumFractionDigits: 2})}
                               </span>
                            </div>
                            {superaCredito && <p className="text-[10px] mt-2 font-bold leading-tight">Esta operación supera tu límite de crédito. Pasará a revisión Comercial como Cotización.</p>}
                            {!superaCredito && <p className="text-[10px] mt-2 font-bold leading-tight text-success">Operación viable. El pedido se confirmará y descontará de tu línea en automático.</p>}
                        </div>
                    )}
                    </>
                )}

                {checkoutError && <p className="text-danger text-sm font-bold mt-2">{checkoutError}</p>}

                <button
                  onClick={handleCheckout}
                  disabled={checkoutLoading || loadingProfile}
                  className="w-full h-14 mt-4 rounded-xl bg-primary text-white font-bold tracking-wide transition-all disabled:opacity-50 flex items-center justify-center shadow-lg shadow-primary/20 hover:bg-primary/90"
                >
                   {checkoutLoading ? <Loader2 className="animate-spin w-6 h-6" /> : "Procesar Orden B2B"}
                </button>
             </div>
        </div>
    </div>
  );
}
