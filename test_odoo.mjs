import { config } from 'dotenv';
config({ path: '.env.local' });

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USER = process.env.ODOO_SERVICE_USER;
const ODOO_PASS = process.env.ODOO_SERVICE_PASSWORD;

async function run() {
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
  const setCookie = response.headers.get('set-cookie');
  const sessionMatch = setCookie?.match(/session_id=([^;]+)/);
  const sid = sessionMatch ? sessionMatch[1] : null;

  // Let's search broadly for ANY contact containing this sequence
  const searchDomain = [
    '|', '|', '|',
    ['mobile', 'ilike', '4436930710'],
    ['phone', 'ilike', '4436930710'],
    ['mobile', 'ilike', '%443%693%0710%'],
    ['phone', 'ilike', '%443%693%0710%']
  ];

  const callRes = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session_id=${sid}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { 
        model: 'res.partner', 
        method: 'search_read', 
        args: [searchDomain], 
        kwargs: { fields: ['id', 'name', 'mobile', 'phone', 'company_type', 'parent_id', 'type'], limit: 10 } 
      }
    })
  });
  
  const callData = await callRes.json();
  console.log("CallData:", JSON.stringify(callData, null, 2));

  // Also specifically fetch Liceo del Valle to see what phone number it ACTUALLY has
  const liceoDomain = [['name', 'ilike', 'Liceo del Valle']];
  const liceoRes = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session_id=${sid}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { 
        model: 'res.partner', 
        method: 'search_read', 
        args: [liceoDomain], 
        kwargs: { fields: ['id', 'name', 'mobile', 'phone', 'company_type', 'type'], limit: 5 } 
      }
    })
  });
  const liceoData = await liceoRes.json();
  console.log("LiceoData:", JSON.stringify(liceoData, null, 2));
}
run().catch(console.error);
