/**
 * End-to-end test: starts the real server, inserts a test arXiv item,
 * calls the /api/items/:id/summarize/stream SSE endpoint, and verifies
 * that the full PDF content is fetched and streamed back.
 *
 * This test hits real arXiv URLs and requires network access.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "intel-hub-e2e-" + Date.now());
let server, port, upsertItem;

beforeAll(async () => {
  // Set up a temp data dir
  fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "data", "db.json"), JSON.stringify({ feeds: [], items: [] }));
  // Write a minimal settings file so the server doesn't error
  fs.writeFileSync(path.join(tmpDir, "settings.json"), JSON.stringify({}));

  process.env.DATA_DIR = path.join(tmpDir, "data");
  process.env.ELECTRON_MODE = "1"; // Prevent auto-start
  process.env.LLM_PROVIDER = "anthropic"; // won't actually call LLM in this test

  const db = await import("../db.js");
  upsertItem = db.upsertItem;

  // Insert a test arXiv item (well-known stable paper)
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
    relevance_reason: "Foundational transformer paper",
    tags: ["transformers"],
  });

  // Start the real server
  const serverModule = await import("../server.js");
  server = await serverModule.createServer(0);
  port = server.address().port;
  console.log(`[E2E] Server started on port ${port}`);
}, 30000);

afterAll(() => {
  if (server) server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.ELECTRON_MODE;
  delete process.env.LLM_PROVIDER;
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

describe("Summarize SSE endpoint — end to end", () => {
  it("fetches full arXiv PDF content and reports it as full document", async () => {
    const events = await readSSE(
      `http://localhost:${port}/api/items/test-arxiv-1706/summarize/stream`
    );

    // Should have progress events
    const progressEvents = events.filter(e => e.type === "progress");
    expect(progressEvents.length).toBeGreaterThan(0);
    console.log("[E2E] Progress events:", progressEvents.map(e => e.message));

    // Should have a done event
    const doneEvent = events.find(e => e.type === "done");
    expect(doneEvent).toBeTruthy();

    // contentSource should be "full document" — NOT "feed summary only"
    console.log("[E2E] contentSource:", doneEvent.contentSource);
    expect(doneEvent.contentSource).toBe("full document");

    // Should NOT have an error
    const errorEvent = events.find(e => e.type === "error");
    expect(errorEvent).toBeUndefined();
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
