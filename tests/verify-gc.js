const assert = require("assert");

// Test file for checking GC capability and safety checks
console.log("Starting GC capability verification...");

// Check GC function when run with --expect-gc
if (process.argv.includes("--expect-gc")) {
  assert.ok(global.gc, "Expected global.gc to be defined when run with --expose-gc");
  console.log("global.gc is correctly exposed.");
  
  // Measure memory before GC
  const memBefore = process.memoryUsage().heapUsed;
  
  // Allocate some garbage memory
  let temp = Array.from({ length: 1000000 }, (_, i) => i);
  temp = null;
  
  // Run GC
  global.gc();
  
  const memAfter = process.memoryUsage().heapUsed;
  console.log(`GC called successfully. Heap before allocation clear: ${memBefore} bytes, after GC: ${memAfter} bytes`);
} else {
  // Without --expose-gc, global.gc should be undefined, but checking it must not throw
  console.log("Testing safety without --expose-gc...");
  if (global.gc) {
    throw new Error("global.gc should not be defined without --expose-gc");
  }
  console.log("Safe: global.gc is undefined and code will bypass manual collection cleanly.");
}

console.log("GC verification complete successfully.");
