// ── Recognized organizations for affiliation tagging ────────────────────────
// Each org has an id, display label, type, and optional aliases the LLM or
// regex can match against.  This list is also served to the frontend via API.
// User-added orgs are merged at runtime from settings.json.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BUILTIN_ORGS = [
  // AI labs & big tech
  { id: "google", label: "Google", type: "company", url: "https://google.com", aliases: ["Google DeepMind", "DeepMind", "Google Brain", "Google Research"] },
  { id: "openai", label: "OpenAI", type: "lab", url: "https://openai.com", aliases: [] },
  { id: "anthropic", label: "Anthropic", type: "lab", url: "https://anthropic.com", aliases: [] },
  { id: "meta", label: "Meta", type: "company", url: "https://meta.com", aliases: ["Meta AI", "Facebook AI", "FAIR"] },
  { id: "microsoft", label: "Microsoft", type: "company", url: "https://microsoft.com", aliases: ["Microsoft Research", "MSR"] },
  { id: "apple", label: "Apple", type: "company", url: "https://apple.com", aliases: ["Apple MLR"] },
  { id: "amazon", label: "Amazon", type: "company", url: "https://amazon.com", aliases: ["AWS", "AWS AI", "Amazon Science"] },
  { id: "nvidia", label: "NVIDIA", type: "company", url: "https://nvidia.com", aliases: ["Nvidia Research"] },
  { id: "xai", label: "xAI", type: "lab", url: "https://x.ai", aliases: [] },
  { id: "mistral", label: "Mistral", type: "lab", url: "https://mistral.ai", aliases: ["Mistral AI"] },
  { id: "cohere", label: "Cohere", type: "lab", url: "https://cohere.com", aliases: [] },
  { id: "huggingface", label: "Hugging Face", type: "lab", url: "https://huggingface.co", aliases: ["HuggingFace"] },
  { id: "baidu", label: "Baidu", type: "company", url: "https://baidu.com", aliases: ["ERNIE", "Baidu Research"] },
  { id: "tencent", label: "Tencent", type: "company", url: "https://tencent.com", aliases: ["Tencent AI Lab"] },
  { id: "alibaba", label: "Alibaba", type: "company", url: "https://alibaba.com", aliases: ["DAMO Academy", "Alibaba Cloud"] },
  { id: "bytedance", label: "ByteDance", type: "company", url: "https://bytedance.com", aliases: [] },
  { id: "samsung", label: "Samsung", type: "company", url: "https://samsung.com", aliases: ["Samsung AI"] },
  { id: "intel", label: "Intel", type: "company", url: "https://intel.com", aliases: ["Intel Labs"] },
  { id: "ibm", label: "IBM", type: "company", url: "https://ibm.com", aliases: ["IBM Research"] },
  { id: "salesforce", label: "Salesforce", type: "company", url: "https://salesforce.com", aliases: ["Salesforce AI Research"] },
  // Top universities
  { id: "stanford", label: "Stanford", type: "university", url: "https://stanford.edu", aliases: ["Stanford University", "Stanford HAI"] },
  { id: "mit", label: "MIT", type: "university", url: "https://mit.edu", aliases: ["Massachusetts Institute of Technology", "MIT CSAIL"] },
  { id: "cmu", label: "CMU", type: "university", url: "https://cmu.edu", aliases: ["Carnegie Mellon", "Carnegie Mellon University"] },
  { id: "berkeley", label: "Berkeley", type: "university", url: "https://berkeley.edu", aliases: ["UC Berkeley", "University of California Berkeley", "BAIR"] },
  { id: "harvard", label: "Harvard", type: "university", url: "https://harvard.edu", aliases: ["Harvard University"] },
  { id: "princeton", label: "Princeton", type: "university", url: "https://princeton.edu", aliases: ["Princeton University"] },
  { id: "oxford", label: "Oxford", type: "university", url: "https://ox.ac.uk", aliases: ["University of Oxford"] },
  { id: "cambridge", label: "Cambridge", type: "university", url: "https://cam.ac.uk", aliases: ["University of Cambridge"] },
  { id: "eth", label: "ETH", type: "university", url: "https://ethz.ch", aliases: ["ETH Zürich", "ETH Zurich"] },
  { id: "tsinghua", label: "Tsinghua", type: "university", url: "https://tsinghua.edu.cn", aliases: ["Tsinghua University"] },
  { id: "peking", label: "Peking U", type: "university", url: "https://pku.edu.cn", aliases: ["Peking University"] },
  { id: "toronto", label: "U Toronto", type: "university", url: "https://utoronto.ca", aliases: ["University of Toronto"] },
  { id: "mila", label: "Mila", type: "university", url: "https://mila.quebec", aliases: ["Montreal", "Montréal", "MILA", "Université de Montréal"] },
  { id: "ai2", label: "AI2", type: "lab", url: "https://allenai.org", aliases: ["Allen Institute", "Allen Institute for AI"] },
];

