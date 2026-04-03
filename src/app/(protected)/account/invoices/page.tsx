"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Download, AlertCircle, Copy, CheckCircle2 } from "lucide-react";

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showPaymentModal, setShowPaymentModal] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [downloadingPdf, setDownloadingPdf] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
        fetch('/api/b2b/invoices').then(res => res.ok ? res.json() : []),
        fetch('/api/account/profile').then(res => res.ok ? res.json() : null)
    ]).then(([invData, profData]) => {
        if (Array.isArray(invData)) setInvoices(invData);
        if (profData && !profData.error) setProfile(profData);
        setLoading(false);
    }).catch(() => {
        setLoading(false);
    });
  }, []);

  const handleCopyClabe = () => {
      navigator.clipboard.writeText(process.env.NEXT_PUBLIC_BANK_CLABE || "012345678912345678");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  }

  const handleWhatsappTransfer = () => {
      if(!profile) return;
      window.open(`https://wa.me/${process.env.NEXT_PUBLIC_WA_SALES || '5218110000000'}?text=${encodeURIComponent(`Hola. Adjunto comprobante de pago para la factura ${showPaymentModal.name} del socio ${profile.name}`)}`, '_blank');
      setShowPaymentModal(null);
  }

  const getStatusInfo = (dueDate: string) => {
       const due = new Date(dueDate);
       const now = new Date();
       const diffTime = due.getTime() - now.getTime();
       const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

       if (diffDays < 0) return { label: 'Vencida', color: 'text-danger bg-danger/10 border-danger/20', icon: '🔴' };
       if (diffDays <= 5) return { label: `Vence en ${diffDays} días`, color: 'text-warning bg-warning/10 border-warning/20', icon: '🟡' };
       return { label: 'Vigente', color: 'text-success bg-success/10 border-success/20', icon: '🟢' };
  };

  const totalDeuda = invoices.reduce((acc, inv) => acc + inv.amount_residual, 0);
  const hasVencidas = invoices.some(inv => new Date(inv.invoice_date_due) < new Date());

  return (
    <div className="min-h-screen bg-background pb-32">
        <div className="bg-white border-b border-border p-4 sticky top-0 z-20 shadow-sm flex items-center gap-3">
            <button onClick={() => router.push('/account')} className="w-10 h-10 flex items-center justify-center bg-muted text-foreground rounded-full hover:bg-muted/80 transition-colors">
                <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-bold text-foreground font-display">Facturación y Pagos</h1>
        </div>

        <div className="p-4 space-y-4 relative z-10">
           {/* Estado general consolidado */}
           {!loading && invoices.length > 0 && (
             <div className={`p-5 rounded-2xl border shadow-sm ${hasVencidas ? 'bg-danger/5 border-danger/30' : 'bg-white border-border'}`}>
                 <p className="text-xs uppercase font-bold text-muted-foreground mb-1 tracking-wider">Deuda Total Pendiente</p>
                 <p className={`text-4xl font-extrabold tracking-tight ${hasVencidas ? 'text-danger' : 'text-foreground'}`}>
                     ${totalDeuda.toLocaleString('en-US', {minimumFractionDigits: 2})}
                 </p>
                 {hasVencidas && <p className="text-danger flex items-center gap-1 text-xs font-bold mt-2"><AlertCircle size={14} /> Tienes facturas vencidas bloqueando crédito</p>}
             </div>
           )}

           {loading ? (
              <div className="flex justify-center p-10"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>
           ) : invoices.length === 0 ? (
              <div className="text-center p-10 bg-white border border-border rounded-xl">
                 <CheckCircle2 size={40} className="text-success mx-auto mb-3" />
                 <h3 className="font-bold text-foreground">Tu cuenta está al corriente</h3>
                 <p className="text-muted-foreground text-sm">No tienes facturas comerciales pendientes de pago.</p>
              </div>
           ) : (
             <div className="space-y-4">
               {invoices.map(inv => {
                  const status = getStatusInfo(inv.invoice_date_due);
                  return (
                    <div key={inv.id} className="bg-white border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
                       <div className="p-4 flex justify-between items-start">
                           <div>
                               <h3 className="font-extrabold text-foreground text-lg mb-1">{inv.name}</h3>
                               <div className="flex items-center gap-2 mb-2">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${status.color}`}>
                                    {status.icon} {status.label}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground font-medium">Emitida: {new Date(inv.invoice_date).toLocaleDateString()}</span>
                               </div>
                           </div>
                           <div className="text-right">
                               <p className="text-xs text-muted-foreground uppercase font-bold mb-0.5">Pendiente</p>
                               <p className="font-extrabold text-xl text-foreground">${inv.amount_residual.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                           </div>
                       </div>
                       
                       <div className="bg-muted/10 p-3 pt-4 border-t border-border flex gap-3">
                           <button
                             disabled={downloadingPdf === inv.id}
                             onClick={async () => {
                               setDownloadingPdf(inv.id);
                               try {
                                 const res = await fetch(`/api/b2b/invoices/${inv.id}/pdf`);
                                 if (!res.ok) throw new Error('PDF no disponible');
                                 const blob = await res.blob();
                                 const url = URL.createObjectURL(blob);
                                 window.open(url, '_blank');
                                 setTimeout(() => URL.revokeObjectURL(url), 60000);
                               } catch (e) {
                                 alert('No se pudo obtener el PDF. Intenta más tarde.');
                               } finally {
                                 setDownloadingPdf(null);
                               }
                             }}
                             className="flex-1 bg-white border border-border text-foreground text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-muted/50 transition-colors disabled:opacity-50"
                           >
                               {downloadingPdf === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Ver PDF
                           </button>
                           <button onClick={() => setShowPaymentModal(inv)} className="flex-1 bg-primary text-white text-xs font-bold py-2.5 rounded-lg shadow-md hover:bg-primary/90 transition-colors">
                               Abonar / Pagar
                           </button>
                       </div>
                    </div>
                  );
               })}
             </div>
           )}
        </div>

        {/* Modal Pago */}
        {showPaymentModal && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl relative animate-in slide-in-from-bottom-10">
                    <button onClick={() => setShowPaymentModal(null)} className="absolute top-4 right-5 text-muted-foreground hover:text-foreground font-bold">X</button>
                    <h2 className="text-xl font-bold text-foreground mb-1">Instrucciones de Pago</h2>
                    <p className="text-sm text-muted-foreground mb-6">Transfiere la cantidad correspondiente para la factura <strong>{showPaymentModal.name}</strong>.</p>
                    
                    <div className="space-y-4">
                       <div className="bg-secondary p-4 rounded-xl space-y-3 relative">
                          <div>
                             <p className="text-[10px] text-muted-foreground uppercase font-bold">Banco Receptor</p>
                             <p className="font-bold text-sm">{process.env.NEXT_PUBLIC_BANK_NAME || 'BBVA Bancomer'}</p>
                          </div>
                          <div>
                             <p className="text-[10px] text-muted-foreground uppercase font-bold">Cuenta CLABE</p>
                             <p className="font-extrabold text-lg text-primary font-mono tracking-widest">{process.env.NEXT_PUBLIC_BANK_CLABE || '012345678901234567'}</p>
                          </div>
                          <div>
                             <p className="text-[10px] text-muted-foreground uppercase font-bold">Beneficiario / Concepto</p>
                             <p className="font-bold text-sm">{process.env.NEXT_PUBLIC_BANK_BENEFICIARY || 'GLACIEM SA DE CV'}</p>
                             <p className="text-xs text-muted-foreground mt-0.5">Ref: {showPaymentModal.name} - {profile?.name}</p>
                          </div>
                          <button onClick={handleCopyClabe} className="absolute right-4 top-[3rem] w-10 h-10 bg-white border border-border shadow-sm rounded-full flex items-center justify-center text-primary">
                             {copied ? <CheckCircle2 size={16} className="text-success" /> : <Copy size={16} />}
                          </button>
                       </div>

                       <div className="flex justify-between items-center py-2 px-1 border-b border-border/50">
                           <span className="font-bold text-sm text-muted-foreground">Monto Pendiente:</span>
                           <span className="font-extrabold flex text-lg">${showPaymentModal.amount_residual.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                       </div>

                       <button onClick={handleWhatsappTransfer} className="w-full bg-success text-white font-bold h-12 rounded-xl mt-2 flex items-center justify-center gap-2 shadow-lg shadow-success/20">
                           Enviar Comprobante
                       </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}
