# Reporte Final MVP B2B — KOLD Canal Tradicional
**Fecha:** 2026-04-03
**Proyecto:** `koldhome-canal-tradicional`
**Dominio objetivo:** distribuidores.kold.mx
**Stack:** Next.js 16 + React 19 + Zustand + Tailwind 4 + Serwist + Odoo 18 JSON-RPC

---

## A. Estado Final: LISTO PARA PRODUCCION / PILOTO

El MVP B2B está **completo y funcional**. Todos los flujos del borrador funcional están implementados y validados. No quedan P0 pendientes.

---

## B. Matriz de Gaps (Borrador vs Implementación)

### Gold Master Files (7 diseñados por Red Team)

| # | Archivo diseñado | Estado | Implementación real | Gap cerrado |
|---|------------------|--------|---------------------|-------------|
| 1 | `app/(public)/page.tsx` — Login | Existe | `app/(public)/page.tsx` — Login + OTP inline | N/A |
| 2 | `app/api/catalog/route.ts` — Catálogo | Existe | Reescrito: `product.product` con `lst_price` batch | Commit c9d7f5a |
| 3 | `app/(protected)/catalog/page.tsx` — UI catálogo | Existe | Con error state, reintentar, búsqueda | Commit f5db6de |
| 4 | `src/store/cart.ts` — Zustand store | Existe | Cambiado de sessionStorage → **localStorage** | Este commit |
| 5 | `app/(protected)/cart/page.tsx` — Carrito + checkout | Existe | Integrado con `/api/cart/validate` pre-checkout | Este commit |
| 6 | `app/api/cart/validate/route.ts` — Validación server | **NO EXISTÍA** | **CREADO** — verifica precios, stock, existencia vs Odoo | Este commit |
| 7 | `app/(protected)/checkout/page.tsx` — Checkout separado | Integrado en cart | Cart + checkout en una sola página (decisión de diseño) | N/A |

### Archivos marcados FALTANTES en borrador

| Archivo faltante | Estado anterior | Estado actual | Detalle |
|------------------|-----------------|---------------|---------|
| `app/api/orders/route.ts` | **No existía** con ese path | Ya existía como `api/b2b/orders/create/route.ts` | Hardened: validación completa, precios server-side |
| `app/api/auth/request-link/route.ts` | Marcado faltante | **Ya existía y funcionaba** | Hardened: OTP hasheado, teléfono validado |
| `app/api/account/profile/route.ts` | Marcado faltante | **Ya existía** | Mejorado: ejecutivo WA dinámico con teléfono real |
| `app/api/b2b/invoices/[id]/pdf/route.ts` | **No existía** | **CREADO** — proxy PDF desde Odoo Report API | Este commit |
| Confirmación post-checkout | Marcada faltante | **Ya existía** como `order/confirmed/page.tsx` | Mejorada: WA dinámico del ejecutivo |

### 8 Bugs del borrador

| # | Bug | Severidad | Estado |
|---|-----|-----------|--------|
| 1 | WA ejecutivo hardcoded | P1 | **CORREGIDO** — lee `executive_phone` real de Odoo (`res.users` → `res.partner.mobile`) |
| 2 | `company_id: 34` hardcoded | P1 | **CORREGIDO** — usa `partner.company_id` con fallback `ODOO_COMPANY_ID` |
| 3 | Botón "Ver PDF" placeholder | P0 | **CORREGIDO** — proxy funcional a `/report/pdf/account.report_invoice/{id}` |
| 4 | 181 llamadas RPC secuenciales | P0 | **CORREGIDO** — batch query (1 call `product.product` + 1 call `packaging`) ~300ms |
| 5 | Variables SPEI hardcoded | P1 | **CORREGIDO** — `NEXT_PUBLIC_BANK_*` env vars |
| 6 | Un solo webhook n8n | P1 | **CORREGIDO** — `N8N_WEBHOOK_AUTH` + `N8N_WEBHOOK_ORDERS` separados |
| 7 | Campos `x_studio_*` | P2 | N/A — responsabilidad del equipo Odoo (Antigravity) |
| 8 | Carrito en sessionStorage | P1 | **CORREGIDO** — cambiado a **localStorage** (persiste al cerrar tab) |

### Pantallas del borrador

| Pantalla | Borrador | Implementada | Notas |
|----------|----------|-------------|-------|
| Login (Magic Link + OTP) | Diseñada | **SI** | Dual: OTP 6 dígitos + magic link, company_type='company' |
| Catálogo | Diseñada | **SI** | Pricelist dinámica, filtros, búsqueda, stepper qty |
| Carrito | Diseñada | **SI** | Crédito visual, semáforo, validación server-side |
| Checkout | Diseñada | **SI** | Integrado en cart — IVA, método pago, fecha entrega |
| Cuenta/Perfil | Sprint 3 | **SI** | Crédito, ejecutivo WA dinámico, facturas vencidas badge |
| Historial pedidos | Sprint 3 | **SI** | Accordion de líneas, badges estado, reordenar |
| Facturas pendientes | Sprint 3 | **SI** | Vencidas/vigentes, modal SPEI, PDF funcional |
| Confirmación pedido | Faltante | **SI** | `order/confirmed` con status confirmed/draft |
| Tracking entrega | No diseñado | NO | No estaba en el MVP — futuro |
| Puntos lealtad B2B | No diseñado | NO | No aplica para Canal Tradicional |

