import { NextResponse } from 'next/server';
import { verifyToken, signToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    try {
        const { code } = await request.json();
        if (!code) {
            return NextResponse.json({ error: 'Falta el código de verificación' }, { status: 400 });
        }

        const cookieStore = await cookies();
        const otpSession = cookieStore.get('otp_session')?.value;

        if (!otpSession) {
            return NextResponse.json({ error: 'La sesión expiró. Vuelve a intentar.' }, { status: 401 });
        }

        const payload = await verifyToken(otpSession);
        if (!payload || !payload.partner_id || !payload.b2b || !payload.otp) {
            return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });
        }

        // Verificar si el código ingresado coincide con el OTP guardado en el JWT
        if (payload.otp !== code) {
            return NextResponse.json({ error: 'Código incorrecto. Verifica el mensaje de WhatsApp.' }, { status: 401 });
        }

        // Código correcto: Crear sesión válida de 7 días borrando el OTP temporal
        const sessionToken = await signToken({ partner_id: payload.partner_id, b2b: true, source: 'pwa_canal_tradicional' });

        cookieStore.set('session', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7 // 7 days
        });

        // Borrar la cookie temporal de OTP
        cookieStore.delete('otp_session');

        return NextResponse.json({ success: true, redirect: '/catalog' });

    } catch (error: any) {
        console.error('Verify Code Error:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
