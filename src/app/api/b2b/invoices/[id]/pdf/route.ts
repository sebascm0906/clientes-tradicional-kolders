import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { callKw } from '@/lib/odoo';

const ODOO_URL = process.env.ODOO_URL;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionCookie = (await cookies()).get('session')?.value;
    if (!sessionCookie) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const payload = await verifyToken(sessionCookie);
    if (!payload?.partner_id || !payload.b2b) {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
    }

    const { id } = await params;
    const invoiceId = parseInt(id);
    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: 'ID de factura inválido' }, { status: 400 });
    }

    // Verificar que la factura pertenece al partner autenticado
    const invoices = await callKw('account.move', 'search_read', [
      [['id', '=', invoiceId], ['partner_id', '=', payload.partner_id], ['move_type', '=', 'out_invoice']]
    ], {
      fields: ['id', 'name'],
      limit: 1
    });

    if (!invoices.length) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    }

    // Obtener session_id de Odoo para hacer el proxy del PDF
    const { authenticate } = await import('@/lib/odoo');
    const sid = await authenticate();

    // Odoo report PDF endpoint: /report/pdf/account.report_invoice/{id}
    const pdfUrl = `${ODOO_URL}/report/pdf/account.report_invoice/${invoiceId}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const pdfResponse = await fetch(pdfUrl, {
        headers: {
          'Cookie': `session_id=${sid}`
        },
        signal: controller.signal
      });

      if (!pdfResponse.ok) {
        console.error(`Odoo PDF error: ${pdfResponse.status} for invoice ${invoiceId}`);
        return NextResponse.json({ error: 'No se pudo generar el PDF' }, { status: 502 });
      }

      const pdfBuffer = await pdfResponse.arrayBuffer();
      const invoiceName = invoices[0].name || `factura-${invoiceId}`;

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${invoiceName}.pdf"`,
          'Cache-Control': 'private, max-age=300',
        },
      });
    } finally {
      clearTimeout(timeout);
    }

  } catch (error) {
    console.error('Invoice PDF Error:', error);
    return NextResponse.json({ error: 'Error al obtener el PDF' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
