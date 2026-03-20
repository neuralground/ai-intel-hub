import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import api after mocking
import { api } from '../api.js';

beforeEach(() => {
  mockFetch.mockReset();
});

function mockOk(data) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockError(status, error) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.resolve({ error }),
  });
}

describe('api', () => {
  describe('getFeeds', () => {
    it('calls GET /api/feeds', async () => {
      const feeds = [{ id: 'f1', name: 'Feed 1' }];
      mockOk(feeds);
      const result = await api.getFeeds();
      expect(result).toEqual(feeds);
      expect(mockFetch).toHaveBeenCalledWith('/api/feeds', expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }));
    });
  });

  describe('getItems', () => {
    it('builds query string from params', async () => {
      mockOk({ items: [], total: 0 });
      await api.getItems({ category: 'research', minRelevance: 0.5 });
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('/api/items?');
      expect(url).toContain('category=research');
      expect(url).toContain('minRelevance=0.5');
    });

    it('skips undefined/null/empty params', async () => {
      mockOk({ items: [], total: 0 });
      await api.getItems({ category: undefined, search: '', limit: 25 });
      const url = mockFetch.mock.calls[0][0];
      expect(url).not.toContain('category=');
      expect(url).not.toContain('search=');
      expect(url).toContain('limit=25');
    });
  });

  describe('refreshAll', () => {
    it('calls POST /api/fetch', async () => {
      mockOk({ totalNew: 5 });
      const result = await api.refreshAll();
      expect(result).toEqual({ totalNew: 5 });
      expect(mockFetch).toHaveBeenCalledWith('/api/fetch', expect.objectContaining({
        method: 'POST',
      }));
    });

    it('passes signal to fetch', async () => {
      const abort = new AbortController();
      mockOk({ totalNew: 0 });
      await api.refreshAll({ signal: abort.signal });
      expect(mockFetch).toHaveBeenCalledWith('/api/fetch', expect.objectContaining({
        signal: abort.signal,
      }));
    });
  });

  describe('scoreItems', () => {
    it('calls POST /api/score', async () => {
      mockOk({ scored: 3 });
      const result = await api.scoreItems();
      expect(result).toEqual({ scored: 3 });
      expect(mockFetch).toHaveBeenCalledWith('/api/score', expect.objectContaining({
        method: 'POST',
      }));
    });

    it('passes signal to fetch', async () => {
      const abort = new AbortController();
      mockOk({ scored: 0 });
      await api.scoreItems({ signal: abort.signal });
      expect(mockFetch).toHaveBeenCalledWith('/api/score', expect.objectContaining({
        signal: abort.signal,
      }));
    });
  });

  describe('saveSettings', () => {
    it('calls POST /api/settings with JSON body', async () => {
      const data = { llmProvider: 'anthropic' };
      mockOk({ ok: true });
      await api.saveSettings(data);
      expect(mockFetch).toHaveBeenCalledWith('/api/settings', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(data),
      }));
    });
  });

  describe('getSettings', () => {
    it('calls GET /api/settings', async () => {
      const settings = { llmProvider: 'anthropic', hasApiKey: true };
      mockOk(settings);
      const result = await api.getSettings();
      expect(result).toEqual(settings);
      expect(mockFetch).toHaveBeenCalledWith('/api/settings', expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }));
    });
  });

  describe('getOrgs', () => {
    it('calls GET /api/orgs', async () => {
      const orgs = ['OpenAI', 'Google'];
      mockOk(orgs);
      const result = await api.getOrgs();
      expect(result).toEqual(orgs);
      expect(mockFetch).toHaveBeenCalledWith('/api/orgs', expect.objectContaining({}));
    });
  });

  describe('getOllamaModels', () => {
    it('calls GET /api/ollama/models', async () => {
      const models = { models: ['llama3'] };
      mockOk(models);
      const result = await api.getOllamaModels();
      expect(result).toEqual(models);
      expect(mockFetch).toHaveBeenCalledWith('/api/ollama/models', expect.objectContaining({}));
    });
  });

  describe('error handling', () => {
    it('throws with error message on non-ok response', async () => {
      mockError(500, 'Internal Server Error');
      await expect(api.getFeeds()).rejects.toThrow('Internal Server Error');
    });

    it('throws HTTP status when json parsing fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: () => Promise.reject(new Error('bad json')),
      });
      await expect(api.getFeeds()).rejects.toThrow('Service Unavailable');
    });
  });

  describe('analyze', () => {
    it('sends correct JSON body', async () => {
      mockOk({ analysis: 'test' });
      await api.analyze('briefing', 'research');
      expect(mockFetch).toHaveBeenCalledWith('/api/analyze', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ mode: 'briefing', category: 'research' }),
      }));
    });
  });

  describe('getOrgAffiliations', () => {
    it('calls GET /api/orgs/affiliations', async () => {
      const affiliations = ['OpenAI', 'Google'];
      mockOk(affiliations);
      const result = await api.getOrgAffiliations();
      expect(result).toEqual(affiliations);
      expect(mockFetch).toHaveBeenCalledWith('/api/orgs/affiliations', expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }));
    });
  });

  describe('addOrg', () => {
    it('calls POST /api/orgs with correct body', async () => {
      const org = { id: 'test-org', label: 'Test Org', type: 'lab', aliases: ['TO'] };
      mockOk({ added: true });
      const result = await api.addOrg(org);
      expect(result).toEqual({ added: true });
      expect(mockFetch).toHaveBeenCalledWith('/api/orgs', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(org),
      }));
    });
  });

  describe('removeOrg', () => {
    it('calls DELETE /api/orgs/:id', async () => {
      mockOk({ removed: true });
      const result = await api.removeOrg('test-id');
      expect(result).toEqual({ removed: true });
      expect(mockFetch).toHaveBeenCalledWith('/api/orgs/test-id', expect.objectContaining({
        method: 'DELETE',
      }));
    });
  });

  describe('cleanupItems', () => {
    it('calls POST /api/admin/cleanup with days', async () => {
      mockOk({ deleted: 10 });
      const result = await api.cleanupItems(7);
      expect(result).toEqual({ deleted: 10 });
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/cleanup', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ days: 7 }),
      }));
    });
  });

  describe('rescoreAll', () => {
    it('calls POST /api/admin/rescore', async () => {
      mockOk({ rescored: 50 });
      const result = await api.rescoreAll();
      expect(result).toEqual({ rescored: 50 });
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/rescore', expect.objectContaining({
        method: 'POST',
      }));
    });
  });
});
