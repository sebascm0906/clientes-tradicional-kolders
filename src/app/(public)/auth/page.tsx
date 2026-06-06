"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const ua = navigator.userAgent;

  // Android WhatsApp explicitly includes "WhatsApp" in the UA
  if (/WhatsApp/.test(ua)) return true;

  // iOS WhatsApp uses WKWebView: has iPhone/iPad but NO "Safari/" token and
  // is NOT a known iOS browser (Chrome, Firefox, Edge, Opera) and NOT the installed PWA
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  const hasSafariToken = /Safari\//.test(ua);
  const isKnownIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

  if (isIOS && !isStandalone && !hasSafariToken && !isKnownIOSBrowser) return true;

  return false;
}

function isIOS(): boolean {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function WhatsAppOverlay({ currentUrl }: { currentUrl: string }) {
  const [copied, setCopied] = useState(false);
  const onIOS = isIOS();

  const handleOpenSafari = () => {
    window.open(currentUrl, "_blank");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-6">
      <div className="bg-card w-full max-w-sm rounded-3xl p-8 border border-border text-center shadow-lg space-y-6">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </div>

        <div>
          <h2 className="text-xl font-bold text-foreground mb-2">Abre en Safari</h2>
          <p className="text-sm text-muted-foreground">
            Para ingresar al portal debes abrir este enlace en Safari, no dentro de WhatsApp.
          </p>
        </div>

        {onIOS ? (
          <div className="bg-muted rounded-2xl p-4 text-left space-y-3">
            <p className="text-sm font-bold text-foreground">Pasos:</p>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Toca los <strong>···</strong> (puntos) en la esquina superior derecha</li>
              <li>Selecciona <strong>"Abrir en Safari"</strong></li>
            </ol>
          </div>
        ) : (
          <button
            onClick={handleOpenSafari}
            className="w-full h-12 rounded-xl bg-primary text-white font-bold tracking-wide transition-all hover:bg-primary/90 shadow-lg shadow-primary/20"
          >
            Abrir en navegador
          </button>
        )}

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            O copia el enlace y ábrelo manualmente en Safari:
          </p>
          <div className="flex items-center gap-2 bg-muted rounded-xl p-3">
            <span className="text-xs text-foreground truncate flex-1 text-left font-mono">
              {currentUrl}
            </span>
            <button
              onClick={handleCopy}
              className="shrink-0 text-primary text-xs font-bold"
            >
              {copied ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const phone = searchParams.get("phone");
  const missingAccessParams = !token || !phone;
  const [error, setError] = useState<string | null>(null);
  const [inWhatsApp, setInWhatsApp] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");

  useEffect(() => {
    if (isWhatsAppWebView()) {
      setInWhatsApp(true);
      setCurrentUrl(window.location.href);
      return;
    }

    if (missingAccessParams) {
      return;
    }

    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, phone })
    })
      .then((res) => res.json().then(data => ({ status: res.status, data })))
      .then(({ status, data }) => {
        if (status !== 200 || data.error) {
          setError(data.error || "Error validando credenciales");
        } else {
          router.replace("/catalog");
        }
      })
      .catch(() => setError("Error de conexión al servidor"));
  }, [missingAccessParams, token, phone, router]);

  if (inWhatsApp) {
    return <WhatsAppOverlay currentUrl={currentUrl} />;
  }

  if (missingAccessParams || error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
        <div className="bg-card w-full max-w-sm rounded-3xl p-8 border border-border text-center shadow-lg">
          <div className="w-16 h-16 bg-danger/10 text-danger rounded-full flex items-center justify-center mx-auto mb-6 text-2xl">
            ✖
          </div>
          <h1 className="text-xl font-bold mb-2">Acceso Denegado</h1>
          <p className="text-muted-foreground text-sm mb-6">
            {error || "Token de acceso no válido o ausente."}
          </p>
          <button 
            onClick={() => router.replace("/")}
            className="w-full bg-primary text-white font-bold h-12 rounded-xl"
          >
            Regresar al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
      <p className="font-medium text-foreground">Validando tu acceso de Distribuidor...</p>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
    }>
        <AuthContent />
    </Suspense>
  )
}
