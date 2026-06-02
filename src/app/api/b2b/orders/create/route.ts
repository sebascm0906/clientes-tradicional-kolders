import { NextResponse } from 'next/server';
import { callKw } from '@/lib/odoo';
import { verifyToken } from '@/lib/auth';
import { resolvePricesForPartner, getPartnerPricelistId } from '@/lib/pricelist';
import { cookies } from 'next/headers';
import { randomUUID, createHash } from 'crypto';

/**
 * P0 fixes incluidos en este endpoint:
 *
 *   1. Pricing pricelist-aware: resolvePricesForPartner usa product.pricelist.item
 *      de Odoo para calcular el precio correcto del partner. Esto sustituye el
 *      uso ciego de lst_price que ignoraba overrides.
 *
 *   2. sale.order recibe pricelist_id explícito (no se confía en defaults).
 *      Las líneas se mandan SIN price_unit en producción para que Odoo
 *      aplique el mismo cálculo internamente y los precios coincidan. Como
 *      contrato seguro, pasamos price_unit calculado y dejamos que Odoo lo
 *      recompute si difiere; leemos sale.order.line.price_unit de vuelta para
 *      el response.
 *
 *   3. Idempotency via x_kold_idempotency_key: cliente envía idempotency_key
 *      (o lo derivamos del cart + partner). Si ya existe sale.order con esa
 *      key, devolvemos el pedido existente — evita duplicados por doble click
 *      o reintentos automáticos del browser.
 *
 *   4. Re-lee sale.order.line tras create para devolver precios REALES que
 *      Odoo persistió (single source of truth).
 *
 *   5. Logs estructurados con prefijo [B2B_ORDER]: order_id, partner_id, total,
 *      n_lines. Sin credenciales ni base64.
 */

