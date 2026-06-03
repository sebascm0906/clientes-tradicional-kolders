import { NextResponse } from 'next/server';
import { callKw } from '@/lib/odoo';
import { verifyToken } from '@/lib/auth';
import { resolvePricesForPartner } from '@/lib/pricelist';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const sessionCookie = (await cookies()).get('session')?.value;
    if (!sessionCookie) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const payload = await verifyToken(sessionCookie);
    if (!payload?.partner_id || !payload.b2b) return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });

    const { cart_lines } = await request.json();

    if (!cart_lines || !Array.isArray(cart_lines) || cart_lines.length === 0) {
      return NextResponse.json({ error: 'Carrito vacío' }, { status: 400 });
    }

    const productIds = cart_lines.map((l: any) => l.product_id);

    // Verificar productos en Odoo: existencia, precio real, stock disponible
    const products = await callKw('product.product', 'search_read', [
      [['id', 'in', productIds], ['sale_ok', '=', true]]
    ], {
      fields: ['id', 'name', 'lst_price', 'list_price', 'qty_available', 'taxes_id'],
    });

    const productMap: Record<number, any> = {};
    for (const p of products) {
      productMap[p.id] = p;
    }

    // ── IVA real por producto (fuente de verdad Odoo, filtrado por compañía) ──
    // No asumir 16%: mismo criterio que /api/catalog y /api/b2b/orders/create.
    const allTaxIds: number[] = Array.from(new Set(products.flatMap((p: any) => p.taxes_id || [])));
    const taxInfoMap: Record<number, { amount: number; company: number | false }> = {};
    if (allTaxIds.length > 0) {
      try {
        const taxRows = await callKw('account.tax', 'search_read', [[['id', 'in', allTaxIds]]], {
          fields: ['id', 'amount', 'company_id'],
        });
        for (const t of taxRows) {
          taxInfoMap[t.id] = { amount: t.amount || 0, company: t.company_id ? t.company_id[0] : false };
        }
      } catch (taxErr) {
        console.warn('[B2B_PRICING] cart-validate: no se pudo leer impuestos', taxErr);
      }
    }

    // ── P0 FIX: revalidar precios usando pricelist del partner ──
    // El catálogo ya usa pricelist; aquí re-validamos por si el item cambió
    // entre catálogo y checkout (race con cambio de pricelist en Odoo).
    let pricelistMap: Record<number, { price: number; base: number; appliedItemId: number | null; rule: string }> = {};
    try {
      pricelistMap = await resolvePricesForPartner(Number(payload.partner_id), productIds);
    } catch (priceErr) {
      console.warn('[B2B_PRICING] cart-validate resolver failed', priceErr);
      for (const p of products) {
        const base = p.lst_price || p.list_price || 0;
        pricelistMap[p.id] = { price: base, base, appliedItemId: null, rule: 'fallback_lst_price' };
      }
    }

    const issues: any[] = [];
    const validated_lines: any[] = [];

    for (const line of cart_lines) {
      const product = productMap[line.product_id];

      if (!product) {
        issues.push({
          product_id: line.product_id,
          name: line.name,
          type: 'not_found',
          message: `Producto "${line.name}" ya no está disponible`
        });
        continue;
      }

      const resolved = pricelistMap[line.product_id];
      const serverPrice = resolved ? resolved.price : (product.lst_price || product.list_price || 0);
      const priceDiff = Math.abs(serverPrice - line.price);
      const priceChanged = priceDiff > 0.01;

      if (product.qty_available < line.qty) {
        issues.push({
          product_id: line.product_id,
          name: product.name,
          type: 'stock',
          message: `"${product.name}" solo tiene ${Math.floor(product.qty_available)} disponibles (pediste ${line.qty})`,
          available: Math.floor(product.qty_available)
        });
      }

      if (priceChanged) {
        issues.push({
          product_id: line.product_id,
          name: product.name,
          type: 'price_changed',
          message: `El precio de "${product.name}" cambió de $${line.price.toFixed(2)} a $${serverPrice.toFixed(2)}`,
          old_price: line.price,
          new_price: serverPrice
        });
      }

      validated_lines.push({
        product_id: line.product_id,
        name: product.name,
        qty: line.qty,
        server_price: serverPrice,
        stock_available: product.qty_available,
        price_changed: priceChanged
      });
    }

    // Obtener crédito actualizado
    const partnerData = await callKw('res.partner', 'search_read', [[['id', '=', payload.partner_id]]], {
      fields: ['credit_limit', 'credit', 'company_id'],
      limit: 1
    });

    const partner = partnerData[0];
    const creditAvailable = partner ? (partner.credit_limit - partner.credit) : 0;
    const partnerCompanyId: number | false = partner?.company_id ? partner.company_id[0] : false;

    // Tasa real de impuesto del producto = suma de % de impuestos válidos para la compañía
    // del partner (impuesto global o de su empresa). Productos sin IVA → 0 (NO se asume 16%).
    const taxRateForProduct = (taxes: number[] | undefined): number => {
      let rate = 0;
      for (const tid of taxes || []) {
        const info = taxInfoMap[tid];
        if (info && (info.company === false || info.company === partnerCompanyId)) rate += info.amount;
      }
      return rate;
    };

    const serverSubtotal = validated_lines.reduce((acc, l) => acc + l.server_price * l.qty, 0);
    const serverTax = validated_lines.reduce((acc, l) => {
      const taxes = productMap[l.product_id]?.taxes_id;
      return acc + l.server_price * l.qty * (taxRateForProduct(taxes) / 100);
    }, 0);
    const serverSubtotalR = Math.round(serverSubtotal * 100) / 100;
    const serverTaxR = Math.round(serverTax * 100) / 100;
    const serverTotal = Math.round((serverSubtotal + serverTax) * 100) / 100;

    return NextResponse.json({
      valid: issues.length === 0,
      issues,
      validated_lines,
      server_subtotal: serverSubtotalR,
      server_tax: serverTaxR,
      server_total: serverTotal,
      credit_available: creditAvailable,
      exceeds_credit: serverTotal > creditAvailable
    });

  } catch (error) {
    console.error('Cart Validate Error:', error);
    return NextResponse.json({ error: 'Error validando carrito' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
