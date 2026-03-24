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
    summarizeStream: vi.fn().mockReturnValue({
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
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
    const searchInput = screen.getByPlaceholderText('Search (/)...');
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

  it('recency slider exists in sidebar with default "All time" label', async () => {
    render(React.createElement(App));
    await waitFor(() => {
      expect(screen.getByText('RECENCY')).toBeInTheDocument();
    });
    expect(screen.getByText('All time')).toBeInTheDocument();
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

// ── Keyboard Navigation ──────────────────────────────────────────────────────

const mockItems = [
  {
    id: 'item-1', title: 'First Item', summary: 'Summary one',
    feed_id: 'f1', category: 'research', relevance: 0.9, url: 'https://example.com/1',
    published: new Date().toISOString(), affiliations: [],
    tags: [], read: 0, saved: 0, dismissed: 0, feedback: null,
  },
  {
    id: 'item-2', title: 'Second Item', summary: 'Summary two',
    feed_id: 'f1', category: 'research', relevance: 0.7, url: 'https://example.com/2',
    published: new Date().toISOString(), affiliations: [],
    tags: [], read: 0, saved: 0, dismissed: 0, feedback: null,
  },
  {
    id: 'item-3', title: 'Third Item', summary: 'Summary three',
    feed_id: 'f1', category: 'engineering', relevance: 0.6, url: 'https://example.com/3',
    published: new Date().toISOString(), affiliations: [],
    tags: [], read: 0, saved: 0, dismissed: 0, feedback: null,
  },
];

function setupWithItems() {
  api.getItems.mockResolvedValue({ items: mockItems, total: 3 });
  api.getFeeds.mockResolvedValue([{ id: 'f1', name: 'Test Feed', active: true }]);
  api.getStats.mockResolvedValue({ totalItems: 3, unread: 3, critical: 0, saved: 0, byCategory: [] });
}

describe('Keyboard Navigation', () => {
  it('pressing j focuses the first item', async () => {
    setupWithItems();
    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'j' });

    const firstItemEl = screen.getByText('First Item').closest('[data-item-index]');
    expect(firstItemEl).toHaveAttribute('data-item-index', '0');
    expect(firstItemEl.style.outline).toContain('solid');
  });

  it('pressing j then k moves focus down then back up', async () => {
    setupWithItems();
    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'j' }); // → index 0
    fireEvent.keyDown(document, { key: 'j' }); // → index 1

    const secondItem = screen.getByText('Second Item').closest('[data-item-index]');
    expect(secondItem.style.outline).toContain('solid');

    fireEvent.keyDown(document, { key: 'k' }); // → index 0

    const firstItem = screen.getByText('First Item').closest('[data-item-index]');
    expect(firstItem.style.outline).toContain('solid');
    expect(secondItem.style.outline).toBe('none');
  });

  it('pressing k at the top does not go negative', async () => {
    setupWithItems();
    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'j' }); // → index 0
    fireEvent.keyDown(document, { key: 'k' }); // stays at 0
    fireEvent.keyDown(document, { key: 'k' }); // stays at 0

    const firstItem = screen.getByText('First Item').closest('[data-item-index]');
    expect(firstItem.style.outline).toContain('solid');
  });

  it('pressing j at the bottom does not exceed item count', async () => {
    setupWithItems();
    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    // Press j 10 times — should stop at last item (index 2)
    for (let i = 0; i < 10; i++) fireEvent.keyDown(document, { key: 'j' });

    const thirdItem = screen.getByText('Third Item').closest('[data-item-index]');
    expect(thirdItem.style.outline).toContain('solid');
  });

  it('arrow keys work as alternatives to j/k', async () => {
    setupWithItems();
    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    const firstItem = screen.getByText('First Item').closest('[data-item-index]');
    expect(firstItem.style.outline).toContain('solid');

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    const secondItem = screen.getByText('Second Item').closest('[data-item-index]');
    expect(secondItem.style.outline).toContain('solid');

    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(firstItem.style.outline).toContain('solid');
  });

  it('Enter expands the focused item', async () => {
    setupWithItems();
    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'j' }); // focus first item
    fireEvent.keyDown(document, { key: 'Enter' }); // expand it

    // Expanded item shows action buttons (Dismiss is always present)
    await waitFor(() => {
      expect(screen.getByText(/Dismiss/)).toBeInTheDocument();
    });
  });

  it('s toggles save on focused item', async () => {
    setupWithItems();
    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'j' }); // focus first item
    fireEvent.keyDown(document, { key: 's' }); // save it

    await waitFor(() => {
      expect(api.toggleSave).toHaveBeenCalledWith('item-1', true);
    });
  });

  it('d dismisses the focused item', async () => {
    setupWithItems();
    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'j' });
    fireEvent.keyDown(document, { key: 'd' });

    await waitFor(() => {
      expect(api.dismissItem).toHaveBeenCalledWith('item-1');
    });
  });

  it('o opens focused item URL in new tab', async () => {
    setupWithItems();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});
    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'j' });
    fireEvent.keyDown(document, { key: 'o' });

    expect(openSpy).toHaveBeenCalledWith('https://example.com/1', '_blank');
    openSpy.mockRestore();
  });

  it('/ focuses the search input', async () => {
    setupWithItems();
    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: '/' });

    const searchInput = screen.getByPlaceholderText('Search (/)...');
    expect(document.activeElement).toBe(searchInput);
  });

  it('Escape clears focus', async () => {
    setupWithItems();
    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'j' }); // focus first item
    const firstItem = screen.getByText('First Item').closest('[data-item-index]');
    expect(firstItem.style.outline).toContain('solid');

    fireEvent.keyDown(document, { key: 'Escape' }); // clear focus

    expect(firstItem.style.outline).toBe('none');
  });

  it('? toggles keyboard help modal', async () => {
    setupWithItems();
    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: '?' });
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: '?' });
    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
  });

  it('shortcuts are suppressed when typing in search', async () => {
    setupWithItems();
    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('Search (/)...');
    searchInput.focus();
    fireEvent.keyDown(document, { key: 'j' });

    // No item should be focused — j was typed into search
    const firstItem = screen.getByText('First Item').closest('[data-item-index]');
    expect(firstItem.style.outline).toBe('none');
  });

  it('shortcuts hint button appears when no panel is open and no focus', async () => {
    setupWithItems();
    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    expect(screen.getByText('? shortcuts')).toBeInTheDocument();
  });
});

