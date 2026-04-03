import { NextResponse } from 'next/server';
import { callKw } from '@/lib/odoo';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const sessionCookie = (await cookies()).get('session')?.value;
    if (!sessionCookie) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const payload = await verifyToken(sessionCookie);
    if (!payload?.partner_id || !payload.b2b) return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });

    const { cart_lines, delivery_date, delivery_schedule, payment_method, notes } = await request.json();

    // Validación de input
    if (!cart_lines || !Array.isArray(cart_lines) || cart_lines.length === 0) {
      return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 });
    }

    // Validar fecha de entrega
    if (!delivery_date || !/^\d{4}-\d{2}-\d{2}$/.test(delivery_date)) {
      return NextResponse.json({ error: 'Fecha de entrega inválida' }, { status: 400 });
    }
    const deliveryDateObj = new Date(delivery_date + 'T12:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (deliveryDateObj <= today) {
      return NextResponse.json({ error: 'La fecha de entrega debe ser posterior a hoy' }, { status: 400 });
    }

    // Validar cada línea del carrito
    for (const line of cart_lines) {
      if (!line.product_id || typeof line.product_id !== 'number') {
        return NextResponse.json({ error: 'Producto inválido en el carrito' }, { status: 400 });
      }
      if (!line.qty || typeof line.qty !== 'number' || line.qty < 1) {
        return NextResponse.json({ error: `Cantidad inválida para ${line.name || 'producto'}` }, { status: 400 });
      }
    }

    const partnerId = payload.partner_id;

    // 1. Obtener datos frescos del partner
    const partnerData = await callKw('res.partner', 'search_read', [[['id', '=', partnerId]]], {
      fields: ['name', 'credit_limit', 'credit', 'property_payment_term_id', 'user_id', 'company_id'],
      limit: 1
    });

    if (!partnerData.length) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    const partner = partnerData[0];

    // 2. Verificar precios reales desde Odoo
    const productIds = cart_lines.map((l: any) => l.product_id);
    const products = await callKw('product.product', 'search_read', [[['id', 'in', productIds]]], {
      fields: ['id', 'lst_price', 'list_price', 'name'],
    });

    const productPriceMap: Record<number, { price: number; name: string }> = {};
    for (const p of products) {
      productPriceMap[p.id] = { price: p.lst_price || p.list_price || 0, name: p.name };
    }

    // Validar que todos los productos existen y precios son razonables
    for (const line of cart_lines) {
      const serverProduct = productPriceMap[line.product_id];
      if (!serverProduct) {
        return NextResponse.json({ error: `Producto no encontrado: ${line.name || line.product_id}` }, { status: 400 });
      }
      // Usar precio real del servidor, no el del cliente
    }

    // 3. Definir Payment Term (no pasar pricelist_id — Odoo auto-asigna desde partner)
    let paymentTermId = false;
    if (payment_method === 'credito' && partner.property_payment_term_id) {
      paymentTermId = partner.property_payment_term_id[0];
    }

    // 4. Crear el formato order_line con precios REALES del servidor
    const odooOrderLines = cart_lines.map((l: any) => {
      const serverPrice = productPriceMap[l.product_id]?.price || l.price;
      let nameWithNote = productPriceMap[l.product_id]?.name || l.name;
      if (l.note && typeof l.note === 'string' && l.note.trim() !== "") {
        nameWithNote += `\nInstrucción Comercial: ${l.note.substring(0, 500)}`;
      }

      return [0, 0, {
        product_id: l.product_id,
        product_uom_qty: l.qty,
        price_unit: serverPrice,
        name: nameWithNote
      }];
    });

    // 5. Calcular importes con precios reales
    const subtotal = cart_lines.reduce((tot: number, item: any) => {
      const serverPrice = productPriceMap[item.product_id]?.price || item.price;
      return tot + (serverPrice * item.qty);
    }, 0);
    const total_con_iva = Math.round(subtotal * 1.16 * 100) / 100;

    const credito_disponible = partner.credit_limit - partner.credit;
    const supera_credito = total_con_iva > credito_disponible;

    // 6. Company context para multi-company Odoo
    const companyId = partner.company_id ? partner.company_id[0] : parseInt(process.env.ODOO_COMPANY_ID || '34');
    const companyContext = { context: { allowed_company_ids: [companyId] } };

    // 7. Crear la Cotización (sale.order) en Draft
    const baseOrder: Record<string, any> = {
      partner_id: partnerId,
      company_id: companyId,
      payment_term_id: paymentTermId,
      commitment_date: `${delivery_date} 12:00:00`,
      note: typeof notes === 'string' ? notes.substring(0, 2000) : '',
      order_line: odooOrderLines,
    };

    let orderId: number;
    try {
      // Intentar con campos x_studio_* (existen si Odoo Studio los tiene)
      orderId = await callKw('sale.order', 'create', [{
        ...baseOrder,
        x_studio_canal_origen: "pwa_canal_tradicional",
        x_studio_horario_de_entrega_solicitado: delivery_schedule || '',
      }], companyContext);
    } catch (studioError) {
      // Fallback sin campos studio
      console.warn('sale.order create sin campos x_studio_*:', studioError);
      orderId = await callKw('sale.order', 'create', [baseOrder], companyContext);
    }

    // Obtener el Name (SO) generado
    const orderInfo = await callKw('sale.order', 'search_read', [[['id', '=', orderId]]], {
      fields: ['name'], limit: 1, ...companyContext
    });
    const orderName = orderInfo[0]?.name || `ID-${orderId}`;

    // 8. Regla de Confirmación Automática
    let finalStatus = "draft";
    if (partner.credit_limit > 0 && !supera_credito && payment_method === 'credito') {
      await callKw('sale.order', 'action_confirm', [[orderId]], companyContext);
      finalStatus = "confirmed";
    }

    // 9. Notificar n8n Ejecutivo Comercial — webhook de órdenes separado
    const webhookUrl = process.env.N8N_WEBHOOK_ORDERS || process.env.N8N_WEBHOOK_URL_B2B || process.env.N8N_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
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
        });
      } catch (webhookError) {
        console.error("Error al enviar webhook N8N (orden):", webhookError);
      }
    }

    // 10. Response
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

  } catch (error: any) {
    console.error('B2B Create Order error:', error?.message || error);
    return NextResponse.json({ error: 'Error al crear la orden. Intenta nuevamente.' }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
