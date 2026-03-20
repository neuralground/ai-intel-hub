import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../useTheme.js';

// Mock matchMedia
const mockMatchMedia = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

beforeEach(() => {
  window.matchMedia = mockMatchMedia;
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('useTheme', () => {
  it('returns mode, resolved, and setMode', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current).toHaveProperty('mode');
    expect(result.current).toHaveProperty('resolved');
    expect(result.current).toHaveProperty('setMode');
    expect(typeof result.current.setMode).toBe('function');
  });

  it('defaults to "system" mode', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe('system');
  });

  it('resolves to "dark" by default when system prefers dark', () => {
    mockMatchMedia.mockReturnValue({
      matches: false, // prefers-color-scheme: light is false => dark
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe('dark');
  });

  it('resolves to "light" when system prefers light', () => {
    mockMatchMedia.mockReturnValue({
      matches: true, // prefers-color-scheme: light is true
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe('light');
  });

  it('setMode updates the mode', () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setMode('dark');
    });
    expect(result.current.mode).toBe('dark');
    expect(result.current.resolved).toBe('dark');
  });

  it('persists mode to localStorage', () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setMode('light');
    });
    expect(localStorage.getItem('ai-intel-hub-theme')).toBe('light');
  });

  it('reads from localStorage on init', () => {
    localStorage.setItem('ai-intel-hub-theme', 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe('light');
    expect(result.current.resolved).toBe('light');
  });

  it('sets data-theme attribute on document', () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setMode('light');
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
