import { NextResponse } from 'next/server';
import { callKw } from '@/lib/odoo';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const sessionCookie = (await cookies()).get('session')?.value;
    if (!sessionCookie) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const payload = await verifyToken(sessionCookie);
    if (!payload?.partner_id || !payload.b2b) return NextResponse.json({ error: 'Token B2B invÃ¡lido' }, { status: 401 });

    const { cart_lines, delivery_date, delivery_schedule, payment_method, notes } = await request.json();

    if (!cart_lines || cart_lines.length === 0) {
      return NextResponse.json({ error: 'Carrito vacÃ­o' }, { status: 400 });
    }

    const partnerId = payload.partner_id;

    // 1. Obtener datos frescos del partner
    const partnerData = await callKw('res.partner', 'search_read', [[['id', '=', partnerId]]], {
      fields: ['name', 'credit_limit', 'credit', 'property_payment_term_id', 'property_product_pricelist', 'user_id'],
      limit: 1
    });

    if (!partnerData.length) return NextResponse.json({ error: 'Partner no encontrado' }, { status: 404 });
    const partner = partnerData[0];

    // 2. Definir Pricelist y Payment Term
    const pricelistId = partner.property_product_pricelist ? partner.property_product_pricelist[0] : 81; // 81 = Fallback

    // El B2B usa el payment term de su ficha SOLO si seleccionÃ³ credito activo, si no es inmediato.
    let paymentTermId = false;
    if (payment_method === 'credito' && partner.property_payment_term_id) {
      paymentTermId = partner.property_payment_term_id[0];
    }

    // 3. Crear el formato `order_line` [(0, 0, {...})]
    const odooOrderLines = cart_lines.map((l: any) => {
      let nameWithNote = l.name;
      if (l.note && l.note.trim() !== "") nameWithNote += `\nInstrucciÃ³n Comercial: ${l.note}`;

      return [0, 0, {
        product_id: l.product_id,
        product_uom_qty: l.qty,
        price_unit: l.price,
        name: nameWithNote
      }];
    });

    // 4. Calcular importes transaccionales (simulados en back) para evaluar riesgo crediticio
    const subtotal = cart_lines.reduce((tot: number, item: any) => tot + (item.price * item.qty), 0);
    const total_con_iva = subtotal * 1.16;

    const credito_disponible = partner.credit_limit - partner.credit;
    const supera_credito = total_con_iva > credito_disponible;

    // 5. Crear la CotizaciÃ³n (sale.order) en Draft
    const orderFormat = {
      partner_id: partnerId,
      company_id: 34,
      pricelist_id: pricelistId,
      payment_term_id: paymentTermId,
      x_studio_canal_origen: "pwa_canal_tradicional",
      x_studio_horario_de_entrega_solicitado: delivery_schedule,
      commitment_date: `${delivery_date} 12:00:00`,
      note: notes,
      order_line: odooOrderLines,
    };

    const orderId = await callKw('sale.order', 'create', [orderFormat]);

    // Obtener el Nombre (Name) SO generado
    const orderInfo = await callKw('sale.order', 'search_read', [[['id', '=', orderId]]], {
      fields: ['name'], limit: 1
    });
    const orderName = orderInfo[0]?.name || `ID-${orderId}`;

    // 6. Regla de ConfirmaciÃ³n AutomÃ¡tica
    let finalStatus = "draft";
    if (partner.credit_limit > 0 && !supera_credito && payment_method === 'credito') {
      // Tienen crÃ©dito activo y el pedido entra perfecto -> Se auto confirma a sales order.
      await callKw('sale.order', 'action_confirm', [[orderId]]);
      finalStatus = "confirmed";
    }

    // 7. Notificar n8n Ejecutivo Comercial (Webhook W04b o genÃ©rico configurado)
    const webhookUrl = process.env.N8N_WEBHOOK_URL_B2B || process.env.N8N_WEBHOOK_URL;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: "cotizacion_b2b",
          order_id: orderId,
          order_name: orderName,
          partner_name: partner.name,
          partner_id: partnerId,
          total: total_con_iva,
          supera_credito: supera_credito,
          ejecutivo_id: partner.user_id ? partner.user_id[0] : null,
          canal: "pwa_canal_tradicional"
        })
      }).catch(e => console.error("Error al enviar N8N Webhook transaccional: ", e));
    }

    // 8. Output a Front-End
    return NextResponse.json({
      order_id: orderId,
      order_name: orderName,
      status: finalStatus,
      total_con_iva: total_con_iva,
      credito_disponible: credito_disponible,
      supera_credito: supera_credito,
      ejecutivo_nombre: partner.user_id ? partner.user_id[1] : 'Ejecutivo no asignado',
      ejecutivo_id: partner.user_id ? partner.user_id[0] : null
    });

  } catch (error) {
    console.error('B2B Create Order error:', error);
    return NextResponse.json({ error: 'Error del servidor al crear Ã³rden en Odoo' }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
