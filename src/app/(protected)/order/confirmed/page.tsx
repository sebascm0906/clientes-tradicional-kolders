"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Phone, FileText } from "lucide-react";

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderName = searchParams.get("orderName") || "Pendiente";
  const status = searchParams.get("status") || "draft";
  const executiveName = searchParams.get("executive") || "tu ejecutivo";
  const executiveId = searchParams.get("executiveId");

  const isConfirmed = status === "confirmed";
  
  const handleContactExecutive = async () => {
     try {
         const res = await fetch(`/api/account/profile`);
         const data = await res.json();
         const waNumber = data.executive_phone || process.env.NEXT_PUBLIC_WA_SALES || '5218110000000';
         window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(`Hola soy ${data.name} (B2B). Quisiera saber sobre mi pedido ${orderName}`)}`, '_blank');
     } catch (e) {
         window.open(`https://wa.me/${process.env.NEXT_PUBLIC_WA_SALES || '5218110000000'}?text=${encodeURIComponent(`Hola. Quisiera saber sobre mi pedido ${orderName}`)}`, '_blank');
     }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center pb-32">
       
       <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg ${isConfirmed ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
           {isConfirmed ? <CheckCircle2 size={40} className="text-success" /> : <Clock size={40} className="text-warning" />}
       </div>

       <h1 className="text-3xl font-bold font-display text-foreground mb-2">
           {isConfirmed ? "¡Pedido Confirmado!" : "¡Pedido recibido!"}
       </h1>
       <div className="bg-white px-4 py-2 border border-border rounded-lg inline-block text-lg font-extrabold text-foreground mb-6 shadow-sm">
           {orderName}
       </div>

       <p className="text-muted-foreground mb-8 text-balance max-w-sm">
           {isConfirmed
             ? `Reserva autorizada en almacén. Tu ejecutivo comercial ${executiveName} ya ha sido notificado sobre la entrega próxima.`
             : `Tu pedido ${orderName} fue recibido. Tu ejecutivo revisará disponibilidad y entrega, y te confirmará en breve.`
           }
       </p>

       <div className="w-full max-w-sm space-y-3">
          <Link href="/account/orders" className="w-full flex items-center justify-center gap-2 bg-white border border-border text-foreground font-bold h-14 rounded-xl shadow-sm hover:border-primary transition-colors">
              <FileText size={20} /> Ver mis pedidos
          </Link>
          
          <Link href="/catalog" className="w-full flex items-center justify-center bg-primary text-white font-bold h-14 rounded-xl shadow-lg hover:bg-primary/90 transition-colors">
              Hacer otro pedido
          </Link>

          <button onClick={handleContactExecutive} className="w-full mt-4 flex items-center justify-center gap-2 text-primary font-bold h-14 rounded-xl hover:bg-primary/5 transition-colors">
              <Phone size={20} /> Contactar a {executiveName}
          </button>
       </div>

    </div>
  );
}

export default function OrderConfirmedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background text-primary">Cargando estado...</div>}>
      <ConfirmationContent />
    </Suspense>
  );
}
