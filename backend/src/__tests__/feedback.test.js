import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const tmpDir = path.join(os.tmpdir(), 'intel-hub-feedback-test-' + Date.now());

let getRecentFeedbackExamples, upsertItem, setItemFeedback, markItem;

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'db.json'), JSON.stringify({
    feeds: [{ id: 'f1', name: 'Test Feed', active: 1, category: 'research' }],
    items: [],
  }));
  process.env.DATA_DIR = tmpDir;

  const db = await import('../db.js');
  getRecentFeedbackExamples = db.getRecentFeedbackExamples;
  upsertItem = db.upsertItem;
  setItemFeedback = db.setItemFeedback;
  markItem = db.markItem;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

function makeItem(overrides) {
  const id = overrides.id || `item-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    feed_id: 'f1',
    title: `Item ${id}`,
    summary: 'Test summary',
    url: 'https://example.com',
    published: new Date().toISOString(),
    category: 'research',
    relevance: 0.7,
    relevance_reason: 'Relevant test item',
    scored_at: new Date().toISOString(),
    tags: [],
    read: 0,
    saved: 0,
    dismissed: 0,
    feedback: null,
    feedback_boost: 0,
    ...overrides,
  };
}

describe('getRecentFeedbackExamples', () => {
  it('returns empty array when no feedback exists', () => {
    const examples = getRecentFeedbackExamples();
    expect(examples).toEqual([]);
  });

  it('returns liked example for thumbs-up feedback', () => {
    upsertItem(makeItem({ id: 'fb-up', title: 'Liked Article' }));
    setItemFeedback('fb-up', 1);

    const examples = getRecentFeedbackExamples();
    expect(examples).toHaveLength(1);
    expect(examples[0].signal).toBe('liked');
    expect(examples[0].title).toBe('Liked Article');
  });

  it('returns disliked example for thumbs-down feedback', () => {
    upsertItem(makeItem({ id: 'fb-down', title: 'Disliked Article' }));
    setItemFeedback('fb-down', -1);

    const examples = getRecentFeedbackExamples();
    const disliked = examples.filter(e => e.signal === 'disliked');
    expect(disliked.length).toBeGreaterThanOrEqual(1);
    expect(disliked.find(e => e.title === 'Disliked Article')).toBeTruthy();
  });

  it('treats saved items as liked', () => {
    upsertItem(makeItem({ id: 'fb-saved', title: 'Saved Article' }));
    markItem('fb-saved', 'saved', true);

    const examples = getRecentFeedbackExamples();
    const saved = examples.find(e => e.title === 'Saved Article');
    expect(saved).toBeTruthy();
    expect(saved.signal).toBe('liked');
  });

  it('treats dismissed items as disliked', () => {
    upsertItem(makeItem({ id: 'fb-dismissed', title: 'Dismissed Article' }));
    markItem('fb-dismissed', 'dismissed', true);

    const examples = getRecentFeedbackExamples();
    const dismissed = examples.find(e => e.title === 'Dismissed Article');
    expect(dismissed).toBeTruthy();
    expect(dismissed.signal).toBe('disliked');
  });

  it('explicit feedback overrides implicit signals', () => {
    // Item is saved but thumbs-downed
    upsertItem(makeItem({ id: 'fb-override', title: 'Override Article', saved: 1 }));
    setItemFeedback('fb-override', -1);

    const examples = getRecentFeedbackExamples();
    const item = examples.find(e => e.title === 'Override Article');
    expect(item).toBeTruthy();
    expect(item.signal).toBe('disliked'); // explicit feedback wins
  });

  it('respects maxPerSignal limit', () => {
    // Add 10 thumbs-up items
    for (let i = 0; i < 10; i++) {
      upsertItem(makeItem({ id: `fb-bulk-${i}`, title: `Bulk Liked ${i}` }));
      setItemFeedback(`fb-bulk-${i}`, 1);
    }

    const examples = getRecentFeedbackExamples(3);
    const liked = examples.filter(e => e.signal === 'liked');
    expect(liked.length).toBeLessThanOrEqual(3);
  });

  it('ignores unscored items', () => {
    upsertItem(makeItem({ id: 'fb-unscored', title: 'Unscored', scored_at: null }));
    setItemFeedback('fb-unscored', 1);

    const examples = getRecentFeedbackExamples();
    expect(examples.find(e => e.title === 'Unscored')).toBeFalsy();
  });

  it('returns correct shape for each example', () => {
    const examples = getRecentFeedbackExamples();
    expect(examples.length).toBeGreaterThan(0);
    const ex = examples[0];
    expect(ex).toHaveProperty('title');
    expect(ex).toHaveProperty('category');
    expect(ex).toHaveProperty('relevance');
    expect(ex).toHaveProperty('reason');
    expect(ex).toHaveProperty('signal');
    expect(['liked', 'disliked']).toContain(ex.signal);
  });
});
