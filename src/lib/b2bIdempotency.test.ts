import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOdooMany2OneId,
  isOdooIdempotencyError,
  resolveIdempotentOrderMatch,
} from "./b2bIdempotency.ts";

describe("B2B idempotency helpers", () => {
  it("recognizes the real Odoo Spanish unique-constraint message", () => {
    const error = new Error(
      "No se puede completar la operación: La llave de idempotencia ya existe para otra orden."
    );

    assert.equal(isOdooIdempotencyError(error), true);
  });

  it("recognizes common English unique-constraint variants", () => {
    assert.equal(isOdooIdempotencyError(new Error("duplicate key value violates unique constraint")), true);
    assert.equal(isOdooIdempotencyError(new Error("x_kold_idempotency_key already exists")), true);
    assert.equal(isOdooIdempotencyError(new Error("idempotency key conflict")), true);
  });

  it("does not treat unrelated Odoo errors as idempotency", () => {
    assert.equal(isOdooIdempotencyError(new Error("Product is not available")), false);
  });

  it("classifies same-partner existing orders as replay and different partners as collision", () => {
    const samePartner = { id: 17056, partner_id: [54907, "YAMIL TRADICIONAL"] };
    const otherPartner = { id: 17057, partner_id: [51661, "02 DE MARZO"] };

    assert.equal(resolveIdempotentOrderMatch(samePartner, 54907), "replay");
    assert.equal(resolveIdempotentOrderMatch(otherPartner, 54907), "collision");
  });

  it("extracts Odoo many2one ids safely", () => {
    assert.equal(getOdooMany2OneId([54907, "YAMIL TRADICIONAL"]), 54907);
    assert.equal(getOdooMany2OneId(false), null);
    assert.equal(getOdooMany2OneId(null), null);
  });
});
