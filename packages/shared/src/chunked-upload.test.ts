import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expectedChunkByteLength, totalChunksForSize } from "./chunked-upload.js";

describe("chunked-upload helpers", () => {
  it("computes total chunks", () => {
    assert.equal(totalChunksForSize(100, 80), 2);
    assert.equal(totalChunksForSize(80, 80), 1);
  });

  it("expected length for last chunk", () => {
    assert.equal(expectedChunkByteLength(0, 100, 80, 2), 80);
    assert.equal(expectedChunkByteLength(1, 100, 80, 2), 20);
  });
});
