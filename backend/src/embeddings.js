// ── Local embedding model for semantic deduplication ─────────────────────────
// Uses @xenova/transformers to run all-MiniLM-L6-v2 locally.
// Model downloads lazily on first use (~80MB) and caches in the data directory.
// If model is unavailable, all functions gracefully return null/skip.

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pipeline = null;
let embedder = null;
let modelReady = false;
let modelLoading = false;
let modelError = null;
let loadProgress = null; // { status, file, progress }
let onReadyCallbacks = [];

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

function getCacheDir() {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
  return path.join(dataDir, "models");
}

// ── Load model in background ────────────────────────────────────────────────
export async function initEmbeddings() {
  if (modelReady || modelLoading) return;
  modelLoading = true;
  modelError = null;
  loadProgress = { status: "downloading", progress: 0 };

  try {
    // Dynamic import to avoid blocking startup
    const { pipeline: createPipeline, env } = await import("@xenova/transformers");
    env.cacheDir = getCacheDir();
    env.allowLocalModels = true;

    console.log(`[Embeddings] Loading model ${MODEL_NAME}...`);
    loadProgress = { status: "downloading", progress: 0 };

    embedder = await createPipeline("feature-extraction", MODEL_NAME, {
      progress_callback: (p) => {
        if (p.status === "progress") {
          loadProgress = { status: "downloading", file: p.file, progress: Math.round(p.progress) };
        } else if (p.status === "done") {
          loadProgress = { status: "loading", progress: 100 };
        }
      },
    });

    modelReady = true;
    modelLoading = false;
    loadProgress = { status: "ready", progress: 100 };
    console.log("[Embeddings] Model ready");
    // Fire any registered onReady callbacks
    for (const cb of onReadyCallbacks) { try { cb(); } catch {} }
    onReadyCallbacks = [];
  } catch (err) {
    modelError = err.message;
    modelLoading = false;
    loadProgress = { status: "error", error: err.message };
    console.error(`[Embeddings] Failed to load model: ${err.message}`);
  }
}

export function getModelStatus() {
  return {
    ready: modelReady,
    loading: modelLoading,
    error: modelError,
    progress: loadProgress,
  };
}

export function isReady() {
  return modelReady;
}

export function onReady(cb) {
  if (modelReady) { cb(); return; }
  onReadyCallbacks.push(cb);
}

// ── Generate embedding for text ─────────────────────────────────────────────
export async function embed(text) {
  if (!modelReady || !embedder) return null;
  try {
    const output = await embedder(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  } catch (err) {
    console.error(`[Embeddings] Error: ${err.message}`);
    return null;
  }
}

// ── Batch embed items ───────────────────────────────────────────────────────
export async function embedItems(items) {
  if (!modelReady) return [];
  const results = [];
  for (const item of items) {
    const text = `${item.title || ""} ${(item.summary || "").slice(0, 200)}`;
    const vector = await embed(text);
    if (vector) results.push({ id: item.id, embedding: vector });
  }
  return results;
}

// ── Cosine similarity ───────────────────────────────────────────────────────
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Cluster items by semantic similarity ────────────────────────────────────
// Uses single-linkage clustering: items above threshold join the same cluster.
// Returns a map of itemId → clusterId.
const SIMILARITY_THRESHOLD = 0.75;

export function clusterByEmbedding(items, threshold = SIMILARITY_THRESHOLD) {
  // items: [{ id, embedding }]
  const withEmbeddings = items.filter(i => i.embedding && i.embedding.length > 0);
  if (withEmbeddings.length === 0) return {};

  // Union-find for clustering
  const parent = {};
  const find = (x) => { if (parent[x] !== x) parent[x] = find(parent[x]); return parent[x]; };
  const union = (x, y) => { parent[find(x)] = find(y); };

  for (const item of withEmbeddings) parent[item.id] = item.id;

  // Compare all pairs (O(n²) — fine for typical batch sizes < 500)
  for (let i = 0; i < withEmbeddings.length; i++) {
    for (let j = i + 1; j < withEmbeddings.length; j++) {
      const sim = cosineSimilarity(withEmbeddings[i].embedding, withEmbeddings[j].embedding);
      if (sim >= threshold) {
        union(withEmbeddings[i].id, withEmbeddings[j].id);
      }
    }
  }

  // Build cluster map: itemId → clusterId (cluster ID = root item ID)
  const clusters = {};
  for (const item of withEmbeddings) {
    clusters[item.id] = find(item.id);
  }
  return clusters;
}
