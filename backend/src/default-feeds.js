// Feed configuration loader — reads/writes backend/feeds.json
// In Electron packaged mode, feeds.json is inside the read-only asar archive.
// Writes are skipped — user-added feeds persist via upsertFeed() in db.json.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEEDS_FILE = path.join(__dirname, "..", "feeds.json");

export function loadDefaultFeeds() {
  const raw = fs.readFileSync(FEEDS_FILE, "utf-8");
  return JSON.parse(raw);
}

export function saveDefaultFeeds(feeds) {
  try {
    fs.writeFileSync(FEEDS_FILE, JSON.stringify(feeds, null, 2) + "\n");
  } catch (e) {
    // Expected in Electron packaged mode — feeds.json is inside the asar
    if (e.code === "ENOTDIR" || e.code === "EROFS" || e.code === "EACCES") {
      // Silently skip — user feeds are persisted in db.json via upsertFeed()
      return;
    }
    throw e;
  }
}