// ── Summarize Feature ─────────────────────────────────────────────────────────

describe('Summarize Feature', () => {
  it('Summarize button appears in expanded item actions', async () => {
    setupWithItems();
    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    // Click to expand the first item
    fireEvent.click(screen.getByText('First Item'));

    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
  });

  it('clicking Summarize button opens the summarize modal', async () => {
    setupWithItems();
    // Mock summarizeStream to simulate SSE lifecycle
    api.summarizeStream.mockImplementation((itemId, { onDone }) => {
      // Simulate async completion
      setTimeout(() => {
        onDone({ result: 'Test summary content', generatedAt: new Date().toISOString(), provider: 'anthropic', model: 'claude-sonnet', contentSource: 'html' });
      }, 10);
      return { close: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
    });

    render(React.createElement(App));
    await waitFor(() => expect(screen.getByText('First Item')).toBeInTheDocument());

    // Expand item
    fireEvent.click(screen.getByText('First Item'));
    await waitFor(() => expect(screen.getByText('Summarize')).toBeInTheDocument());

    // Click Summarize
    fireEvent.click(screen.getByText('Summarize'));

    // The modal should open and call summarizeStream with the item ID
    await waitFor(() => {
      expect(api.summarizeStream).toHaveBeenCalledWith('item-1', expect.any(Object));
    });
  });
});
