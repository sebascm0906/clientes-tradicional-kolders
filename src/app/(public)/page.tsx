"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export default function Home() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 10) return;

    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error);
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setErrorMsg("Error de conexión al servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex flex-col relative px-6 py-12">
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full z-10">

        <div className="mb-10 text-center">
          <div className="text-primary font-bold tracking-[0.2em] text-sm mb-2">PORTAL DISTRIBUIDORES</div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground font-display">
            KOLDOS
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Ingresa tu número de contacto B2B para entrar al catálogo.
          </p>
        </div>

        {success ? (
          <div className="bg-success/10 border border-success/20 rounded-2xl p-6 text-center animate-in fade-in slide-in-from-bottom-4">
            <div className="w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mx-auto mb-4 text-success text-2xl">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h3 className="font-bold text-lg mb-2 text-foreground">Ingresa tu código</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Enviamos un código de 6 dígitos al <b>{phone}</b>
            </p>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (otp.length !== 6) return;
              setLoading(true);
              setErrorMsg("");
              try {
                const res = await fetch("/api/auth/verify-code", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ code: otp, phone })
                });
                const data = await res.json();
                if (!res.ok) {
                  setErrorMsg(data.error);
                } else {
                  window.location.href = data.redirect || '/';
                }
              } catch (err) {
                setErrorMsg("Error al verificar código");
              } finally {
                setLoading(false);
              }
            }} className="space-y-4">
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').substring(0, 6))}
                placeholder="000000"
                className="w-full h-16 text-center text-3xl tracking-[0.5em] font-bold bg-card border-none rounded-xl outline-none ring-1 ring-border focus:ring-2 focus:ring-primary shadow-sm"
                autoFocus
                maxLength={6}
              />

              {errorMsg && (
                <div className="p-3 rounded-lg bg-danger/10 text-danger text-sm font-medium animate-in fade-in">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={otp.length !== 6 || loading}
                className="w-full h-14 rounded-xl bg-primary text-white font-bold tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
              >
                {loading ? <Loader2 className="animate-spin" /> : "Verificar e Ingresar"}
              </button>
            </form>

            <button
              onClick={() => { setSuccess(false); setOtp(""); setErrorMsg(""); }}
              className="mt-6 text-primary text-sm font-bold opacity-80 hover:opacity-100"
            >
              Cambiar número
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-foreground">
                Número de Celular B2B
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                  +52
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').substring(0, 10))}
                  placeholder="Tu celular a 10 dígitos"
                  className="w-full h-14 bg-card border-none rounded-xl pl-14 pr-4 text-lg font-bold outline-none ring-1 ring-border focus:ring-2 focus:ring-primary shadow-sm"
                  autoFocus
                />
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-danger/10 text-danger text-sm font-medium animate-in fade-in">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={phone.length < 10 || loading}
              className="w-full h-14 rounded-xl bg-primary text-white font-bold tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
            >
              {loading ? <Loader2 className="animate-spin" /> : "Recibir Enlace KOLD"}
            </button>
          </form>
        )}
      </div>

      {/* Decorative background B2B styling */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl -z-10 -translate-x-1/2 translate-y-1/2"></div>

    </main>
  );
}
