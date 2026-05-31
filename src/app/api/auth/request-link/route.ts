import { NextResponse } from "next/server";
import { requestN8nAuthCode } from "@/lib/n8nAuth";

export async function POST(request: Request) {
  try {
    const { phone } = await request.json();
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Formato de número inválido. Ingresa 10 dígitos." }, { status: 400 });
    }

    await requestN8nAuthCode(phone);

    return NextResponse.json({
      message: "Si el número es correcto, recibirás un WhatsApp con tu código de acceso.",
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    const message = error instanceof Error ? error.message : "Error procesando solicitud. Intenta nuevamente.";

    console.error("Request Link Error:", message);

    if (status === 401 || status === 404) {
      return NextResponse.json({
        message: "Si el número es correcto, recibirás un WhatsApp con tu código de acceso.",
      });
    }

    return NextResponse.json(
      { error: message || "Error procesando solicitud. Intenta nuevamente." },
      { status: Number.isFinite(status) ? status : 500 }
    );
  }
}

export const dynamic = "force-dynamic";
