import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { generateShareToken } from "./share-service.js";

describe("share-service tokens", () => {
  it("generateShareToken returns opaque token and matching sha256 hash", () => {
    const { token, tokenHash } = generateShareToken();
    assert.ok(token.length >= 32);
    assert.equal(tokenHash, createHash("sha256").update(token).digest("hex"));
  });

  it("generateShareToken values are unique", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    assert.notEqual(a.token, b.token);
    assert.notEqual(a.tokenHash, b.tokenHash);
  });
});
