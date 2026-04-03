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

    const { cart_lines } = await request.json();

    if (!cart_lines || !Array.isArray(cart_lines) || cart_lines.length === 0) {
      return NextResponse.json({ error: 'Carrito vacío' }, { status: 400 });
    }

    const productIds = cart_lines.map((l: any) => l.product_id);

    // Verificar productos en Odoo: existencia, precio real, stock disponible
    const products = await callKw('product.product', 'search_read', [
      [['id', 'in', productIds], ['sale_ok', '=', true]]
    ], {
      fields: ['id', 'name', 'lst_price', 'list_price', 'qty_available'],
    });

    const productMap: Record<number, any> = {};
    for (const p of products) {
      productMap[p.id] = p;
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

      const serverPrice = product.lst_price || product.list_price || 0;
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
      fields: ['credit_limit', 'credit'],
      limit: 1
    });

    const partner = partnerData[0];
    const creditAvailable = partner ? (partner.credit_limit - partner.credit) : 0;

    const serverSubtotal = validated_lines.reduce((acc, l) => acc + l.server_price * l.qty, 0);
    const serverTotal = Math.round(serverSubtotal * 1.16 * 100) / 100;

    return NextResponse.json({
      valid: issues.length === 0,
      issues,
      validated_lines,
      server_subtotal: serverSubtotal,
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
