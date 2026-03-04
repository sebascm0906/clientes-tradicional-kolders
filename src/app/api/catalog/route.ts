import { NextResponse } from 'next/server';
import { callKw } from '@/lib/odoo';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  try {
    const sessionCookie = (await cookies()).get('session')?.value;
    if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await verifyToken(sessionCookie);
    if (!payload?.partner_id || !payload?.b2b) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const partnerId = payload.partner_id;

    const url = new URL(request.url);
    const categoryName = url.searchParams.get('category');

    // 1. Conseguir la Pricelist_ID del partner para darle el precio correcto
    const partnerData = await callKw('res.partner', 'search_read', [[['id', '=', partnerId]]], {
      fields: ['property_product_pricelist'], limit: 1
    });

    let pricelistId = 81; // ID fallback de Public Pricelist B2B
    if (partnerData.length > 0 && partnerData[0].property_product_pricelist) {
      pricelistId = partnerData[0].property_product_pricelist[0];
    }

    // 2. Traer productos publicables
    let domain: any[] = [['sale_ok', '=', true], ['is_published', '=', true], ['qty_available', '>', 0]];

    if (categoryName && categoryName !== 'Todas') {
      domain.push(['public_categ_ids.name', '=', categoryName]);
    }

    const items = await callKw('product.template', 'search_read', [domain], {
      fields: ['id', 'name', 'default_code', 'uom_id', 'packaging_ids', 'qty_available', 'sale_line_warn_msg'],
      limit: 100
    });

    // 3. Evaluar los precios transaccionales mapeando con la lista de precios B2B (RPC for product.pricelist get_product_price)
    // Odoo 18 no tiene un read simple en product.template para listas ajenas. 
    // Llamaremos al mÃ©todo especializado del objeto de lista de precios, pasando producto y cantidad = 1
    const pricedItems = await Promise.all(items.map(async (item: any) => {

      let price = 0;
      try {
        // Obtenemos su variante id (product.product)
        const productVariant = await callKw('product.product', 'search_read', [[['product_tmpl_id', '=', item.id]]], { fields: ['id'], limit: 1 });
        if (productVariant.length > 0) {
          const priceResult = await callKw('product.pricelist', '_get_product_price', [
            [pricelistId],
            paramMap(productVariant[0].id),
            1.0,
            paramMap(partnerId)
          ]);
          price = priceResult;
        }
      } catch (e) {
        console.log("No price config for item", item.id);
      }

      // Parsear packaging hints (cajas maestras)
      let boxSize = 1;
      if (item.packaging_ids && item.packaging_ids.length > 0) {
        const packs = await callKw('product.packaging', 'search_read', [[['id', 'in', item.packaging_ids]]], { fields: ['qty'], limit: 1 });
        if (packs.length > 0) boxSize = packs[0].qty;
      }

      return {
        id: item.id,
        name: item.name,
        sku: item.default_code,
        price: price || 0,
        uom: item.uom_id ? item.uom_id[1] : 'pza',
        boxSize: boxSize,
        stock: item.qty_available,
        warning: item.sale_line_warn_msg
      };
    }));

    return NextResponse.json(pricedItems);

  } catch (error) {
    console.error('Catalog API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Odoo 18 _get_product_price param wrapper for positional flexibility
function paramMap(val: any) {
  return val;
}

export const dynamic = "force-dynamic";
