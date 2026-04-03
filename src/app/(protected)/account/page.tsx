"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, LogOut, FileText, ClipboardList, Package, Phone, AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useB2BCartStore } from "@/store/cart";

export default function AccountPage() {
  const router = useRouter();
  const clearCart = useB2BCartStore(state => state.clearCart);

  const [partner, setPartner] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [overdueInvoices, setOverdueInvoices] = useState(0);

  useEffect(() => {
    Promise.all([
        fetch('/api/account/profile').then(res => res.ok ? res.json() : null),
        fetch('/api/b2b/invoices').then(res => res.ok ? res.json() : [])
    ]).then(([profileData, invData]) => {
        if (profileData && !profileData.error) setPartner(profileData);
        if (Array.isArray(invData)) {
            const overdue = invData.filter((i: any) => new Date(i.invoice_date_due) < new Date()).length;
            setOverdueInvoices(overdue);
        }
        setLoading(false);
    }).catch(() => {
        setLoading(false);
    });
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    clearCart();
    router.replace("/");
  };

  const contactExecutive = () => {
      if(!partner) return;
      const waNumber = partner.executive_phone || process.env.NEXT_PUBLIC_WA_SALES || '5218110000000';
      window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(`Hola, soy ${partner.name}. `)}`, '_blank');
  }

  if (loading) {
    return <div className="min-h-[50vh] flex justify-center items-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  const credito_disp = partner.credit_limit - partner.credit_used;
  const porcentaje_uso = partner.credit_limit > 0 ? (partner.credit_used / partner.credit_limit) * 100 : 0;
  
  return (
    <div className="min-h-screen bg-background pb-32">
       {/* Acciones Red de Contacto */}
       <div className="bg-primary pt-12 pb-16 px-6 text-white text-center rounded-b-3xl shadow-md">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md border border-white/30">
            <User size={36} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight leading-tight">{partner.name}</h1>
          <p className="text-white/80 text-sm mt-1">{partner.vat && `RFC: ${partner.vat}`}</p>
       </div>

       <div className="px-4 -mt-10 space-y-4 relative z-10">
          
          {/* Tarjeta de Crédito B2B */}
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-border">
              <h2 className="font-bold text-foreground mb-4">Línea de Crédito Comercial</h2>
              
              <div className="flex justify-between items-end mb-2">
                 <div>
                    <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Crédito Disponible</p>
                    <p className={`text-2xl font-extrabold ${credito_disp <= 0 ? 'text-danger' : 'text-success'}`}>
                       ${credito_disp.toLocaleString('en-US', {minimumFractionDigits: 2})}
                    </p>
                 </div>
                 <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Límite: ${partner.credit_limit.toLocaleString('en-US')}</p>
                    <p className="text-[10px] text-muted-foreground">Usado: ${partner.credit_used.toLocaleString('en-US')}</p>
                 </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-3 bg-secondary rounded-full overflow-hidden mb-2 mt-3">
                 <div 
                   className={`h-full transition-all duration-1000 ${porcentaje_uso > 90 ? 'bg-danger' : porcentaje_uso > 75 ? 'bg-warning' : 'bg-primary'}`} 
                   style={{ width: `${Math.min(porcentaje_uso, 100)}%` }}
                 ></div>
              </div>
          </div>

          {/* Banner Rojo de Facturas Vencidas */}
          {overdueInvoices > 0 && (
              <div className="bg-danger/10 border border-danger/30 rounded-2xl p-4 flex items-start gap-4 shadow-sm">
                 <div className="w-10 h-10 rounded-full bg-danger/20 flex items-center justify-center flex-shrink-0 text-danger mt-1">
                    <AlertTriangle size={20} />
                 </div>
                 <div>
                    <h3 className="font-bold text-danger leading-tight">Tienes {overdueInvoices} facturas vencidas</h3>
                    <p className="text-xs text-danger/80 mt-1 mb-2 font-medium">Por favor ponte al corriente para asegurar tus próximas entregas.</p>
                    <Link href="/account/invoices" className="text-xs font-bold text-danger underline inline-block">
                        Liquidar facturas
                    </Link>
                 </div>
              </div>
          )}

          {/* Tarjeta de Agente Comercial */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-border flex justify-between items-center">
             <div>
                <p className="text-xs text-muted-foreground font-bold uppercase">Ejecutivo de Cuenta</p>
                <p className="font-bold text-foreground text-sm">{partner.executive}</p>
             </div>
             <button onClick={contactExecutive} className="bg-success text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md">
                 <Phone size={14} /> WhatsApp
             </button>
          </div>

          <div className="h-2"></div>

          {/* Menú principal de Navegación B2B */}
          <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
            <Link href="/account/orders" className="flex items-center gap-4 p-4 border-b border-border hover:bg-muted/50 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <ClipboardList size={20} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-foreground text-sm">Auditoría de Pedidos</h3>
                <p className="text-xs text-muted-foreground">Revisar compras y reordenar stock</p>
              </div>
              <div className="text-muted-foreground">➔</div>
            </Link>
            
            <Link href="/account/invoices" className="flex items-center gap-4 p-4 border-b border-border hover:bg-muted/50 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary relative">
                <FileText size={20} />
                {overdueInvoices > 0 && <span className="absolute top-0 right-0 w-3 h-3 bg-danger rounded-full border-2 border-white"></span>}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-foreground text-sm">Facturación y Pagos</h3>
                <p className="text-xs text-muted-foreground">Revisión de saldos y PDF</p>
              </div>
              <div className="text-muted-foreground">➔</div>
            </Link>

            <Link href="/catalog" className="flex items-center gap-4 p-4 border-b border-border hover:bg-muted/50 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Package size={20} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-foreground text-sm">Catálogo de Productos</h3>
                <p className="text-xs text-muted-foreground">Hacer un nuevo pedido</p>
              </div>
              <div className="text-muted-foreground">➔</div>
            </Link>
          </div>

          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-4 bg-white rounded-2xl border border-border mt-4 text-danger font-bold hover:bg-danger/5 transition-colors shadow-sm"
          >
            <LogOut size={20} />
            Cerrar Sesión B2B
          </button>
       </div>
    </div>
  );
}
