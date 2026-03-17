// Feed configuration loader — reads/writes backend/feeds.json
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
  fs.writeFileSync(FEEDS_FILE, JSON.stringify(feeds, null, 2) + "\n");
}
