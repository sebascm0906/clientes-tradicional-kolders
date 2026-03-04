/**
 * KOLD Odoo JSON-RPC Client
 * Handles authentication and calls to Odoo 18 Staging
 */

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USER = process.env.ODOO_SERVICE_USER;
const ODOO_PASS = process.env.ODOO_SERVICE_PASSWORD;

if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_PASS) {
  console.warn("ADVERTENCIA: Faltan variables de entorno ODOO_ en este servidor.");
}

let sessionId: string | null = null;

export async function authenticate() {
  if (sessionId) return sessionId;

  const response = await fetch(`${ODOO_URL}/web/session/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { db: ODOO_DB, login: ODOO_USER, password: ODOO_PASS }
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(`Odoo Auth Error: ${JSON.stringify(data.error)}`);

  const setCookie = response.headers.get('set-cookie');
  const sessionMatch = setCookie?.match(/session_id=([^;]+)/);
  if (sessionMatch) {
    sessionId = sessionMatch[1];
    return sessionId;
  }
  throw new Error('Failed to retrieve session_id from Odoo');
}

export async function callKw(model: string, method: string, args: any[], kwargs: any = {}) {
  const sid = await authenticate();

  const response = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session_id=${sid}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { model, method, args, kwargs }
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(`Odoo RPC Error: ${JSON.stringify(data.error)}`);
  return data.result;
}
