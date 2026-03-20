import { describe, it, expect } from 'vitest';
import { getOrgs, getOrgById, getFeedOrg, getOrgNamesForPrompt, getOrgLabels } from '../orgs.js';

describe('orgs', () => {
  describe('getOrgs', () => {
    it('returns all 34 orgs', () => {
      const orgs = getOrgs();
      expect(orgs).toHaveLength(34);
    });

    it('each org has required fields (id, label, type, aliases array)', () => {
      for (const org of getOrgs()) {
        expect(org).toHaveProperty('id');
        expect(org).toHaveProperty('label');
        expect(org).toHaveProperty('type');
        expect(org).toHaveProperty('aliases');
        expect(typeof org.id).toBe('string');
        expect(typeof org.label).toBe('string');
        expect(typeof org.type).toBe('string');
        expect(Array.isArray(org.aliases)).toBe(true);
      }
    });

    it('has no duplicate org IDs', () => {
      const ids = getOrgs().map(o => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('getOrgById', () => {
    it('finds org by id', () => {
      const org = getOrgById('openai');
      expect(org).toBeDefined();
      expect(org.label).toBe('OpenAI');
      expect(org.type).toBe('lab');
    });

    it('returns undefined for unknown id', () => {
      expect(getOrgById('nonexistent')).toBeUndefined();
    });
  });

  describe('getFeedOrg', () => {
    it('maps openai-blog to OpenAI', () => {
      const org = getFeedOrg('openai-blog');
      expect(org).toBeDefined();
      expect(org.label).toBe('OpenAI');
    });

    it('maps anthropic-blog to Anthropic', () => {
      const org = getFeedOrg('anthropic-blog');
      expect(org).toBeDefined();
      expect(org.label).toBe('Anthropic');
    });

    it('maps google-deepmind-blog to Google', () => {
      const org = getFeedOrg('google-deepmind-blog');
      expect(org).toBeDefined();
      expect(org.label).toBe('Google');
    });

    it('maps microsoft-research to Microsoft', () => {
      const org = getFeedOrg('microsoft-research');
      expect(org).toBeDefined();
      expect(org.label).toBe('Microsoft');
    });

    it('returns null for aggregator feeds like arxiv-cs-ai', () => {
      expect(getFeedOrg('arxiv-cs-ai')).toBeNull();
    });

    it('returns null for unknown feeds like latentspace', () => {
      expect(getFeedOrg('latentspace')).toBeNull();
    });
  });

  describe('getOrgNamesForPrompt', () => {
    it('returns a string containing all org labels', () => {
      const prompt = getOrgNamesForPrompt();
      expect(typeof prompt).toBe('string');
      for (const org of getOrgs()) {
        expect(prompt).toContain(org.label);
      }
    });

    it('includes aliases in parentheses', () => {
      const prompt = getOrgNamesForPrompt();
      // Google has aliases so it should contain "(also: ...)"
      expect(prompt).toContain('Google DeepMind');
    });
  });

  describe('getOrgLabels', () => {
    it('returns an array of all labels', () => {
      const labels = getOrgLabels();
      expect(Array.isArray(labels)).toBe(true);
      expect(labels).toHaveLength(34);
      expect(labels).toContain('OpenAI');
      expect(labels).toContain('Anthropic');
      expect(labels).toContain('Stanford');
    });
  });
});
