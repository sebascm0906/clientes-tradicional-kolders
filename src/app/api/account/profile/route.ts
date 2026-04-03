import { NextResponse } from 'next/server';
import { callKw } from '@/lib/odoo';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const sessionCookie = (await cookies()).get('session')?.value;
    if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await verifyToken(sessionCookie);
    if (!payload?.partner_id) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const partnerId = payload.partner_id;

    const data = await callKw('res.partner', 'search_read', [
      [['id', '=', partnerId]]
    ], {
      fields: ['name', 'mobile', 'vat', 'email', 'street', 'property_product_pricelist', 'credit_limit', 'credit', 'user_id', 'property_payment_term_id'],
      limit: 1
    });

    if (!data.length) return NextResponse.json({ error: 'Partner not found' }, { status: 404 });

    const partner = data[0];

    // Obtener teléfono real del ejecutivo de ventas para WA dinámico
    let executivePhone = null;
    if (partner.user_id) {
      try {
        const users = await callKw('res.users', 'search_read', [
          [['id', '=', partner.user_id[0]]]
        ], {
          fields: ['partner_id'],
          limit: 1
        });

        if (users.length && users[0].partner_id) {
          const execPartner = await callKw('res.partner', 'search_read', [
            [['id', '=', users[0].partner_id[0]]]
          ], {
            fields: ['mobile', 'phone'],
            limit: 1
          });

          if (execPartner.length) {
            const rawPhone = execPartner[0].mobile || execPartner[0].phone;
            if (rawPhone) {
              executivePhone = rawPhone.replace(/\D/g, '');
              if (executivePhone.length === 10) executivePhone = `52${executivePhone}`;
              if (!executivePhone.startsWith('52')) executivePhone = `52${executivePhone}`;
            }
          }
        }
      } catch (e) {
        console.error('Error fetching executive phone:', e);
      }
    }

    return NextResponse.json({
      id: partner.id,
      name: partner.name,
      mobile: partner.mobile,
      vat: partner.vat,
      address: partner.street,
      pricelist: partner.property_product_pricelist ? { id: partner.property_product_pricelist[0], name: partner.property_product_pricelist[1] } : null,
      credit_limit: partner.credit_limit || 0,
      credit_used: partner.credit || 0,
      executive: partner.user_id ? partner.user_id[1] : 'Ejecutivo KOLD',
      executive_phone: executivePhone,
      payment_term: partner.property_payment_term_id ? { id: partner.property_payment_term_id[0], name: partner.property_payment_term_id[1] } : null
    });

  } catch (error) {
    console.error('Profile API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
