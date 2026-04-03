/**
 * KOLD Odoo JSON-RPC Client
 * Handles authentication and calls to Odoo 18
 */

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USER = process.env.ODOO_SERVICE_USER;
const ODOO_PASS = process.env.ODOO_SERVICE_PASSWORD;

if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_PASS) {
  console.warn("ADVERTENCIA: Faltan variables de entorno ODOO_ en este servidor.");
}

let sessionId: string | null = null;
let sessionCreatedAt: number = 0;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutos

function isSessionValid(): boolean {
  return !!sessionId && (Date.now() - sessionCreatedAt) < SESSION_TTL_MS;
}

export async function authenticate(): Promise<string> {
  if (isSessionValid()) return sessionId!;

  // Forzar nueva autenticación
  sessionId = null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${ODOO_URL}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: { db: ODOO_DB, login: ODOO_USER, password: ODOO_PASS }
      }),
      signal: controller.signal
    });

    const data = await response.json();
    if (data.error) throw new Error(`Odoo Auth Error: ${data.error.message || JSON.stringify(data.error)}`);

    const setCookie = response.headers.get('set-cookie');
    const sessionMatch = setCookie?.match(/session_id=([^;]+)/);
    if (sessionMatch) {
      sessionId = sessionMatch[1];
      sessionCreatedAt = Date.now();
      return sessionId;
    }
    throw new Error('Failed to retrieve session_id from Odoo');
  } finally {
    clearTimeout(timeout);
  }
}

export async function callKw(model: string, method: string, args: any[], kwargs: any = {}) {
  let sid = await authenticate();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    let response = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `session_id=${sid}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: { model, method, args, kwargs }
      }),
      signal: controller.signal
    });

    let data = await response.json();

    // Si la sesión expiró en Odoo, re-autenticar una vez y reintentar
    if (data.error && JSON.stringify(data.error).includes('Session')) {
      sessionId = null;
      sid = await authenticate();

      const retryController = new AbortController();
      const retryTimeout = setTimeout(() => retryController.abort(), 30000);
      try {
        response = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `session_id=${sid}`
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'call',
            params: { model, method, args, kwargs }
          }),
          signal: retryController.signal
        });
        data = await response.json();
      } finally {
        clearTimeout(retryTimeout);
      }
    }

    if (data.error) {
      console.error(`Odoo RPC Error [${model}.${method}]:`, data.error?.data?.message || JSON.stringify(data.error));
      throw new Error(`Error en operación Odoo`);
    }
    return data.result;
  } finally {
    clearTimeout(timeout);
  }
}
