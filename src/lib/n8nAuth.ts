type EnvLike = Record<string, string | undefined>;

interface N8nAuthConfig {
  requestUrl: string;
  verifyUrl: string;
  channel: string;
}

interface N8nAuthError {
  status: number;
  message: string;
}

interface N8nRequestResponse {
  success?: boolean;
  message?: string;
  expires_in?: string;
  error?: string;
}

interface N8nVerifyResponse {
  valid?: boolean;
  session_token?: string;
  partner_id?: number;
  partner_name?: string;
  error?: string;
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function normalizeMxPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const localPhone = digits.startsWith("52") && digits.length === 12 ? digits.slice(2) : digits.slice(-10);

  if (!/^[1-9]\d{9}$/.test(localPhone)) {
    throw new Error("invalid_phone");
  }

  return `+52${localPhone}`;
}

export function getN8nAuthConfig(env: EnvLike = process.env): N8nAuthConfig {
  const channel = env.NEXT_PUBLIC_CANAL_ORIGEN || "pwa_canal_tradicional";
  const baseUrl = env.N8N_AUTH_BASE_URL || env.N8N_WEBHOOK_AUTH_BASE_URL;
  const requestUrl = env.N8N_AUTH_REQUEST_URL || (baseUrl ? joinUrl(baseUrl, "pwa-auth-request") : "");
  const verifyUrl = env.N8N_AUTH_VERIFY_URL || (baseUrl ? joinUrl(baseUrl, "pwa-auth-verify") : "");

  return { requestUrl, verifyUrl, channel };
}

export function buildN8nAuthPayload(phone: string, channel: string) {
  const normalizedPhone = normalizeMxPhone(phone);

  return {
    phone: normalizedPhone,
    app: channel,
    channel,
    canal_origen: channel,
  };
}

export function mapN8nAuthError(status: number, body: unknown): N8nAuthError {
  if (status === 429) {
    return {
      status: 429,
      message: "Demasiados intentos. Espera unos minutos y solicita un código nuevo.",
    };
  }

  if (status >= 500) {
    return {
      status: 502,
      message: "No pudimos contactar el servicio de autenticación. Intenta nuevamente.",
    };
  }

  const error = typeof body === "object" && body && "error" in body ? String((body as { error?: unknown }).error) : "";
  if (error === "missing_refresh_token") {
    return { status: 401, message: "La sesión expiró. Vuelve a ingresar." };
  }

  return {
    status: status >= 400 ? status : 401,
    message: "No pudimos validar tu acceso. Verifica el código o solicita uno nuevo.",
  };
}

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function requestN8nAuthCode(phone: string): Promise<N8nRequestResponse> {
  const config = getN8nAuthConfig();
  if (!config.requestUrl) {
    throw new Error("N8N_AUTH_REQUEST_URL is not configured.");
  }

  const response = await fetch(config.requestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildN8nAuthPayload(phone, config.channel)),
  });
  const body = (await readJsonSafely(response)) as N8nRequestResponse;

  if (!response.ok) {
    const mapped = mapN8nAuthError(response.status, body);
    throw Object.assign(new Error(mapped.message), { status: mapped.status });
  }

  return body;
}

export async function verifyN8nAuthCode(phone: string, token: string): Promise<N8nVerifyResponse> {
  const config = getN8nAuthConfig();
  if (!config.verifyUrl) {
    throw new Error("N8N_AUTH_VERIFY_URL is not configured.");
  }

  const response = await fetch(config.verifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: normalizeMxPhone(phone),
      token,
      app: config.channel,
      channel: config.channel,
      canal_origen: config.channel,
    }),
  });
  const body = (await readJsonSafely(response)) as N8nVerifyResponse;

  if (!response.ok || !body.valid || !body.session_token) {
    const mapped = mapN8nAuthError(response.status, body);
    throw Object.assign(new Error(mapped.message), { status: mapped.status });
  }

  return body;
}

export async function verifyN8nMagicLink(phone: string, token: string): Promise<N8nVerifyResponse> {
  return verifyN8nAuthCode(phone, token);
}
