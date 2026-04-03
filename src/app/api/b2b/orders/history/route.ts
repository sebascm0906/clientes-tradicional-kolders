import { NextResponse } from 'next/server';
import { callKw } from '@/lib/odoo';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value;
    if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await verifyToken(sessionCookie);
    if (!payload?.partner_id || !payload.b2b) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    // Intentar con filtro x_studio_canal_origen, fallback sin él
    let orders: any[];
    try {
      orders = await callKw('sale.order', 'search_read', [
         [['partner_id', '=', payload.partner_id], ['state', 'in', ['draft', 'sent', 'sale', 'done', 'cancel']], ['x_studio_canal_origen', 'in', ['pwa_canal_tradicional', 'botpress']]]
      ], {
         fields: ['name', 'amount_total', 'state', 'date_order', 'commitment_date', 'invoice_status', 'payment_term_id'],
         order: 'date_order desc',
         limit: 30
      });
    } catch (studioError) {
      // Fallback — sin filtro de canal (campo x_studio_* no existe aún)
      orders = await callKw('sale.order', 'search_read', [
         [['partner_id', '=', payload.partner_id], ['state', 'in', ['draft', 'sent', 'sale', 'done', 'cancel']]]
      ], {
         fields: ['name', 'amount_total', 'state', 'date_order', 'commitment_date', 'invoice_status', 'payment_term_id'],
         order: 'date_order desc',
         limit: 30
      });
    }

    // Usar allSettled para que un fallo en una orden no mate toda la lista
    const results = await Promise.allSettled(orders.map(async (o: any) => {
         const lines = await callKw('sale.order.line', 'search_read', [
             [['order_id', '=', o.id]]
         ], { fields: ['product_id', 'product_uom_qty', 'price_unit', 'name', 'product_uom'] });

         return {
             ...o,
             lines: lines.map((l: any) => ({
                 product_id: l.product_id[0],
                 qty: l.product_uom_qty,
                 price: l.price_unit,
                 name: l.name,
                 uom: l.product_uom ? l.product_uom[1] : 'Unidad'
             }))
         };
    }));

    const detailedOrders = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value);

    return NextResponse.json(detailedOrders);

  } catch (error) {
    console.error('History API Error:', error);
    return NextResponse.json({ error: 'Error cargando historial de pedidos' }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
