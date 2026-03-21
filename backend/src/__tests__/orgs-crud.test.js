import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const tmpDir = path.join(os.tmpdir(), 'intel-hub-orgs-test-' + Date.now());

let addOrg, removeOrg, getOrgs;

beforeAll(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  // settings.json lives one level up from DATA_DIR
  // getSettingsFile: path.join(path.dirname(dataDir), "settings.json")
  // So if DATA_DIR = tmpDir/data, settings.json = tmpDir/settings.json
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'settings.json'), JSON.stringify({}));
  process.env.DATA_DIR = dataDir;

  const orgs = await import('../orgs.js');
  addOrg = orgs.addOrg;
  removeOrg = orgs.removeOrg;
  getOrgs = orgs.getOrgs;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe('orgs CRUD', () => {
  const testOrg = { id: 'test-lab', label: 'Test Lab', type: 'lab', aliases: ['TL'] };

  it('addOrg returns {added: true} for a new org', () => {
    const result = addOrg(testOrg);
    expect(result).toEqual({ added: true });
  });

  it('addOrg returns {added: false} for a duplicate', () => {
    const result = addOrg(testOrg);
    expect(result).toEqual({ added: false, reason: 'already exists' });
  });

  it('getOrgs includes the user-added org', () => {
    const orgs = getOrgs();
    const found = orgs.find(o => o.id === 'test-lab');
    expect(found).toBeDefined();
    expect(found.label).toBe('Test Lab');
  });

  it('addOrg with url persists the url field', () => {
    const orgWithUrl = { id: 'url-lab', label: 'URL Lab', type: 'lab', url: 'https://urllab.ai', aliases: [] };
    const result = addOrg(orgWithUrl);
    expect(result).toEqual({ added: true });
    const found = getOrgs().find(o => o.id === 'url-lab');
    expect(found).toBeDefined();
    expect(found.url).toBe('https://urllab.ai');
    // Clean up
    removeOrg('url-lab');
  });

  it('removeOrg returns {removed: false, reason: "builtin"} for builtin orgs', () => {
    const result = removeOrg('openai');
    expect(result).toEqual({ removed: false, reason: 'builtin' });
  });

  it('removeOrg returns {removed: true} for user-added org', () => {
    const result = removeOrg('test-lab');
    expect(result).toEqual({ removed: true });
  });

  it('getOrgs no longer includes removed org', () => {
    const orgs = getOrgs();
    const found = orgs.find(o => o.id === 'test-lab');
    expect(found).toBeUndefined();
  });

  it('removeOrg returns {removed: false, reason: "not found"} for unknown org', () => {
    const result = removeOrg('nonexistent-org');
    expect(result).toEqual({ removed: false, reason: 'not found' });
  });
});
