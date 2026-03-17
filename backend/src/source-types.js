/**
 * Source type registry — maps URL patterns to feed types.
 *
 * To add a new source type:
 *   1. Add an entry here with domain patterns and the type name
 *   2. Add a fetcher for the type in fetcher.js (if it needs custom ingestion)
 *   3. The add-feed form, type detection, and display all pick it up automatically
 *
 * Order matters: first match wins. More specific patterns should come first.
 * The "rss" fallback is handled separately (via parse attempt) and is not listed here.
 */

const SOURCE_TYPES = [
  {
    type: "x-account",
    label: "X / Twitter",
    domains: ["x.com", "twitter.com"],
    icon: "𝕏",
  },
  {
    type: "threads",
    label: "Threads",
    domains: ["threads.net", "www.threads.net"],
    icon: "@",
  },
  {
    type: "youtube",
    label: "YouTube",
    domains: ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"],
    icon: "▶",
  },
  {
    type: "linkedin",
    label: "LinkedIn",
    domains: ["linkedin.com", "www.linkedin.com"],
    icon: "in",
  },
  {
    type: "tiktok",
    label: "TikTok",
    domains: ["tiktok.com", "www.tiktok.com"],
    icon: "♪",
  },
  {
    type: "instagram",
    label: "Instagram",
    domains: ["instagram.com", "www.instagram.com"],
    icon: "📷",
  },
  {
    type: "bluesky",
    label: "Bluesky",
    domains: ["bsky.app"],
    icon: "🦋",
  },
  {
    type: "mastodon",
    label: "Mastodon",
    // Mastodon instances vary, but common ones are listed; others fall through to RSS
    domains: ["mastodon.social", "mastodon.online", "hachyderm.io", "fosstodon.org"],
    icon: "🐘",
  },
  {
    type: "substack",
    label: "Substack",
    domains: ["substack.com"],
    // Note: most Substack URLs also have RSS at /feed — the RSS check runs first,
    // so *.substack.com/feed will resolve as RSS. Only bare profile URLs land here.
    icon: "◉",
  },
];

/**
 * Detect source type from a URL by matching against the registry.
 * Returns the type string (e.g. "x-account", "youtube") or null if no match.
 */
export function detectSourceType(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    for (const entry of SOURCE_TYPES) {
      for (const domain of entry.domains) {
        const d = domain.replace(/^www\./, "");
        if (hostname === d || hostname.endsWith("." + d)) {
          return entry.type;
        }
      }
    }
  } catch { /* invalid URL */ }
  return null;
}

/**
 * Get the display label for a source type.
 */
export function getSourceLabel(type) {
  return SOURCE_TYPES.find(s => s.type === type)?.label || type;
}

export default SOURCE_TYPES;
