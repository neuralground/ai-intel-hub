import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock react-markdown
vi.mock('react-markdown', () => ({
  default: ({ children }) => React.createElement('div', { 'data-testid': 'markdown' }, children),
}));

// Mock matchMedia for useTheme
const mockMatchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
window.matchMedia = mockMatchMedia;

vi.mock('../api.js', () => ({
  api: {
    getItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getFeeds: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({ totalItems: 0, unread: 0, critical: 0, saved: 0, byCategory: [] }),
    getSettings: vi.fn().mockResolvedValue({ llmProvider: 'anthropic', hasApiKey: true }),
    getOrgs: vi.fn().mockResolvedValue([]),
    refreshAll: vi.fn().mockResolvedValue({ totalNew: 0 }),
    scoreItems: vi.fn().mockResolvedValue({ scored: 0 }),
    saveSettings: vi.fn().mockResolvedValue({ ok: true }),
    getOllamaModels: vi.fn().mockResolvedValue({ models: [] }),
    getFeedHealth: vi.fn().mockResolvedValue([]),
    markRead: vi.fn().mockResolvedValue({}),
    toggleSave: vi.fn().mockResolvedValue({}),
    dismissItem: vi.fn().mockResolvedValue({}),
    feedbackItem: vi.fn().mockResolvedValue({}),
    analyze: vi.fn().mockResolvedValue({ analysis: '' }),
    getSuggestions: vi.fn().mockResolvedValue([]),
    analyzeFeedHealth: vi.fn().mockResolvedValue([]),
    addFeed: vi.fn().mockResolvedValue({}),
    updateFeed: vi.fn().mockResolvedValue({}),
    deleteFeed: vi.fn().mockResolvedValue({}),
    deleteItem: vi.fn().mockResolvedValue({}),
    acceptSuggestion: vi.fn().mockResolvedValue({}),
    dismissSuggestion: vi.fn().mockResolvedValue({}),
    refreshFeed: vi.fn().mockResolvedValue({}),
    getOrgAffiliations: vi.fn().mockResolvedValue([]),
    addOrg: vi.fn().mockResolvedValue({ added: true }),
    removeOrg: vi.fn().mockResolvedValue({ removed: true }),
    cleanupItems: vi.fn().mockResolvedValue({ removed: 0 }),
    rescoreAll: vi.fn().mockResolvedValue({ reset: 0, scored: 0 }),
    checkServices: vi.fn().mockResolvedValue({}),
  },
}));

import App from '../App.jsx';
import { api } from '../api.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default mocks
  api.getItems.mockResolvedValue({ items: [], total: 0 });
  api.getFeeds.mockResolvedValue([]);
  api.getStats.mockResolvedValue({ totalItems: 0, unread: 0, critical: 0, saved: 0, byCategory: [] });
});

