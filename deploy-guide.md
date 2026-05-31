# Guía de Despliegue - PWA Canal Tradicional (B2B)

Esta guía documenta los pasos para llevar el PWA B2B a su entorno de producción en Vercel.

## Paso 1: Subir repo a GitHub

Abre la terminal en la raíz del proyecto (`koldhome-canal-tradicional`) y ejecuta:

```bash
git init
git add .
git commit -m "KOLD Canal Tradicional PWA MVP"
git remote add origin https://github.com/yamilestebanh-collab/koldhome-canal-tradicional.git
git push -u origin main
```

_(Si pide credenciales, utiliza tu personal access token de GitHub)._

## Paso 2: Crear proyecto en Vercel

1. Ingresa a [vercel.com](https://vercel.com) y asegúrate de haber iniciado sesión con la cuenta de Kold.
2. Ve a **Add New... > Project**.
3. Busca el repositorio `koldhome-canal-tradicional` y haz clic en **Import**.
4. En _Framework Preset_ debería auto-detectar **Next.js**.

## Paso 3: Variables de entorno en Vercel

Antes de presionar "Deploy", despliega la sección de **Environment Variables** en Vercel y configura **TODAS** las variables listadas en el archivo `.env.production.example`.

Asegúrate de cambiar los valores de prueba por los valores productivos reales (sobre todo ODOO_URL, JWT_SECRET, y las credenciales de WhatsApp/n8n).

Para autenticación PWA con el workflow W15 de n8n, configura una de estas dos opciones:

```bash
N8N_AUTH_BASE_URL=https://n8n.grupofrio.mx/webhook
```

o, si prefieres URLs explícitas:

```bash
N8N_AUTH_REQUEST_URL=https://n8n.grupofrio.mx/webhook/pwa-auth-request
N8N_AUTH_VERIFY_URL=https://n8n.grupofrio.mx/webhook/pwa-auth-verify
```

El canal por defecto es `pwa_canal_tradicional`; puedes sobrescribirlo con `NEXT_PUBLIC_CANAL_ORIGEN`.

Una vez agregadas, presiona **Deploy**.

## Paso 4: Dominio sugerido

Una vez que el despliegue finalice exitosamente:

1. Ve a la pestaña **Settings** del proyecto en Vercel.
2. Navega a la sección **Domains**.
3. Agrega el subdominio: `distribuidores.kold.mx`.
4. Configura el CNAME en tu proveedor de DNS según las instrucciones que muestre Vercel.

## Paso 5: Verificar en móvil

Realiza la prueba PWA estándar en tu dispositivo Android o iOS:

1. Abre el navegador (Chrome Android o Safari iOS) y navega a `distribuidores.kold.mx`.
2. Utiliza la opción **Agregar a la pantalla de inicio** (Install PWA). El ícono y el splash screen deben ser color azul oscuro (KOLD B2B).
3. Entra a la App instalada e intenta hacer un login con el número de un negocio real registrado en Odoo.
4. Explora las vistas, verifica saldos, e intenta **colocar un pedido de prueba**.