// Map feed IDs to their org affiliation (for direct-source feeds)
const FEED_ORG_MAP = {
  "openai-blog": "openai",
  "anthropic-blog": "anthropic",
  "google-deepmind-blog": "google",
  "mistral-blog": "mistral",
  "facebook-research": "meta",
  "aiatmeta": "meta",
  "microsoft-research": "microsoft",
  "microsoft-research-ai": "microsoft",
  "microsoft-ai-blog": "microsoft",
  "apple-machine-learning": "apple",
  "nvidia-developer-blog": "nvidia",
  "nvidia-ai-enterprise-blog": "nvidia",
  "aws-ai-blog": "amazon",
  "berkeley-ai-research-bair": "berkeley",
  "dario-amodei-anthropic-ceo": "anthropic",
};

// ── User-added orgs persistence ─────────────────────────────────────────────

function getSettingsFile() {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
  return path.join(path.dirname(dataDir), "settings.json");
}

function loadUserOrgs() {
  try {
    const s = JSON.parse(fs.readFileSync(getSettingsFile(), "utf-8"));
    return s.USER_ORGS || [];
  } catch { return []; }
}

function saveUserOrgs(orgs) {
  const file = getSettingsFile();
  let s = {};
  try { s = JSON.parse(fs.readFileSync(file, "utf-8")); } catch { /* */ }
  s.USER_ORGS = orgs;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(s, null, 2));
}

function loadDeactivatedOrgs() {
  try {
    const s = JSON.parse(fs.readFileSync(getSettingsFile(), "utf-8"));
    return new Set(s.DEACTIVATED_ORGS || []);
  } catch { return new Set(); }
}

function saveDeactivatedOrgs(ids) {
  const file = getSettingsFile();
  let s = {};
  try { s = JSON.parse(fs.readFileSync(file, "utf-8")); } catch { /* */ }
  s.DEACTIVATED_ORGS = [...ids];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(s, null, 2));
}

// Merged list: builtins + user-added, with active flag
export function getOrgs() {
  const userOrgs = loadUserOrgs();
  const deactivated = loadDeactivatedOrgs();
  const builtinIds = new Set(BUILTIN_ORGS.map(o => o.id));
  const all = [...BUILTIN_ORGS, ...userOrgs.filter(o => !builtinIds.has(o.id))];
  return all.map(o => ({ ...o, active: !deactivated.has(o.id) }));
}

export function setOrgActive(id, active) {
  const deactivated = loadDeactivatedOrgs();
  if (active) deactivated.delete(id);
  else deactivated.add(id);
  saveDeactivatedOrgs(deactivated);
  return { ok: true };
}

export function getOrgById(id) {
  return getOrgs().find(o => o.id === id);
}

export function getOrgLabels() {
  return getOrgs().filter(o => o.active).map(o => o.label);
}

export function addOrg(org) {
  const all = getOrgs();
  if (all.find(o => o.id === org.id)) return { added: false, reason: "already exists" };
  const userOrgs = loadUserOrgs();
  userOrgs.push(org);
  saveUserOrgs(userOrgs);
  return { added: true };
}

export function removeOrg(id) {
  // Can only remove user-added orgs
  if (BUILTIN_ORGS.find(o => o.id === id)) return { removed: false, reason: "builtin" };
  const userOrgs = loadUserOrgs();
  const before = userOrgs.length;
  const filtered = userOrgs.filter(o => o.id !== id);
  if (filtered.length === before) return { removed: false, reason: "not found" };
  saveUserOrgs(filtered);
  return { removed: true };
}

// Get the org label for a feed (if it's a direct-source feed)
export function getFeedOrg(feedId) {
  const orgId = FEED_ORG_MAP[feedId];
  if (!orgId) return null;
  return getOrgs().find(o => o.id === orgId) || null;
}

// Build the list of all org names/aliases for LLM prompt
export function getOrgNamesForPrompt() {
  return getOrgs().filter(o => o.active).map(o => o.label + (o.aliases.length ? ` (also: ${o.aliases.join(", ")})` : "")).join("\n");
}