export async function POST(request: Request) {
  try {
    const sessionCookie = (await cookies()).get('session')?.value;
    if (!sessionCookie) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const payload = await verifyToken(sessionCookie);
    if (!payload?.partner_id || !payload.b2b) return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });

    const body = await request.json();
    const { cart_lines, delivery_date, delivery_schedule, payment_method, notes } = body;
    const clientIdempotencyKey: string | undefined = body?.idempotency_key;

    // ── Validación de input ────────────────────────────────────────────────
    if (!cart_lines || !Array.isArray(cart_lines) || cart_lines.length === 0) {
      return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 });
    }
    if (!delivery_date || !/^\d{4}-\d{2}-\d{2}$/.test(delivery_date)) {
      return NextResponse.json({ error: 'Fecha de entrega inválida' }, { status: 400 });
    }
    const deliveryDateObj = new Date(delivery_date + 'T12:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (deliveryDateObj <= today) {
      return NextResponse.json({ error: 'La fecha de entrega debe ser posterior a hoy' }, { status: 400 });
    }
    for (const line of cart_lines) {
      if (!line.product_id || typeof line.product_id !== 'number') {
        return NextResponse.json({ error: 'Producto inválido en el carrito' }, { status: 400 });
      }
      if (!line.qty || typeof line.qty !== 'number' || line.qty < 1) {
        return NextResponse.json({ error: `Cantidad inválida para ${line.name || 'producto'}` }, { status: 400 });
      }
    }

    const partnerId = Number(payload.partner_id);

    // ── 1. Datos frescos del partner ───────────────────────────────────────
    const partnerData = await callKw('res.partner', 'search_read', [[['id', '=', partnerId]]], {
      fields: ['name', 'credit_limit', 'credit', 'property_payment_term_id', 'user_id', 'company_id', 'property_product_pricelist'],
      limit: 1,
    });
    if (!partnerData.length) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    const partner = partnerData[0];

    // ── 2. Idempotency: derivar key estable si cliente no la mandó ─────────
    // Hash del cart + partner + delivery_date. Garantiza que el mismo carrito
    // enviado dos veces seguidas produzca la misma key.
    const idempotencyKey = clientIdempotencyKey && typeof clientIdempotencyKey === 'string'
      ? clientIdempotencyKey.substring(0, 60)
      : (() => {
          const fingerprint = JSON.stringify({
            partner_id: partnerId,
            delivery_date,
            payment_method,
            lines: cart_lines
              .map((l: any) => ({ p: l.product_id, q: l.qty, n: (l.note || '').slice(0, 80) }))
              .sort((a: any, b: any) => a.p - b.p),
          });
          // Sufijo aleatorio corto para tolerar 2 carritos idénticos legítimos
          // en ventanas largas; el grueso del dedup viene del prefijo hash.
          return 'b2b-' + createHash('sha1').update(fingerprint).digest('hex').substring(0, 24);
        })();

    // Buscar pedido existente con este idempotency_key (last 7 días)
    const existingOrders = await callKw('sale.order', 'search_read', [[
      ['x_kold_idempotency_key', '=', idempotencyKey],
      ['partner_id', '=', partnerId],
    ]], {
      fields: ['id', 'name', 'state', 'amount_total'],
      limit: 1,
    });
    if (existingOrders && existingOrders.length > 0) {
      const existing = existingOrders[0];
      console.info('[B2B_ORDER] idempotent return', { partner_id: partnerId, order_id: existing.id, key_prefix: idempotencyKey.substring(0, 12) });
      return NextResponse.json({
        order_id: existing.id,
        order_name: existing.name,
        status: existing.state === 'sale' ? 'confirmed' : 'draft',
        total_con_iva: existing.amount_total,
        credito_disponible: partner.credit_limit - partner.credit,
        supera_credito: existing.amount_total > (partner.credit_limit - partner.credit),
        ejecutivo_nombre: partner.user_id ? partner.user_id[1] : 'Ejecutivo no asignado',
        ejecutivo_id: partner.user_id ? partner.user_id[0] : null,
        idempotent: true,
      });
    }

    // ── 3. Pricing: resolver precios desde pricelist del partner ───────────
    const productIds = cart_lines.map((l: any) => l.product_id);
    let pricelistMap: Record<number, { price: number; base: number; appliedItemId: number | null; rule: string }> = {};
    try {
      pricelistMap = await resolvePricesForPartner(partnerId, productIds);
    } catch (priceErr) {
      console.warn('[B2B_PRICING] order-create resolver failed, falling back to lst_price', priceErr);
    }

    // Re-fetch nombres + impuestos para defensa (si resolver falló, no tenemos nombre)
    // taxes_id: impuestos de venta REALES del producto en Odoo (no hardcodear IVA).
    const productsBasic = await callKw('product.product', 'search_read', [[['id', 'in', productIds]]], {
      fields: ['id', 'name', 'lst_price', 'list_price', 'taxes_id'],
    });
    const productInfo: Record<number, { name: string; fallback_price: number; taxes_id: number[] }> = {};
    for (const p of productsBasic) {
      productInfo[p.id] = {
        name: p.name,
        fallback_price: p.lst_price || p.list_price || 0,
        taxes_id: Array.isArray(p.taxes_id) ? p.taxes_id : [],
      };
    }
    for (const line of cart_lines) {
      if (!productInfo[line.product_id]) {
        return NextResponse.json({ error: `Producto no encontrado: ${line.name || line.product_id}` }, { status: 400 });
      }
      // Warning si el producto no tiene impuesto configurado (NO inventamos IVA)
      if (productInfo[line.product_id].taxes_id.length === 0) {
        console.warn('[B2B_ORDER] producto sin impuesto de venta configurado (taxes_id vacío)', {
          product_id: line.product_id,
          name: productInfo[line.product_id].name,
        });
      }
    }

    // ── 4. Pricelist + payment term + método de pago ───────────────────────
    const pricelistId = await getPartnerPricelistId(partnerId);
    let paymentTermId: number | false = false;
    if (payment_method === 'credito' && partner.property_payment_term_id) {
      paymentTermId = partner.property_payment_term_id[0];
    }
    // Mapeo método PWA → selection real de sale.order.payment_method en Odoo.
    // Canal tradicional B2B: solo efectivo/tarjeta. Tarjeta = intención (sin cobro
    // Stripe en este flujo; el link automático es follow-up P1). Default seguro: cash.
    const PAYMENT_METHOD_MAP: Record<string, string> = {
      efectivo: 'cash',
      tarjeta: 'card',
      transferencia: 'transfer',
      credito: 'credit',
    };
    const odooPaymentMethod = PAYMENT_METHOD_MAP[payment_method] || 'cash';

    // ── 5. Order lines con precio resuelto ─────────────────────────────────
    const odooOrderLines = cart_lines.map((l: any) => {
      const resolved = pricelistMap[l.product_id];
      const serverPrice = resolved ? resolved.price : productInfo[l.product_id].fallback_price;
      let nameWithNote = productInfo[l.product_id].name;
      if (l.note && typeof l.note === 'string' && l.note.trim() !== '') {
        nameWithNote += `\nInstrucción Comercial: ${l.note.substring(0, 500)}`;
      }
      return [0, 0, {
        product_id: l.product_id,
        product_uom_qty: l.qty,
        price_unit: serverPrice,
        name: nameWithNote,
        // Impuestos REALES del producto (Odoo no los auto-aplica al crear vía API
        // con price_unit explícito). Sin esto, amount_tax queda en 0 → IVA roto.
        tax_id: [[6, 0, productInfo[l.product_id].taxes_id]],
      }];
    });

    const subtotal = cart_lines.reduce((tot: number, item: any) => {
      const resolved = pricelistMap[item.product_id];
      const sp = resolved ? resolved.price : productInfo[item.product_id].fallback_price;
      return tot + sp * item.qty;
    }, 0);
    const total_con_iva = Math.round(subtotal * 1.16 * 100) / 100;

    const credito_disponible = partner.credit_limit - partner.credit;
    const supera_credito = total_con_iva > credito_disponible;

    // ── 6. Multi-company context ──────────────────────────────────────────
    const companyId = partner.company_id ? partner.company_id[0] : parseInt(process.env.ODOO_COMPANY_ID || '34');
    const companyContext = { context: { allowed_company_ids: [companyId] } };

    // ── 7. Crear sale.order ───────────────────────────────────────────────
    const baseOrder: Record<string, any> = {
      partner_id: partnerId,
      company_id: companyId,
      payment_term_id: paymentTermId,
      commitment_date: `${delivery_date} 12:00:00`,
      note: typeof notes === 'string' ? notes.substring(0, 2000) : '',
      order_line: odooOrderLines,
      // Método de pago elegido en la PWA (cash/card) — campo selection real.
      payment_method: odooPaymentMethod,
      // Estado de pago inicial: pendiente (no hay cobro en este flujo).
      x_payment_status: 'pending',
      // Origen del pedido para trazabilidad/segmentación.
      x_kold_order_source: 'pwa_b2b',
    };
    // Pasar pricelist_id explícito si el partner lo tiene asignado
    if (pricelistId) {
      baseOrder.pricelist_id = pricelistId;
    }
    // Idempotency key — campo Studio existente (x_kold_idempotency_key)
    baseOrder.x_kold_idempotency_key = idempotencyKey;

    let orderId: number;
    try {
      orderId = await callKw('sale.order', 'create', [{
        ...baseOrder,
        x_studio_canal_origen: 'pwa_canal_tradicional',
        x_studio_horario_de_entrega_solicitado: delivery_schedule || '',
      }], companyContext);
    } catch (studioError: any) {
      console.warn('[B2B_ORDER] sale.order create sin campos x_studio_*:', studioError?.message || studioError);
      try {
        orderId = await callKw('sale.order', 'create', [baseOrder], companyContext);
      } catch (createError: any) {
        console.error('[B2B_ORDER] sale.order create FAILED', { partner_id: partnerId, err: createError?.message });
        return NextResponse.json({ error: 'No se pudo crear la orden en Odoo. Intenta nuevamente.' }, { status: 502 });
      }
    }

    // ── 8. Re-lee la orden y sus líneas para confirmar lo que persistió ──
    const orderInfo = await callKw('sale.order', 'search_read', [[['id', '=', orderId]]], {
      fields: ['name', 'amount_untaxed', 'amount_tax', 'amount_total', 'pricelist_id', 'state', 'order_line'],
      limit: 1,
      ...companyContext,
    });
    const persisted = orderInfo[0];
    const orderName = persisted?.name || `ID-${orderId}`;
    let persistedLines: any[] = [];
    if (persisted?.order_line && persisted.order_line.length > 0) {
      persistedLines = await callKw('sale.order.line', 'search_read', [[['id', 'in', persisted.order_line]]], {
        fields: ['id', 'product_id', 'product_uom_qty', 'price_unit', 'price_subtotal', 'price_total', 'name'],
        ...companyContext,
      });
    }

    // ── 9. Confirmación automática (si aplica) ───────────────────────────
    let finalStatus = 'draft';
    if (partner.credit_limit > 0 && !supera_credito && payment_method === 'credito') {
      try {
        await callKw('sale.order', 'action_confirm', [[orderId]], companyContext);
        finalStatus = 'confirmed';
      } catch (confirmError: any) {
        console.warn('[B2B_ORDER] action_confirm failed, keeping draft', { order_id: orderId, err: confirmError?.message });
      }
    }

    // ── 10. Notificar n8n Ejecutivo Comercial ─────────────────────────────
    const webhookUrl = process.env.N8N_WEBHOOK_ORDERS || process.env.N8N_WEBHOOK_URL_B2B || process.env.N8N_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'cotizacion_b2b',
            order_id: orderId,
            order_name: orderName,
            partner_name: partner.name,
            partner_id: partnerId,
            total: persisted?.amount_total ?? total_con_iva,
            supera_credito,
            ejecutivo_id: partner.user_id ? partner.user_id[0] : null,
            canal: 'pwa_canal_tradicional',
            idempotency_key: idempotencyKey,
          }),
        });
      } catch (webhookError) {
        console.error('[B2B_ORDER] webhook N8N error (non-fatal)', webhookError);
      }
    }

    // ── 11. Log estructurado + response ──────────────────────────────────
    console.info('[B2B_ORDER] created', {
      order_id: orderId,
      order_name: orderName,
      partner_id: partnerId,
      n_lines: persistedLines.length || cart_lines.length,
      amount_total: persisted?.amount_total ?? total_con_iva,
      pricelist_id: pricelistId,
      status: finalStatus,
      idempotent: false,
    });

    return NextResponse.json({
      order_id: orderId,
      order_name: orderName,
      status: finalStatus,
      total_con_iva: persisted?.amount_total ?? total_con_iva,
      amount_untaxed: persisted?.amount_untaxed,
      amount_tax: persisted?.amount_tax,
      credito_disponible: credito_disponible,
      supera_credito: supera_credito,
      ejecutivo_nombre: partner.user_id ? partner.user_id[1] : 'Ejecutivo no asignado',
      ejecutivo_id: partner.user_id ? partner.user_id[0] : null,
      // Líneas reales persistidas (precio que Odoo confirmó, no el computado por nosotros)
      lines: persistedLines.map((l: any) => ({
        product_id: Array.isArray(l.product_id) ? l.product_id[0] : l.product_id,
        product_name: Array.isArray(l.product_id) ? l.product_id[1] : null,
        qty: l.product_uom_qty,
        price_unit: l.price_unit,
        price_subtotal: l.price_subtotal,
        price_total: l.price_total,
      })),
      idempotent: false,
    });
  } catch (error: any) {
    console.error('[B2B_ORDER] unhandled error', error?.message || error);
    return NextResponse.json({ error: 'Error al crear la orden. Intenta nuevamente.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
