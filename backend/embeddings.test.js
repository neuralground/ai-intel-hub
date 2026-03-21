import { describe, it, expect, beforeAll } from "vitest";
import { initEmbeddings, isReady, embed, embedItems, clusterByEmbedding, cosineSimilarity } from "./src/embeddings.js";

// ── cosineSimilarity edge cases (no model needed) ────────────────────────────

describe("cosineSimilarity edge cases", () => {
  it("returns 0 for null/undefined inputs", () => {
    expect(cosineSimilarity(null, null)).toBe(0);
    expect(cosineSimilarity(undefined, [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2], null)).toBe(0);
  });

  it("returns NaN for empty arrays (zero-norm vectors)", () => {
    expect(cosineSimilarity([], [])).toBeNaN();
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
    expect(cosineSimilarity([1], [1, 2, 3])).toBe(0);
  });

  it("returns 1 for identical unit vectors", () => {
    const v = [0.6, 0.8];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it("returns 1 for identical non-unit vectors", () => {
    const v = [3, 4];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 5);
  });

  it("handles high-dimensional vectors", () => {
    const a = Array.from({ length: 384 }, (_, i) => Math.sin(i));
    const b = Array.from({ length: 384 }, (_, i) => Math.cos(i));
    const sim = cosineSimilarity(a, b);
    expect(typeof sim).toBe("number");
    expect(sim).toBeGreaterThanOrEqual(-1);
    expect(sim).toBeLessThanOrEqual(1);
  });
});

// ── Pipeline tests (require model download) ──────────────────────────────────
// These tests require the embedding model to download (~80MB first time).
// They verify the full pipeline: embed → similarity → cluster.

describe("Embedding & Clustering Pipeline", () => {
  beforeAll(async () => {
    await initEmbeddings();
    if (!isReady()) throw new Error("Embedding model failed to initialize");
  }, 120000); // up to 2 min for first-time model download

  it("should generate embeddings for text", async () => {
    const vec = await embed("Trump signs new AI regulation executive order");
    expect(vec).toBeTruthy();
    expect(vec.length).toBeGreaterThan(100); // MiniLM produces 384-dim vectors
    expect(vec.length).toBe(384);
  });

  it("should produce similar embeddings for semantically similar text", async () => {
    const a = await embed("Trump signs executive order on AI regulation");
    const b = await embed("President Trump announces new artificial intelligence legislation");
    const c = await embed("Recipe for chocolate chip cookies with walnuts");

    const simAB = cosineSimilarity(a, b);
    const simAC = cosineSimilarity(a, c);

    console.log(`Similar pair (AI regulation): ${simAB.toFixed(3)}`);
    console.log(`Dissimilar pair (AI vs cookies): ${simAC.toFixed(3)}`);

    expect(simAB).toBeGreaterThan(0.5); // semantically similar
    expect(simAC).toBeLessThan(0.3); // semantically unrelated
    // Note: MiniLM-L6-v2 produces lower similarities than you might expect.
    // Scores of 0.65-0.85 indicate strong semantic overlap for news articles.
  });

  it("should cluster duplicate news items together", async () => {
    // Simulate items about the same story from different sources
    const items = [
      { id: "a1", title: "Trump signs executive order restricting AI development", summary: "The president signed a sweeping executive order on Tuesday placing new limits on artificial intelligence." },
      { id: "a2", title: "New Trump AI executive order imposes strict regulations", summary: "President Trump moved to regulate AI companies with a new executive order targeting foundation models." },
      { id: "a3", title: "Trump announces AI regulation via executive order", summary: "The White House announced broad new restrictions on AI development through an executive action." },
      { id: "b1", title: "Google releases Gemini 2.5 Pro with improved reasoning", summary: "Google DeepMind launched Gemini 2.5 Pro, featuring enhanced chain-of-thought reasoning capabilities." },
      { id: "b2", title: "Google unveils Gemini 2.5 Pro AI model", summary: "The latest Gemini model from Google demonstrates significantly improved reasoning and coding abilities." },
      { id: "c1", title: "European Central Bank holds interest rates steady", summary: "The ECB kept rates unchanged amid cooling inflation in the eurozone." },
    ];

    // Embed all items
    const embedded = await embedItems(items);
    expect(embedded.length).toBe(items.length);

    // Log pairwise similarities for debugging
    console.log("\nPairwise similarities:");
    for (let i = 0; i < embedded.length; i++) {
      for (let j = i + 1; j < embedded.length; j++) {
        const sim = cosineSimilarity(embedded[i].embedding, embedded[j].embedding);
        if (sim > 0.5) {
          console.log(`  ${embedded[i].id} <-> ${embedded[j].id}: ${sim.toFixed(3)}`);
        }
      }
    }

    // Cluster with realistic threshold for news dedup (MiniLM produces 0.75-0.85 for duplicates)
    const clusters = clusterByEmbedding(embedded, 0.75);

    // Build cluster groups
    const groups = {};
    for (const [id, clusterId] of Object.entries(clusters)) {
      if (!groups[clusterId]) groups[clusterId] = [];
      groups[clusterId].push(id);
    }

    const multiGroups = Object.values(groups).filter(g => g.length > 1);
    console.log("\nCluster groups (size > 1):", multiGroups);

    // The 3 Trump AI articles should cluster together
    const trumpIds = new Set(["a1", "a2", "a3"]);
    const trumpCluster = multiGroups.find(g => g.some(id => trumpIds.has(id)));
    expect(trumpCluster).toBeTruthy();
    expect(trumpCluster.filter(id => trumpIds.has(id)).length).toBeGreaterThanOrEqual(2);

    // The 2 Gemini articles should cluster together
    const geminiIds = new Set(["b1", "b2"]);
    const geminiCluster = multiGroups.find(g => g.some(id => geminiIds.has(id)));
    expect(geminiCluster).toBeTruthy();
    expect(geminiCluster.filter(id => geminiIds.has(id)).length).toBe(2);

    // The ECB article should NOT be in any multi-item cluster
    const ecbInMulti = multiGroups.some(g => g.includes("c1"));
    expect(ecbInMulti).toBe(false);
  });

  it("should respect threshold parameter", async () => {
    const items = [
      { id: "x1", title: "OpenAI launches GPT-5 with new capabilities", summary: "OpenAI released GPT-5 today." },
      { id: "x2", title: "OpenAI unveils GPT-5 model", summary: "The new GPT-5 from OpenAI is now available." },
    ];

    const embedded = await embedItems(items);
    const sim = cosineSimilarity(embedded[0].embedding, embedded[1].embedding);
    console.log(`\nGPT-5 pair similarity: ${sim.toFixed(3)}`);

    // With a very high threshold, they should NOT cluster
    const strict = clusterByEmbedding(embedded, 0.99);
    const strictGroups = Object.values(
      Object.entries(strict).reduce((acc, [id, cid]) => { (acc[cid] = acc[cid] || []).push(id); return acc; }, {})
    ).filter(g => g.length > 1);
    expect(strictGroups.length).toBe(0);

    // With a low threshold, they SHOULD cluster
    const loose = clusterByEmbedding(embedded, 0.5);
    const looseGroups = Object.values(
      Object.entries(loose).reduce((acc, [id, cid]) => { (acc[cid] = acc[cid] || []).push(id); return acc; }, {})
    ).filter(g => g.length > 1);
    expect(looseGroups.length).toBe(1);
  });
});
