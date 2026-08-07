import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveByteRange } from "./byte-range.js";

describe("resolveByteRange", () => {
  it("returns an exact small range unchanged", () => {
    assert.deepEqual(resolveByteRange("bytes=100-199", 1000, 2 * 1024 * 1024), {
      start: 100,
      end: 199,
    });
  });

  it("caps an open-ended range to maxBytes", () => {
    const max = 1024;
    assert.deepEqual(resolveByteRange("bytes=0-", 50_000_000, max), {
      start: 0,
      end: max - 1,
    });
  });

  it("caps an oversized explicit range", () => {
    const max = 1024;
    assert.deepEqual(resolveByteRange("bytes=100-99999", 50_000_000, max), {
      start: 100,
      end: 100 + max - 1,
    });
  });

  it("handles suffix ranges", () => {
    assert.deepEqual(resolveByteRange("bytes=-500", 10_000, 2 * 1024 * 1024), {
      start: 9500,
      end: 9999,
    });
  });

  it("returns null for unsatisfiable ranges", () => {
    assert.equal(resolveByteRange("bytes=9999-19999", 10), null);
  });
});