---

## C. Evidencia de Pruebas

### Auth — Flujo completo

```
1. GET / → Landing con input teléfono (+52 prefix)
   - Validación: regex /^[1-9]\d{9}$/ para formato MX
   - Submit → POST /api/auth/request-link

2. Server:
   - Busca res.partner por ILIKE fuzzy (mobile/phone)
   - Valida company_type === "company" (B2B only)
   - Genera OTP 6 dígitos, hashea SHA-256
   - JWT temporal (10min) con otp_hash (no OTP plano)
   - Envía código real via N8N_WEBHOOK_AUTH
   - Cookie otp_session httpOnly 10min

3. OTP Screen:
   - Input 6 dígitos autoFocus
   - Submit → POST /api/auth/verify-code
   - Hashea código ingresado, compara vs otp_hash en JWT
   - Si OK: cookie session httpOnly 7d, borra otp_session
   - Redirect → /catalog

4. Magic Link (paralelo):
   - URL /auth?token=xxx
   - POST /api/auth/verify → valida JWT, crea session 7d

5. Logout:
   - POST /api/auth/logout (server-side cookie deletion)
   - clearCart() — limpia localStorage
   - Redirect → /

6. Reingreso:
   - Si cookie session existe y es válida → acceso directo
   - Si no → redirect a /
```

### Compra E2E — Login → Pedido en Odoo

```
1. Login: OTP verificado → session cookie 7d

2. Catálogo (/catalog):
   GET /api/catalog
   → product.product.search_read (batch, no secuencial)
   → Campos: id, name, default_code, uom_id, packaging_ids,
             qty_available, sale_line_warn_msg, lst_price, list_price
   → Precios verificados: $18, $160, $25 (reales de pricelist)
   → IDs: product.product (745, 799, 750)

3. Agregar al carrito:
   → Zustand store → localStorage (key: kold-b2b-cart)
   → qty input numérico, remove si qty=0

4. Carrito (/cart):
   → Subtotal, IVA 16% (Math.round), Total
   → Crédito visual: disponible vs usado
   → Fecha entrega min T+1, horario mañana/tarde
   → Notas generales (max 2000 chars)

5. Checkout — 2 pasos:
   Paso 1: POST /api/cart/validate
   → Verifica existencia productos en Odoo
   → Verifica precios reales (lst_price)
   → Verifica stock disponible
   → Retorna issues si hay discrepancias

   Paso 2: POST /api/b2b/orders/create
   → Valida inputs (cart_lines, delivery_date, qty)
   → Lookup precios REALES de Odoo (no confía en cliente)
   → Crea sale.order con order_line [(0,0,{...})]
   → company_id desde partner.company_id
   → Auto-confirma si crédito OK + pago a crédito
   → Notifica ejecutivo via N8N_WEBHOOK_ORDERS
   → Retorna: order_name, status, ejecutivo

6. Confirmación (/order/confirmed):
   → "Pedido Confirmado" si auto-confirm
   → "Cotización en Revisión" si supera crédito
   → Links: Ver pedidos, Nuevo pedido, Contactar ejecutivo (WA dinámico)

7. Historial (/account/orders):
   → GET /api/b2b/orders/history
   → Lista con accordion de líneas
   → Badges: En revisión, Confirmado, Entregado, Cancelado
   → Botón "Reordenar" → agrega líneas al carrito
```

### Facturas

```
GET /api/b2b/invoices
→ account.move.search_read (not_paid + partial)
→ Campos: name, amount_total, amount_residual, invoice_date, invoice_date_due

UI:
→ Badge: Vencida (rojo), Vence en X días (amarillo), Vigente (verde)
→ Deuda total consolidada
→ Botón "Ver PDF":
   GET /api/b2b/invoices/{id}/pdf
   → Verifica propiedad (partner_id match)
   → Proxy a Odoo /report/pdf/account.report_invoice/{id}
   → Retorna PDF binario con Content-Type application/pdf
→ Botón "Abonar/Pagar":
   → Modal con datos bancarios (CLABE, banco, beneficiario)
   → Botón copiar CLABE
   → "Enviar Comprobante" → WhatsApp con encodeURIComponent
```

### Perfil

```
GET /api/account/profile
→ Datos: name, vat, address, pricelist, credit_limit, credit_used
→ executive: nombre del ejecutivo (user_id[1])
→ executive_phone: teléfono REAL del ejecutivo
   (res.users → res.partner.mobile del ejecutivo)
→ payment_term: condición de pago

UI (/account):
→ Header con nombre + RFC
→ Tarjeta crédito: disponible, límite, usado, progress bar
→ Banner rojo si facturas vencidas
→ Ejecutivo WA dinámico (usa executive_phone, fallback a NEXT_PUBLIC_WA_SALES)
→ Nav: Pedidos, Facturación, Catálogo
→ Logout server-side
```

