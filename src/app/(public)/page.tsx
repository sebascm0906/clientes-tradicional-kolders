"use client";

const WA_LINK = "https://wa.me/525540000990?text=Dame%20mi%20acceso";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#EFF6FF] via-[#DBEAFE] to-[#BFDBFE] flex flex-col relative px-6 py-12">
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full z-10">

        {/* Brand */}
        <div className="mb-12 text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-primary/20">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-primary" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" fillOpacity="0.1"/>
              <path d="M8 12s.5-4 4-4 4 4 4 4-.5 4-4 4-4-4-4-4z"/>
              <path d="M12 8v-2M12 18v-2M8 12H6M18 12h-2"/>
            </svg>
          </div>
          <p className="text-primary font-black tracking-[0.25em] text-xs mb-1 uppercase">Portal Distribuidores</p>
          <h1 className="text-5xl font-black tracking-tight text-foreground">KOLDOS</h1>
          <p className="text-muted-foreground mt-3 text-sm max-w-[240px] mx-auto leading-relaxed">
            Recibe tu enlace de acceso directo en WhatsApp.
          </p>
        </div>

        {/* WhatsApp button */}
        <div className="space-y-4">
          <a
            href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-14 rounded-2xl bg-[#25D366] text-white font-black text-base tracking-wide transition-all active:scale-95 flex items-center justify-center gap-3 shadow-xl shadow-green-500/25"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Recibir Enlace KOLD
          </a>

          <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
            Se abrirá WhatsApp con un mensaje listo.<br/>
            El bot te entrega tu enlace de acceso en segundos.
          </p>
        </div>
      </div>

      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl -z-10 translate-x-1/3 -translate-y-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-accent/5 rounded-full blur-3xl -z-10 -translate-x-1/3 translate-y-1/3 pointer-events-none" />
    </main>
  );
}
