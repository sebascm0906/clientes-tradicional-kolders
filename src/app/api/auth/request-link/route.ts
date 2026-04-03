import { NextResponse } from 'next/server';
import { callKw } from '@/lib/odoo';
import { signToken, hashOtp } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { phone } = await request.json();
    if (!phone) {
      return NextResponse.json({ error: 'Número no válido' }, { status: 400 });
    }

    // Limpiar formato a internacional
    let formattedPhone = phone.replace(/\D/g, '');
    let localPhone = formattedPhone.slice(-10); // Los ultimos 10 digitos siempre
    let mxPhone = `52${localPhone}`;

    // Validar que son 10 dígitos numéricos válidos
    if (!/^[1-9]\d{9}$/.test(localPhone)) {
      return NextResponse.json({ error: 'Formato de número inválido. Ingresa 10 dígitos.' }, { status: 400 });
    }

    formattedPhone = mxPhone;

    // Buscar el partner en Odoo con diferentes combinaciones posibles
    const likePattern = `%${localPhone.split('').join('%')}%`;

    const searchDomain = [
      '|', '|', '|',
      ['mobile', 'ilike', likePattern],
      ['phone', 'ilike', likePattern],
      ['mobile', 'ilike', localPhone],
      ['phone', 'ilike', localPhone]
    ];

    const partners = await callKw(
      'res.partner',
      'search_read',
      [searchDomain],
      { fields: ['id', 'name', 'mobile', 'customer_rank', 'company_type', 'property_product_pricelist', 'property_payment_term_id', 'credit_limit', 'credit'], limit: 1 }
    );

    let partner = partners[0];

    // Validación B2B Exclusiva — mensaje genérico para evitar enumeración
    if (!partner || partner.company_type !== "company") {
      return NextResponse.json({
        error: 'Número no registrado como cuenta empresarial B2B. Si eres distribuidor, contacta a ventas KOLD.',
        b2b_locked: true
      }, { status: 403 });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = hashOtp(otpCode);

    // Token temporal con OTP hasheado — no se puede extraer el código del JWT
    const loginToken = await signToken(
      { partner_id: partner.id, b2b: true, phone: formattedPhone, otp_hash: otpHash },
      "10m"
    );

    const magicLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth?token=${loginToken}`;

    // Enviar a N8N — webhook de auth separado
    const n8nUrl = process.env.N8N_WEBHOOK_AUTH || process.env.N8N_WEBHOOK_URL_B2B || process.env.N8N_WEBHOOK_URL;
    if (n8nUrl) {
      try {
        await fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: formattedPhone,
            name: partner.name,
            magic_link: magicLink,
            codigo: otpCode,
            code: otpCode,
            canal_origen: process.env.NEXT_PUBLIC_CANAL_ORIGEN || "pwa_canal_tradicional"
          })
        });
      } catch (webhookError) {
        console.error('Error enviando webhook N8N (OTP):', webhookError);
      }
    }

    // Guardar cookie temporal para validar el OTP en el siguiente request
    const { cookies } = await import("next/headers");
    (await cookies()).set('otp_session', loginToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10 // 10 minutos
    });

    return NextResponse.json({
      message: 'Si el número es correcto, recibirás un WhatsApp con tu enlace de acceso.',
    });

  } catch (error: any) {
    console.error('Request Link Error:', error);
    return NextResponse.json({
      error: 'Error procesando solicitud. Intenta nuevamente.'
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
