import { describe, expect, it } from "vitest";
import { asyncMapChunked } from "./asyncBatch.js";

describe("asyncMapChunked", () => {
  it("returns an empty array for no items", async () => {
    expect(await asyncMapChunked([], 25, async (n) => n * 2)).toEqual([]);
  });

  it("preserves order below chunkSize", async () => {
    const out = await asyncMapChunked([1, 2, 3], 25, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30]);
  });

  it("preserves order at chunkSize", async () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const out = await asyncMapChunked(items, 25, async (n) => n + 1);
    expect(out).toEqual(items.map((n) => n + 1));
  });

  it("preserves order above chunkSize across batches", async () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const out = await asyncMapChunked(items, 25, async (n) => n * 2);
    expect(out).toEqual(items.map((n) => n * 2));
  });

  it("bounds concurrency to chunkSize", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);

    await asyncMapChunked(items, 4, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return n;
    });

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });
});
