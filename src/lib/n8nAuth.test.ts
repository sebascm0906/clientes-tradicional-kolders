import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildN8nAuthPayload,
  getN8nAuthConfig,
  mapN8nAuthError,
  normalizeMxPhone,
} from "./n8nAuth.ts";

describe("n8n auth helpers", () => {
  it("builds W15 endpoint URLs from a base URL", () => {
    const config = getN8nAuthConfig({
      N8N_AUTH_BASE_URL: "https://n8n.grupofrio.mx/webhook/",
    });

    assert.equal(config.requestUrl, "https://n8n.grupofrio.mx/webhook/pwa-auth-request");
    assert.equal(config.verifyUrl, "https://n8n.grupofrio.mx/webhook/pwa-auth-verify");
    assert.equal(config.channel, "pwa_canal_tradicional");
  });

  it("normalizes Mexican phone numbers to the format W15 expects", () => {
    assert.equal(normalizeMxPhone("811-234-5678"), "+528112345678");
    assert.equal(normalizeMxPhone("528112345678"), "+528112345678");
    assert.equal(normalizeMxPhone("+52 811 234 5678"), "+528112345678");
  });

  it("builds the B2B request payload without exposing channel variants", () => {
    assert.deepEqual(buildN8nAuthPayload("8112345678", "pwa_canal_tradicional"), {
      phone: "+528112345678",
      app: "pwa_canal_tradicional",
      channel: "pwa_canal_tradicional",
      canal_origen: "pwa_canal_tradicional",
    });
  });

  it("maps auth failures to safe public messages", () => {
    assert.equal(mapN8nAuthError(401, { error: "NOT_FOUND" }).status, 401);
    assert.equal(
      mapN8nAuthError(401, { error: "NOT_FOUND" }).message,
      "No pudimos validar tu acceso. Verifica el código o solicita uno nuevo."
    );
    assert.equal(mapN8nAuthError(429, { error: "rate_limited" }).status, 429);
  });
});