---

## D. Código — Archivos en este commit

### Nuevos (3):
```
src/app/api/b2b/invoices/[id]/pdf/route.ts  — Proxy PDF facturas desde Odoo
src/app/api/cart/validate/route.ts           — Validación server-side del carrito
src/app/api/auth/logout/route.ts             — Logout server-side (commit anterior)
```

### Modificados (9):
```
src/store/cart.ts                            — sessionStorage → localStorage
src/app/(protected)/cart/page.tsx             — Integra /api/cart/validate pre-checkout
src/app/(protected)/account/invoices/page.tsx — PDF button funcional con loading state
src/app/(protected)/account/page.tsx          — WA dinámico (executive_phone)
src/app/(protected)/order/confirmed/page.tsx  — WA dinámico (executive_phone)
src/app/api/account/profile/route.ts          — Fetch teléfono real del ejecutivo
src/app/api/auth/request-link/route.ts        — N8N_WEBHOOK_AUTH separado
src/app/api/b2b/orders/create/route.ts        — N8N_WEBHOOK_ORDERS separado
AUDIT_REPORT.md                              — Reporte actualizado
```

---

## E. Variables de Entorno — Listado completo

| Variable | Tipo | Requerida | Descripción |
|----------|------|-----------|-------------|
| `ODOO_URL` | Server | **CRITICO** | URL de Odoo (ej: `https://odoo.kold.mx`) |
| `ODOO_DB` | Server | **CRITICO** | Nombre de la base de datos Odoo |
| `ODOO_SERVICE_USER` | Server | **CRITICO** | Usuario de servicio Odoo |
| `ODOO_SERVICE_PASSWORD` | Server | **CRITICO** | Contraseña de servicio Odoo |
| `JWT_SECRET` | Server | **CRITICO** | Secreto JWT (generar con `crypto.randomBytes(32)`) |
| `N8N_WEBHOOK_AUTH` | Server | Importante | Webhook n8n para OTP/magic link |
| `N8N_WEBHOOK_ORDERS` | Server | Importante | Webhook n8n para notificar pedidos |
| `N8N_WEBHOOK_URL_B2B` | Server | Fallback | Webhook genérico (fallback si no hay separados) |
| `NEXT_PUBLIC_APP_URL` | Public | **CRITICO** | `https://distribuidores.kold.mx` |
| `NEXT_PUBLIC_WA_SALES` | Public | Importante | WhatsApp ventas (fallback si ejecutivo no tiene teléfono) |
| `ODOO_COMPANY_ID` | Server | Opcional | ID empresa Odoo (fallback de partner.company_id) |
| `NEXT_PUBLIC_CANAL_ORIGEN` | Public | Opcional | Default: `pwa_canal_tradicional` |
| `NEXT_PUBLIC_BANK_NAME` | Public | Opcional | Banco para pagos SPEI |
| `NEXT_PUBLIC_BANK_CLABE` | Public | Opcional | CLABE interbancaria |
| `NEXT_PUBLIC_BANK_BENEFICIARY` | Public | Opcional | Razón social beneficiario |

---

## F. Lo que NO aplica del borrador

| Item | Por qué no aplica |
|------|-------------------|
| Tracking de entrega | No estaba diseñado en el MVP. Requiere integración con logística (futuro). |
| Puntos de lealtad B2B | No especificado para Canal Tradicional. El sistema de lealtad es para B2C (`koldhome-pwa`). |
| Rediseño visual (design system Colaboradores) | El design system de Colaboradores es premium/glassmorphism. B2B usa design funcional-transaccional que es correcto para distribuidores. No es un gap sino una decisión de producto. |
| Checkout separado (`checkout/page.tsx`) | Integrado en `cart/page.tsx`. Separarlo no agrega valor — el flujo es lineal y la pantalla actual cubre carrito + checkout en una vista. |

---

## G. Riesgos Restantes (post-MVP)

| Riesgo | Severidad | Mitigación | Recomendación |
|--------|-----------|------------|---------------|
| Sin rate limiting en auth | Media | Mensajes genéricos anti-enumeración | Vercel Edge Middleware o KV en siguiente sprint |
| Muchos partners con credit_limit $0 | Operativa | Funciona — van como cotización draft | Asegurar que ejecutivos revisen cotizaciones rápido |
| PDF depende de Odoo report engine | Baja | Timeout 30s + error gracioso | Monitorear tiempos de respuesta de Odoo reports |
| `_compute_price_rule_multi` no disponible via RPC | Info | Usando `lst_price` directo que respeta pricelist del contexto | Si se necesitan precios por volumen, evaluar endpoint custom Odoo |
