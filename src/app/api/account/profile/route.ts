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
      payment_term: partner.property_payment_term_id ? { id: partner.property_payment_term_id[0], name: partner.property_payment_term_id[1] } : null
    });

  } catch (error) {
    console.error('Profile API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
