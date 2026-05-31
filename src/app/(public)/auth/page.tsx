"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const phone = searchParams.get("phone");
  const missingAccessParams = !token || !phone;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
          router.replace("/catalog"); // Catálogo directo en B2B
        }
      })
      .catch(() => setError("Error de conexión al servidor"));
  }, [missingAccessParams, token, phone, router]);

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
