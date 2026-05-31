import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyN8nAuthCode } from "@/lib/n8nAuth";
import { signToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { code, phone } = await request.json();
    if (!code || typeof code !== "string" || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Código inválido. Debe ser de 6 dígitos." }, { status: 400 });
    }
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "La sesión expiró. Vuelve a solicitar un código nuevo." }, { status: 401 });
    }

    const auth = await verifyN8nAuthCode(phone, code);
    if (!auth.partner_id) {
      return NextResponse.json({ error: "No pudimos validar tu acceso. Solicita un código nuevo." }, { status: 401 });
    }

    const sessionToken = await signToken({
      partner_id: auth.partner_id,
      b2b: true,
      source: "pwa_canal_tradicional",
    });
    const cookieStore = await cookies();

    cookieStore.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });
    cookieStore.delete("otp_session");

    return NextResponse.json({ success: true, redirect: "/catalog" });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    const message = error instanceof Error ? error.message : "Error del servidor. Intenta nuevamente.";

    console.error("Verify Code Error:", message);

    return NextResponse.json(
      { error: message || "Error del servidor. Intenta nuevamente." },
      { status: Number.isFinite(status) ? status : 500 }
    );
  }
}

export const dynamic = "force-dynamic";
