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

/**
 * Mapa prefijo de Unidad de Negocio ([XXX] en x_analytic_un_id) → CEDIS (stock.warehouse).
 * Verificado en Odoo 2026-06-04 contra la cobertura real de partners de la compañía 34.
 * TODO(config): mover este mapa a configuración Odoo (p.ej. un campo warehouse en la
 *   cuenta analítica) para no hardcodearlo en código.
 */
const PLAZA_PREFIX_TO_WAREHOUSE: Record<string, number> = {
  '[GDL]': 94,   // CEDIS Guadalajara
  '[IGU]': 89,   // CEDIS Iguala
  '[MRL]': 120,  // CEDIS Morelia
  '[TOL]': 90,   // CEDIS Toluca
  '[CUER]': 97,  // CEDIS Cuernavaca
  '[CDMX]': 98,  // CEDIS Ciudad de México
  '[MAN]': 123,  // CEDIS Manzanillo
  '[ZIH]': 99,   // CEDIS Zihuatanejo
};

/**
 * Resuelve el almacén (warehouse_id) de un partner de forma DETERMINÍSTICA y auditable.
 *
 * Dos campos maestros DISTINTOS en res.partner:
 *   • `x_analytic_un_id` ("Unidad de Negocio", cuenta analítica, ej. "[GDL] Guadalajara")
 *     = la PLAZA / CEDIS COMERCIAL del cliente (a qué unidad de negocio pertenece).
 *   • `x_warehouse_id` ("Almacén / CEDIS Asignado")
 *     = el ALMACÉN / CEDIS OPERATIVO-LOGÍSTICO desde el que se surte.
 *
 * Regla (sin invención):
 *   1. Si `x_warehouse_id` está poblado → se usa (almacén operativo explícito). source: x_warehouse_id
 *   2. Si no, se resuelve por el prefijo [XXX] de `x_analytic_un_id` (plaza comercial)
 *      mapeado a su CEDIS. source: x_analytic_un_id:[XXX]
 *   3. Si no se puede resolver → null + warning. NO se inventa almacén: el pedido se crea
 *      SIN warehouse_id y el error/default de Odoo queda VISIBLE (no se oculta con reintentos).
 *
 * NO se usa company_id como fallback (equivaldría al default CEDIS Iguala, justo lo que
 * queremos evitar para clientes de otras plazas).
 *
 * NOTA: la autoconfirmación (action_confirm / picking) sigue BLOQUEADA hasta que el
 * warehouse/plaza estén correctos en los partners y exista el gate de validaciones. Este
 * resolver solo asigna el almacén del pedido en estado draft.
 */
