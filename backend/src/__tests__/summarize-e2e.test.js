/**
 * End-to-end tests for the summarize pipeline:
 * 1. Content fetching — verifies fetchArticleContent retrieves full paper text
 * 2. SSE endpoint — verifies the endpoint responds and handles errors
 *
 * These tests hit real arXiv URLs and require network access.
 * They do NOT require an LLM API key — content fetching is tested
 * independently of LLM generation.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "intel-hub-e2e-" + Date.now());
let server, port, upsertItem, fetchArticleContent;

beforeAll(async () => {
  fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "data", "db.json"), JSON.stringify({ feeds: [], items: [] }));
  fs.writeFileSync(path.join(tmpDir, "settings.json"), JSON.stringify({}));

  process.env.DATA_DIR = path.join(tmpDir, "data");
  process.env.ELECTRON_MODE = "1";

  const db = await import("../db.js");
  upsertItem = db.upsertItem;

  const scorer = await import("../scorer.js");
  fetchArticleContent = scorer.fetchArticleContent;

  upsertItem({
    id: "test-arxiv-1706",
    feed_id: "arxiv-cs-ai",
    title: "Attention Is All You Need",
    summary: "Short RSS summary only",
    url: "https://arxiv.org/abs/1706.03762",
    author: "Vaswani et al.",
    published: new Date().toISOString(),
    category: "research",
    relevance: 0.9,
    tags: ["transformers"],
  });

  const serverModule = await import("../server.js");
  server = await serverModule.createServer(0);
  port = server.address().port;
}, 30000);

afterAll(() => {
  if (server) server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.ELECTRON_MODE;
});

function readSSE(url, timeoutMs = 60000) {
  return new Promise(async (resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SSE timeout")), timeoutMs);
    try {
      const res = await fetch(url);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const events = [];
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            events.push(data);
            if (data.type === "done" || data.type === "error") {
              clearTimeout(timer);
              resolve(events);
              return;
            }
          }
        }
      }
      clearTimeout(timer);
      resolve(events);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

// ── Content fetching (no LLM required) ───────────────────────────────────────

describe("Content fetching — arXiv PDF retrieval", () => {
  it("fetches full content from an arXiv /abs/ URL via PDF", async () => {
    const content = await fetchArticleContent("https://arxiv.org/abs/1706.03762");
    expect(content).not.toBeNull();
    expect(content.length).toBeGreaterThan(2000);
    expect(content.toLowerCase()).toContain("attention");
  }, 60000);

  it("fetches full content from an arXiv /pdf/ URL", async () => {
    const content = await fetchArticleContent("https://arxiv.org/pdf/1706.03762");
    expect(content).not.toBeNull();
    expect(content.length).toBeGreaterThan(2000);
  }, 60000);

  it("classifies fetched content as full document (not summary)", async () => {
    const content = await fetchArticleContent("https://arxiv.org/abs/1706.03762");
    // Full document threshold is >2000 chars
    expect(content).not.toBeNull();
    expect(content.length).toBeGreaterThan(2000);
  }, 60000);
});

// ── SSE endpoint (works without LLM key) ─────────────────────────────────────

describe("Summarize SSE endpoint", () => {
  it("sends progress events during content fetching", async () => {
    const events = await readSSE(
      `http://localhost:${port}/api/items/test-arxiv-1706/summarize/stream`
    );

    // Should have at least one progress event from content fetching
    const progressEvents = events.filter(e => e.type === "progress");
    expect(progressEvents.length).toBeGreaterThan(0);
    console.log("[E2E] Progress:", progressEvents.map(e => e.message));

    // The stream should terminate with either done or error
    // (error is expected in CI where no LLM key is configured)
    const terminal = events.find(e => e.type === "done" || e.type === "error");
    expect(terminal).toBeTruthy();

    // If it succeeded (LLM key available), verify contentSource
    if (terminal.type === "done") {
      expect(terminal.contentSource).toBe("full document");
    }
  }, 120000);

  it("returns error for non-existent item", async () => {
    const events = await readSSE(
      `http://localhost:${port}/api/items/nonexistent-id/summarize/stream`
    );
    const errorEvent = events.find(e => e.type === "error");
    expect(errorEvent).toBeTruthy();
    expect(errorEvent.message).toContain("not found");
  }, 30000);
});
