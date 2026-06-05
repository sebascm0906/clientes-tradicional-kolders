type OdooMany2One = [number, string] | false | null | undefined;

export type IdempotentOrderMatch = "replay" | "collision";

export function getOdooMany2OneId(value: OdooMany2One): number | null {
  return Array.isArray(value) && typeof value[0] === "number" ? value[0] : null;
}

function stringifyError(value: unknown): string {
  if (!value) return "";
  if (value instanceof Error) {
    const cause = "cause" in value ? stringifyError(value.cause) : "";
    return [value.name, value.message, cause].filter(Boolean).join(" ");
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function isOdooIdempotencyError(error: unknown): boolean {
  const text = stringifyError(error);
  return /la llave de idempotencia ya existe|llave de idempotencia|idempotencia|idempotency|x_kold_idempotency_key|unique|already exists|duplicate key/i.test(text);
}

export function resolveIdempotentOrderMatch(
  order: { partner_id?: OdooMany2One },
  partnerId: number
): IdempotentOrderMatch {
  const existingPartnerId = getOdooMany2OneId(order.partner_id);
  return existingPartnerId && existingPartnerId !== partnerId ? "collision" : "replay";
}