function resolveWarehouseForPartner(
  partner: { x_warehouse_id?: [number, string] | false; x_analytic_un_id?: [number, string] | false }
): { warehouseId: number | null; source: string; warning?: string } {
  // 1. Campo explícito de almacén operativo.
  const wh = partner?.x_warehouse_id;
  if (Array.isArray(wh) && typeof wh[0] === 'number') {
    return { warehouseId: wh[0], source: 'x_warehouse_id' };
  }
  // 2. Unidad de negocio / plaza comercial (cuenta analítica) → mapeo por prefijo.
  const un = partner?.x_analytic_un_id;
  if (Array.isArray(un) && typeof un[1] === 'string') {
    const m = un[1].match(/^\s*(\[[^\]]+\])/);
    const prefix = m ? m[1].toUpperCase() : '';
    if (prefix && PLAZA_PREFIX_TO_WAREHOUSE[prefix]) {
      return { warehouseId: PLAZA_PREFIX_TO_WAREHOUSE[prefix], source: `x_analytic_un_id:${prefix}` };
    }
    return { warehouseId: null, source: 'unresolved', warning: `unidad de negocio sin mapeo de almacén: ${un[1]}` };
  }
  // 3. No resoluble.
  return { warehouseId: null, source: 'unresolved', warning: 'partner sin x_warehouse_id ni x_analytic_un_id' };
}

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
      fields: ['name', 'credit_limit', 'credit', 'property_payment_term_id', 'user_id', 'company_id', 'property_product_pricelist', 'x_warehouse_id', 'x_analytic_un_id'],
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

    // ── Idempotencia (robusta) ─────────────────────────────────────────────
    // x_kold_idempotency_key tiene un UNIQUE constraint GLOBAL en Odoo. La key se
    // deriva de forma determinística (partner+fecha+pago+líneas), así que un doble
    // submit del mismo carrito produce la MISMA key → si dos requests corren en
    // paralelo, el pre-check de ambos no ve nada, ambos crean, y el segundo choca
    // contra el constraint → 502. Esa carrera es la causa real del 502 observado.
    //
    //   • Buscamos por la key SOLA (sin filtrar partner y SIN estrechar compañía:
    //     la sesión de servicio ya ve todas las compañías, igual que el constraint
    //     global). El pre-check anterior filtraba por partner, lo que dejaba pasar
    //     colisiones de keys enviadas por el cliente entre partners distintos.
    //   • Si existe y es del mismo partner → replay (200, idempotent_replay).
    //   • Si existe pero es de OTRO partner → conflicto controlado (409), sin crear.
    const isIdempotencyError = (e: any) => /idempotenc|llave de idempotencia/i.test(e?.message || '');
    const lookupIdempotent = async () => {
      const rows = await callKw('sale.order', 'search_read',
        [[['x_kold_idempotency_key', '=', idempotencyKey]]],
        { fields: ['id', 'name', 'state', 'amount_total', 'partner_id'], limit: 1 });
      return rows && rows.length ? rows[0] : null;
    };
    const idempotentReplay = (ex: any, phase: string) => {
      console.info(`[B2B_IDEMPOTENCY] ${phase}`, { partner_id: partnerId, order_id: ex.id, order_name: ex.name });
      return NextResponse.json({
        idempotent_replay: true,
        order_id: ex.id,
        order_name: ex.name,
        state: ex.state,
        status: ex.state === 'sale' ? 'confirmed' : 'draft',
        total_con_iva: ex.amount_total,
        amount_total: ex.amount_total,
        credito_disponible: partner.credit_limit - partner.credit,
        supera_credito: ex.amount_total > (partner.credit_limit - partner.credit),
        ejecutivo_nombre: partner.user_id ? partner.user_id[1] : 'Ejecutivo no asignado',
        ejecutivo_id: partner.user_id ? partner.user_id[0] : null,
      });
    };
    const idempotentCollision = () => {
      // No exponer datos del otro pedido/partner.
      console.warn('[B2B_IDEMPOTENCY] collision different partner', { partner_id: partnerId, key_prefix: idempotencyKey.substring(0, 12) });
      return NextResponse.json({ error: 'No se pudo procesar el pedido por un conflicto de referencia. Vuelve a generar el carrito e intenta de nuevo.' }, { status: 409 });
    };

    const preexisting = await lookupIdempotent();
    if (preexisting) {
      console.info('[B2B_IDEMPOTENCY] precheck found existing order', { partner_id: partnerId, order_id: preexisting.id });
      const exPartner = preexisting.partner_id ? preexisting.partner_id[0] : null;
      if (exPartner && exPartner !== partnerId) return idempotentCollision();
      return idempotentReplay(preexisting, 'replay returned');
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

    // ── 4. Compañía + pricelist + payment term + método de pago ────────────
    const companyId = partner.company_id ? partner.company_id[0] : parseInt(process.env.ODOO_COMPANY_ID || '34');
    const pricelistId = await getPartnerPricelistId(partnerId);

    // Validar que la pricelist del partner sea de la compañía de la orden (o global).
    // Si es de otra compañía, NO la pasamos (rompería el create) — Odoo auto-asigna
    // la pricelist por defecto de la compañía. Se loguea para corrección en Odoo.
    let pricelistIdForOrder: number | false = false;
    if (pricelistId) {
      try {
        const plRows = await callKw('product.pricelist', 'read', [[pricelistId]], { fields: ['id', 'company_id'] });
        const plCompany = plRows[0]?.company_id ? plRows[0].company_id[0] : false;
        if (!plCompany || plCompany === companyId) {
          pricelistIdForOrder = pricelistId;
        } else {
          console.warn('[B2B_PRICING] pricelist_company_mismatch — pricelist de otra compañía; Odoo auto-asignará la default', {
            partner_id: partnerId, pricelist_id: pricelistId, pricelist_company: plCompany, order_company: companyId,
          });
        }
      } catch (plErr: any) {
        console.warn('[B2B_PRICING] no se pudo validar compañía de pricelist', { pricelist_id: pricelistId, err: plErr?.message });
      }
    }

    let paymentTermId: number | false = false;
    if (payment_method === 'credito' && partner.property_payment_term_id) {
      paymentTermId = partner.property_payment_term_id[0];
    }
    // Mapeo método PWA → selection real de sale.order.payment_method en Odoo.
    const PAYMENT_METHOD_MAP: Record<string, string> = {
      efectivo: 'cash',
      tarjeta: 'card',
      transferencia: 'transfer',
      credito: 'credit',
    };
    const odooPaymentMethod = PAYMENT_METHOD_MAP[payment_method] || 'cash';

    // ── 4b. Impuestos válidos por producto (filtrados por compañía) ─────────
    // NO copiamos impuestos de otra compañía (rompen el create) NI forzamos IVA 16%.
    // Solo pasamos impuestos cuya compañía sea la de la orden o globales. Si no hay
    // válidos, NO mandamos tax_id → Odoo decide según su configuración fiscal real.
    const allTaxIds = Array.from(new Set(Object.values(productInfo).flatMap((p) => p.taxes_id)));
    const taxCompanyMap: Record<number, number | false> = {};
    if (allTaxIds.length) {
      try {
        const taxRows = await callKw('account.tax', 'read', [allTaxIds], { fields: ['id', 'company_id'] });
        for (const t of taxRows) {
          taxCompanyMap[t.id] = t.company_id ? t.company_id[0] : false;
        }
      } catch (taxErr: any) {
        console.warn('[B2B_ORDER] no se pudo leer compañías de impuestos', { err: taxErr?.message });
      }
    }
    const validTaxIdsByProduct: Record<number, number[]> = {};
    for (const [pidStr, info] of Object.entries(productInfo)) {
      const pid = Number(pidStr);
      const valid = info.taxes_id.filter((tid) => {
        const c = taxCompanyMap[tid];
        return c === false || c === undefined || c === companyId;
      });
      validTaxIdsByProduct[pid] = valid;
      if (info.taxes_id.length > 0 && valid.length === 0) {
        console.warn('[B2B_ORDER] tax_mismatch_data_error — producto con impuesto de otra compañía; se omite tax_id (corregir en Odoo)', {
          product_id: pid, name: info.name, product_taxes: info.taxes_id, order_company: companyId,
        });
      }
    }

    // ── 5. Order lines — precio e impuesto los resuelve Odoo (fuente de verdad) ──
    // NO pasamos price_unit: Odoo lo computa desde la pricelist de la orden.
    // tax_id: solo impuestos válidos de la compañía; si no hay, se omite (no se inventa).
    const odooOrderLines = cart_lines.map((l: any) => {
      let nameWithNote = productInfo[l.product_id].name;
      if (l.note && typeof l.note === 'string' && l.note.trim() !== '') {
        nameWithNote += `\nInstrucción Comercial: ${l.note.substring(0, 500)}`;
      }
      const lineVals: Record<string, any> = {
        product_id: l.product_id,
        product_uom_qty: l.qty,
        name: nameWithNote,
      };
      const validTaxes = validTaxIdsByProduct[l.product_id] || [];
      if (validTaxes.length) {
        lineVals.tax_id = [[6, 0, validTaxes]];
      }
      return [0, 0, lineVals];
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
    const companyContext = { context: { allowed_company_ids: [companyId] } };

    // ── 6b. Resolver almacén del cliente (warehouse_id) ───────────────────
    // Sin esto, Odoo asigna el almacén default de la compañía (CEDIS Iguala) a TODOS
    // los pedidos PWA, aunque el cliente sea de otra plaza. Esto NO confirma el pedido
    // ni crea picking: solo deja el pedido (draft) en el almacén correcto.
    const { warehouseId, source: warehouseSource, warning: warehouseWarning } = resolveWarehouseForPartner(partner);
    console.info('[B2B_WAREHOUSE]', {
      partner_id: partnerId,
      company_id: companyId,
      warehouse_id: warehouseId,
      source: warehouseSource,
    });
    if (!warehouseId) {
      console.warn('[B2B_WAREHOUSE] almacén NO resuelto → Odoo usará el default de la compañía (no se inventa). Poblar x_warehouse_id o x_analytic_un_id en Odoo.', { partner_id: partnerId, reason: warehouseWarning });
    }

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
    // Pasar pricelist_id SOLO si es de la compañía de la orden (validado arriba).
    // Si es de otra compañía, se omite → Odoo auto-asigna la default de la compañía.
    if (pricelistIdForOrder) {
      baseOrder.pricelist_id = pricelistIdForOrder;
    }
    // Almacén del cliente SOLO si se resolvió desde x_warehouse_id (no inventar).
    // Si es null, se omite y Odoo usa el default de compañía (comportamiento actual).
    if (warehouseId) {
      baseOrder.warehouse_id = warehouseId;
    }
    // Idempotency key — campo Studio existente (x_kold_idempotency_key)
    baseOrder.x_kold_idempotency_key = idempotencyKey;

    // createOrder: intenta con campos x_studio_*; si Odoo NO los acepta, reintenta
    // SIN ellos. PERO si el error es de idempotencia (unique constraint), NO reintenta:
    // ese fallback solo repetiría el mismo error. Se maneja como replay más abajo.
    const createOrder = async (order: Record<string, any>): Promise<number> => {
      try {
        return await callKw('sale.order', 'create', [{
          ...order,
          x_studio_canal_origen: 'pwa_canal_tradicional',
          x_studio_horario_de_entrega_solicitado: delivery_schedule || '',
        }], companyContext);
      } catch (studioError: any) {
        if (isIdempotencyError(studioError)) throw studioError;
        console.warn('[B2B_ORDER] sale.order create sin campos x_studio_*:', studioError?.message || studioError);
        return await callKw('sale.order', 'create', [order], companyContext);
      }
    };

    let orderId: number;
    try {
      orderId = await createOrder(baseOrder);
    } catch (createError: any) {
      // Carrera: la key se insertó entre el pre-check y el create (o el pre-check no la
      // vio). Re-buscamos por la key; si ya existe la devolvemos como replay — no es un
      // error real. Solo si NO aparece reportamos error (controlado, nunca 500/502 mudo).
      if (isIdempotencyError(createError)) {
        const raced = await lookupIdempotent();
        if (raced) {
          const exPartner = raced.partner_id ? raced.partner_id[0] : null;
          if (exPartner && exPartner !== partnerId) return idempotentCollision();
          return idempotentReplay(raced, 'race recovered');
        }
      }
      console.error('[B2B_ORDER] sale.order create FAILED', { partner_id: partnerId, err: createError?.message });
      return NextResponse.json({ error: 'No se pudo crear la orden en Odoo. Intenta nuevamente.' }, { status: 502 });
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
