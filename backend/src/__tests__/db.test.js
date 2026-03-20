import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const tmpDir = path.join(os.tmpdir(), 'intel-hub-test-' + Date.now());

let isCritical;

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'db.json'), JSON.stringify({
    feeds: [
      { id: 'user-auth-feed', name: 'User Auth Feed', authoritative: 1, active: 1, category: 'research' }
    ],
    items: []
  }));
  process.env.DATA_DIR = tmpDir;

  const db = await import('../db.js');
  isCritical = db.isCritical;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

function freshDate() {
  return new Date().toISOString();
}

function oldDate() {
  return new Date(Date.now() - 72 * 3600000).toISOString(); // 72 hours ago
}

describe('isCritical', () => {
  it('returns false for low relevance items', () => {
    const item = { relevance: 0.5, scored_at: freshDate(), published: freshDate(), feed_id: 'some-feed' };
    expect(isCritical(item)).toBe(false);
  });

  it('returns false for old items even with high relevance', () => {
    const item = { relevance: 0.98, scored_at: oldDate(), published: oldDate(), feed_id: 'openai-blog' };
    expect(isCritical(item)).toBe(false);
  });

  it('returns true for >= 0.95 relevance + fresh + scored', () => {
    const item = { relevance: 0.96, scored_at: freshDate(), published: freshDate(), feed_id: 'some-random-feed' };
    expect(isCritical(item)).toBe(true);
  });

  it('returns true for >= 0.85 relevance + fresh + authoritative feed (openai-blog)', () => {
    // openai-blog maps to OpenAI via getFeedOrg, making it authoritative
    const item = { relevance: 0.88, scored_at: freshDate(), published: freshDate(), feed_id: 'openai-blog' };
    expect(isCritical(item)).toBe(true);
  });

  it('returns true for >= 0.85 relevance + fresh + has affiliations', () => {
    const item = { relevance: 0.87, scored_at: freshDate(), published: freshDate(), feed_id: 'random-feed', affiliations: ['Google'] };
    expect(isCritical(item)).toBe(true);
  });

  it('returns false for >= 0.85 relevance + fresh + NOT authoritative and no affiliations', () => {
    const item = { relevance: 0.88, scored_at: freshDate(), published: freshDate(), feed_id: 'random-unknown-feed', affiliations: [] };
    expect(isCritical(item)).toBe(false);
  });

  it('returns true for >= 0.85 relevance + fresh + user-marked authoritative feed', () => {
    // user-auth-feed is in our test DB with authoritative: 1
    const item = { relevance: 0.87, scored_at: freshDate(), published: freshDate(), feed_id: 'user-auth-feed' };
    expect(isCritical(item)).toBe(true);
  });

  it('returns false for unscored items (relevance=0.5, no scored_at)', () => {
    const item = { relevance: 0.5, published: freshDate(), feed_id: 'openai-blog' };
    expect(isCritical(item)).toBe(false);
  });
});
