import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const tmpDir = path.join(os.tmpdir(), 'intel-hub-db-helpers-test-' + Date.now());

let getItemById, getClusterMates, upsertItem;

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'db.json'), JSON.stringify({
    feeds: [{ id: 'f1', name: 'Test Feed', active: 1, category: 'research' }],
    items: [],
  }));
  process.env.DATA_DIR = tmpDir;

  const db = await import('../db.js');
  getItemById = db.getItemById;
  getClusterMates = db.getClusterMates;
  upsertItem = db.upsertItem;
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
    cluster_id: null,
    ...overrides,
  };
}

describe('getItemById', () => {
  it('returns the correct item by ID', () => {
    upsertItem(makeItem({ id: 'find-me', title: 'Findable Item' }));
    const item = getItemById('find-me');
    expect(item).not.toBeNull();
    expect(item.id).toBe('find-me');
    expect(item.title).toBe('Findable Item');
  });

  it('returns null for a non-existent ID', () => {
    const item = getItemById('does-not-exist');
    expect(item).toBeNull();
  });
});

describe('getClusterMates', () => {
  beforeAll(() => {
    // Create a cluster of items sharing the same cluster_id
    upsertItem(makeItem({ id: 'cluster-a', title: 'Cluster A', cluster_id: 'cluster-root', relevance: 0.9 }));
    upsertItem(makeItem({ id: 'cluster-b', title: 'Cluster B', cluster_id: 'cluster-root', relevance: 0.8 }));
    upsertItem(makeItem({ id: 'cluster-c', title: 'Cluster C', cluster_id: 'cluster-root', relevance: 0.7 }));
    upsertItem(makeItem({ id: 'cluster-d', title: 'Cluster D', cluster_id: 'cluster-root', relevance: 0.6 }));
    // A dismissed item in the same cluster (should be excluded)
    upsertItem(makeItem({ id: 'cluster-dismissed', title: 'Dismissed Mate', cluster_id: 'cluster-root', relevance: 0.95, dismissed: 1 }));
    // An item in a different cluster
    upsertItem(makeItem({ id: 'other-cluster', title: 'Other Cluster', cluster_id: 'other-root', relevance: 0.9 }));
  });

  it('returns items sharing the same cluster_id', () => {
    const mates = getClusterMates('cluster-root', 'cluster-a');
    expect(mates.length).toBeGreaterThanOrEqual(3);
    const ids = mates.map(m => m.id);
    expect(ids).toContain('cluster-b');
    expect(ids).toContain('cluster-c');
    expect(ids).toContain('cluster-d');
  });

  it('excludes the specified item from results', () => {
    const mates = getClusterMates('cluster-root', 'cluster-a');
    const ids = mates.map(m => m.id);
    expect(ids).not.toContain('cluster-a');
  });

  it('returns empty array when cluster_id is null or undefined', () => {
    expect(getClusterMates(null, 'cluster-a')).toEqual([]);
    expect(getClusterMates(undefined, 'cluster-a')).toEqual([]);
  });

  it('returns empty array when cluster_id is empty string', () => {
    expect(getClusterMates('', 'cluster-a')).toEqual([]);
  });

  it('respects the limit parameter', () => {
    const mates = getClusterMates('cluster-root', 'cluster-a', 2);
    expect(mates.length).toBeLessThanOrEqual(2);
  });

  it('returns results sorted by relevance descending', () => {
    const mates = getClusterMates('cluster-root', 'cluster-a');
    for (let i = 1; i < mates.length; i++) {
      expect(mates[i - 1].relevance).toBeGreaterThanOrEqual(mates[i].relevance);
    }
  });

  it('excludes dismissed items', () => {
    const mates = getClusterMates('cluster-root', 'cluster-a');
    const ids = mates.map(m => m.id);
    expect(ids).not.toContain('cluster-dismissed');
  });

  it('does not return items from other clusters', () => {
    const mates = getClusterMates('cluster-root', 'cluster-a');
    const ids = mates.map(m => m.id);
    expect(ids).not.toContain('other-cluster');
  });
});
