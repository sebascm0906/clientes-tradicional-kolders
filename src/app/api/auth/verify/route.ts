import { NextResponse } from 'next/server';
import { verifyToken, signToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { token } = await request.json();
    if (!token) return NextResponse.json({ error: 'Token missing' }, { status: 400 });

    const payload = await verifyToken(token);
    if (!payload || !payload.partner_id || !payload.b2b) {
      return NextResponse.json({ error: 'Link invÃ¡lido o expirado' }, { status: 401 });
    }

    // Refresh a un token largo para 7 dÃ­as
    const sessionToken = await signToken({ partner_id: payload.partner_id, b2b: true, source: 'pwa_canal_tradicional' });

    (await cookies()).set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
