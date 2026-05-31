import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyN8nMagicLink } from "@/lib/n8nAuth";
import { signToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { token, phone } = await request.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token missing" }, { status: 400 });
    }
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Phone missing" }, { status: 400 });
    }

    const auth = await verifyN8nMagicLink(phone, token);
    if (!auth.partner_id) {
      return NextResponse.json({ error: "No pudimos validar tu acceso. Solicita un código nuevo." }, { status: 401 });
    }
    const sessionToken = await signToken({
      partner_id: auth.partner_id,
      b2b: true,
      source: "pwa_canal_tradicional",
    });

    (await cookies()).set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    const message = error instanceof Error ? error.message : "Error del servidor";

    return NextResponse.json({ error: message }, { status: Number.isFinite(status) ? status : 500 });
  }
}

export const dynamic = "force-dynamic";