describe('App', () => {
  it('shows loading state initially', () => {
    // Make loadData never resolve so we stay in loading
    api.getItems.mockReturnValue(new Promise(() => {}));
    api.getFeeds.mockReturnValue(new Promise(() => {}));
    api.getStats.mockReturnValue(new Promise(() => {}));
    render(React.createElement(App));
    expect(screen.getByText('Loading sources...')).toBeInTheDocument();
  });

  it('renders the app header with "AI INTELLIGENCE HUB" text', async () => {
    render(React.createElement(App));
    await waitFor(() => {
      expect(screen.getByText('AI INTELLIGENCE HUB')).toBeInTheDocument();
    });
  });

  it('renders feed count and stats after loading', async () => {
    api.getFeeds.mockResolvedValue([
      { id: 'f1', name: 'Feed 1', active: true },
      { id: 'f2', name: 'Feed 2', active: true },
    ]);
    api.getStats.mockResolvedValue({ totalItems: 10, unread: 5, critical: 0, saved: 2, byCategory: [] });
    render(React.createElement(App));
    await waitFor(() => {
      expect(screen.getByText(/2 sources/)).toBeInTheDocument();
      expect(screen.getByText(/5 unread/)).toBeInTheDocument();
    });
  });

  it('refresh button exists and is clickable', async () => {
    render(React.createElement(App));
    await waitFor(() => {
      expect(screen.getByText('AI INTELLIGENCE HUB')).toBeInTheDocument();
    });
    const refreshBtn = screen.getByText('Refresh');
    expect(refreshBtn).toBeInTheDocument();
  });

  it('settings button (gear icon) exists', async () => {
    render(React.createElement(App));
    await waitFor(() => {
      expect(screen.getByText('AI INTELLIGENCE HUB')).toBeInTheDocument();
    });
    const settingsBtn = screen.getByTitle('Settings');
    expect(settingsBtn).toBeInTheDocument();
  });

  it('Brief, Saved, Sources buttons exist', async () => {
    render(React.createElement(App));
    await waitFor(() => {
      expect(screen.getByText('AI INTELLIGENCE HUB')).toBeInTheDocument();
    });
    expect(screen.getByTitle('Brief')).toBeInTheDocument();
    expect(screen.getByTitle('Saved')).toBeInTheDocument();
    expect(screen.getByTitle('Sources')).toBeInTheDocument();
  });

  it('search input exists and is interactive', async () => {
    render(React.createElement(App));
    await waitFor(() => {
      expect(screen.getByText('AI INTELLIGENCE HUB')).toBeInTheDocument();
    });
    const searchInput = screen.getByPlaceholderText('Search...');
    expect(searchInput).toBeInTheDocument();
    fireEvent.change(searchInput, { target: { value: 'test query' } });
    expect(searchInput.value).toBe('test query');
  });

  it('category sidebar renders with "CATEGORIES" heading', async () => {
    render(React.createElement(App));
    await waitFor(() => {
      expect(screen.getByText('CATEGORIES')).toBeInTheDocument();
    });
  });

  it('renders items with affiliation badges', async () => {
    const mockItems = [{
      id: 'test-1', title: 'Test Paper About AI Safety', summary: 'A test paper about AI',
      feed_id: 'arxiv-cs-ai', category: 'research', relevance: 0.9,
      published: new Date().toISOString(), affiliations: ['UnknownOrg'],
      tags: ['ai'], read: 0, saved: 0, dismissed: 0, feedback: null,
    }];
    api.getItems.mockResolvedValue({ items: mockItems, total: 1 });
    api.getFeeds.mockResolvedValue([{ id: 'arxiv-cs-ai', name: 'ArXiv CS AI', active: true }]);
    render(React.createElement(App));
    await waitFor(() => {
      expect(screen.getByText('Test Paper About AI Safety')).toBeInTheDocument();
    });
    // UnknownOrg has no logo, so it renders the name as text
    expect(screen.getByText('UnknownOrg')).toBeInTheDocument();
  });

  it('renders items with org affiliation text badge', async () => {
    const mockItems = [{
      id: 'test-2', title: 'OpenAI Research Paper', summary: 'About GPT',
      feed_id: 'arxiv-cs-ai', category: 'research', relevance: 0.85,
      published: new Date().toISOString(), affiliations: ['OpenAI'],
      tags: ['ai'], read: 0, saved: 0, dismissed: 0, feedback: null,
    }];
    api.getItems.mockResolvedValue({ items: mockItems, total: 1 });
    render(React.createElement(App));
    await waitFor(() => {
      expect(screen.getByText('OpenAI Research Paper')).toBeInTheDocument();
    });
    // Affiliation renders as a text badge with the org name
    const badges = screen.getAllByText('OpenAI');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows critical count in header when stats.critical > 0', async () => {
    api.getStats.mockResolvedValue({ totalItems: 10, unread: 5, critical: 3, saved: 0, byCategory: [] });
    render(React.createElement(App));
    await waitFor(() => {
      expect(screen.getByText('3 critical')).toBeInTheDocument();
    });
  });

  it('critical link is clickable and filters items', async () => {
    api.getStats.mockResolvedValue({ totalItems: 10, unread: 5, critical: 3, saved: 0, byCategory: [] });
    render(React.createElement(App));
    await waitFor(() => {
      expect(screen.getByText('3 critical')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('3 critical'));
    await waitFor(() => {
      expect(screen.getByText('CRITICAL ITEMS')).toBeInTheDocument();
    });
  });

  it('clicking refresh triggers api calls', async () => {
    render(React.createElement(App));
    await waitFor(() => {
      expect(screen.getByText('AI INTELLIGENCE HUB')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(api.refreshAll).toHaveBeenCalled();
    });
  });
});
