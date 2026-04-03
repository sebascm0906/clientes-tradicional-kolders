import { NextResponse } from 'next/server';
import { callKw } from '@/lib/odoo';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

/**
 * Mapeo comercial de categ_id (categoría interna de Odoo) a familia + subgrupo.
 * Basado en la estructura real: PRODUCTO TERMINADO / {tipo} / {subtipo} / {marca}
 *
 * Reglas de negocio Canal Tradicional:
 *  - Si la ruta contiene "LAURITA" → familia LAURITA
 *  - Si la ruta contiene "GENERI" (GENERICA/GENERICO) → familia LAURITA (barras/molido sin marca)
 *  - Si la ruta contiene "KOLD" → familia KOLD
 *  - Resto → familia OTROS
 */
function classifyProduct(categPath: string): { family_key: string; family_label: string; subgroup_key: string; subgroup_label: string; sort_order: number } {
  const path = (categPath || '').toUpperCase();

  // --- LAURITA ---
  if (path.includes('LAURITA')) {
    if (path.includes('ROLITO')) return { family_key: 'LAURITA', family_label: 'Laurita', subgroup_key: 'ROLITO', subgroup_label: 'Bolsa de Hielo Rolito', sort_order: 10 };
    return { family_key: 'LAURITA', family_label: 'Laurita', subgroup_key: 'OTROS', subgroup_label: 'Otros Laurita', sort_order: 19 };
  }

  // --- GENÉRICA (barras, molido) → comercialmente Laurita ---
  if (path.includes('GENERI') || (path.includes('BARRA') && !path.includes('KOLD'))) {
    if (path.includes('BARRA')) return { family_key: 'LAURITA', family_label: 'Laurita', subgroup_key: 'BARRAS', subgroup_label: 'Barras de Hielo', sort_order: 11 };
    if (path.includes('MOLIDO')) return { family_key: 'LAURITA', family_label: 'Laurita', subgroup_key: 'MOLIDO', subgroup_label: 'Hielo Molido', sort_order: 12 };
    return { family_key: 'LAURITA', family_label: 'Laurita', subgroup_key: 'OTROS', subgroup_label: 'Otros Hielo', sort_order: 19 };
  }

  if (path.includes('MOLIDO') && !path.includes('KOLD')) {
    return { family_key: 'LAURITA', family_label: 'Laurita', subgroup_key: 'MOLIDO', subgroup_label: 'Hielo Molido', sort_order: 12 };
  }

  // --- KOLD ---
  if (path.includes('KOLD') || path.includes('CUP') || path.includes('SMUTHIE') || path.includes('SORBET') || path.includes('SNACK')) {
    if (path.includes('CUP')) return { family_key: 'KOLD', family_label: 'Kold', subgroup_key: 'CUP', subgroup_label: 'Kold Cup', sort_order: 20 };
    if (path.includes('SMUTHIE')) return { family_key: 'KOLD', family_label: 'Kold', subgroup_key: 'SMUTHIE', subgroup_label: 'Kold Smoothie', sort_order: 21 };
    if (path.includes('SORBET')) return { family_key: 'KOLD', family_label: 'Kold', subgroup_key: 'SORBET', subgroup_label: 'Kold Sorbet', sort_order: 22 };
    if (path.includes('SNACK') || path.includes('FRUIT')) return { family_key: 'KOLD', family_label: 'Kold', subgroup_key: 'SNACK', subgroup_label: 'Kold Snack & Fruits', sort_order: 23 };
    if (path.includes('ROLITO') || path.includes('HIELO')) return { family_key: 'KOLD', family_label: 'Kold', subgroup_key: 'HIELO', subgroup_label: 'Hielo Kold', sort_order: 24 };
    return { family_key: 'KOLD', family_label: 'Kold', subgroup_key: 'OTROS', subgroup_label: 'Otros Kold', sort_order: 29 };
  }

  // --- OTROS ---
  return { family_key: 'OTROS', family_label: 'Otros', subgroup_key: 'GENERAL', subgroup_label: 'General', sort_order: 90 };
}

export async function GET() {
  try {
    const sessionCookie = (await cookies()).get('session')?.value;
    if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await verifyToken(sessionCookie);
    if (!payload?.partner_id || !payload?.b2b) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    // Canal Tradicional: traer TODOS los productos vendibles con stock
    // No filtrar por is_published — el catálogo B2B incluye barras/molido no publicados en web
    const domain: any[] = [['sale_ok', '=', true], ['qty_available', '>', 0]];

    const items = await callKw('product.product', 'search_read', [domain], {
      fields: ['id', 'name', 'default_code', 'categ_id', 'uom_id', 'packaging_ids', 'qty_available', 'sale_line_warn_msg', 'lst_price', 'list_price'],
      limit: 200
    });

    // Filtrar solo PRODUCTO TERMINADO (excluir materias primas, insumos, etc.)
    const ptItems = items.filter((item: any) => {
      const categ = item.categ_id ? item.categ_id[1] : '';
      return categ.toUpperCase().startsWith('PRODUCTO TERMINADO');
    });

    // Resolver packaging en batch
    const packagingIds = ptItems.flatMap((item: any) => item.packaging_ids || []);
    let packagingMap: Record<number, number> = {};
    if (packagingIds.length > 0) {
      const packs = await callKw('product.packaging', 'search_read', [[['id', 'in', packagingIds]]], {
        fields: ['id', 'qty', 'product_id']
      });
      for (const p of packs) {
        if (p.product_id) packagingMap[p.product_id[0]] = p.qty;
      }
    }

    // Obtener rutas completas de categorías para clasificación precisa
    const categIds = [...new Set(ptItems.map((item: any) => item.categ_id?.[0]).filter(Boolean))];
    let categPathMap: Record<number, string> = {};
    if (categIds.length > 0) {
      const cats = await callKw('product.category', 'search_read', [[['id', 'in', categIds]]], {
        fields: ['id', 'complete_name']
      });
      for (const c of cats) {
        categPathMap[c.id] = c.complete_name;
      }
    }

    const catalogItems = ptItems.map((item: any) => {
      const categId = item.categ_id?.[0] || 0;
      const categPath = categPathMap[categId] || item.categ_id?.[1] || '';
      const classification = classifyProduct(categPath);

      return {
        id: item.id,
        name: item.name,
        sku: item.default_code || null,
        price: Math.round((item.lst_price || item.list_price || 0) * 100) / 100,
        uom: item.uom_id ? item.uom_id[1] : 'pza',
        boxSize: packagingMap[item.id] || 1,
        stock: item.qty_available,
        warning: item.sale_line_warn_msg,
        family_key: classification.family_key,
        family_label: classification.family_label,
        subgroup_key: classification.subgroup_key,
        subgroup_label: classification.subgroup_label,
        sort_order: classification.sort_order,
      };
    });

    // Extraer peso en KG del nombre para ordenar productos por tamaño
    function extractWeight(name: string): number {
      const match = name.match(/\((\d+(?:\.\d+)?)\s*KG\)/i);
      return match ? parseFloat(match[1]) : 999;
    }

    // Ordenar: familia → subgrupo → peso (menor a mayor) → nombre
    catalogItems.sort((a: any, b: any) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      const wa = extractWeight(a.name);
      const wb = extractWeight(b.name);
      if (wa !== wb) return wa - wb;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json(catalogItems);

  } catch (error) {
    console.error('Catalog API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
