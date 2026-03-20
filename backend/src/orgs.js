// ── Recognized organizations for affiliation tagging ────────────────────────
// Each org has an id, display label, type, and optional aliases the LLM or
// regex can match against.  This list is also served to the frontend via API.

const ORGS = [
  // AI labs & big tech
  { id: "google", label: "Google", type: "company", aliases: ["Google DeepMind", "DeepMind", "Google Brain", "Google Research"] },
  { id: "openai", label: "OpenAI", type: "lab", aliases: [] },
  { id: "anthropic", label: "Anthropic", type: "lab", aliases: [] },
  { id: "meta", label: "Meta", type: "company", aliases: ["Meta AI", "Facebook AI", "FAIR"] },
  { id: "microsoft", label: "Microsoft", type: "company", aliases: ["Microsoft Research", "MSR"] },
  { id: "apple", label: "Apple", type: "company", aliases: ["Apple MLR"] },
  { id: "amazon", label: "Amazon", type: "company", aliases: ["AWS", "AWS AI", "Amazon Science"] },
  { id: "nvidia", label: "NVIDIA", type: "company", aliases: ["Nvidia Research"] },
  { id: "xai", label: "xAI", type: "lab", aliases: [] },
  { id: "mistral", label: "Mistral", type: "lab", aliases: ["Mistral AI"] },
  { id: "cohere", label: "Cohere", type: "lab", aliases: [] },
  { id: "huggingface", label: "Hugging Face", type: "lab", aliases: ["HuggingFace"] },
  { id: "baidu", label: "Baidu", type: "company", aliases: ["ERNIE", "Baidu Research"] },
  { id: "tencent", label: "Tencent", type: "company", aliases: ["Tencent AI Lab"] },
  { id: "alibaba", label: "Alibaba", type: "company", aliases: ["DAMO Academy", "Alibaba Cloud"] },
  { id: "bytedance", label: "ByteDance", type: "company", aliases: [] },
  { id: "samsung", label: "Samsung", type: "company", aliases: ["Samsung AI"] },
  { id: "intel", label: "Intel", type: "company", aliases: ["Intel Labs"] },
  { id: "ibm", label: "IBM", type: "company", aliases: ["IBM Research"] },
  { id: "salesforce", label: "Salesforce", type: "company", aliases: ["Salesforce AI Research"] },
  // Top universities
  { id: "stanford", label: "Stanford", type: "university", aliases: ["Stanford University", "Stanford HAI"] },
  { id: "mit", label: "MIT", type: "university", aliases: ["Massachusetts Institute of Technology", "MIT CSAIL"] },
  { id: "cmu", label: "CMU", type: "university", aliases: ["Carnegie Mellon", "Carnegie Mellon University"] },
  { id: "berkeley", label: "Berkeley", type: "university", aliases: ["UC Berkeley", "University of California Berkeley", "BAIR"] },
  { id: "harvard", label: "Harvard", type: "university", aliases: ["Harvard University"] },
  { id: "princeton", label: "Princeton", type: "university", aliases: ["Princeton University"] },
  { id: "oxford", label: "Oxford", type: "university", aliases: ["University of Oxford"] },
  { id: "cambridge", label: "Cambridge", type: "university", aliases: ["University of Cambridge"] },
  { id: "eth", label: "ETH", type: "university", aliases: ["ETH Zürich", "ETH Zurich"] },
  { id: "tsinghua", label: "Tsinghua", type: "university", aliases: ["Tsinghua University"] },
  { id: "peking", label: "Peking U", type: "university", aliases: ["Peking University"] },
  { id: "toronto", label: "U Toronto", type: "university", aliases: ["University of Toronto"] },
  { id: "mila", label: "Mila", type: "university", aliases: ["Montreal", "Montréal", "MILA", "Université de Montréal"] },
  { id: "ai2", label: "AI2", type: "lab", aliases: ["Allen Institute", "Allen Institute for AI"] },
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

export function getOrgs() {
  return ORGS;
}

export function getOrgById(id) {
  return ORGS.find(o => o.id === id);
}

export function getOrgLabels() {
  return ORGS.map(o => o.label);
}

// Get the org label for a feed (if it's a direct-source feed)
export function getFeedOrg(feedId) {
  const orgId = FEED_ORG_MAP[feedId];
  if (!orgId) return null;
  return ORGS.find(o => o.id === orgId) || null;
}

// Build the list of all org names/aliases for LLM prompt
export function getOrgNamesForPrompt() {
  return ORGS.map(o => o.label + (o.aliases.length ? ` (also: ${o.aliases.join(", ")})` : "")).join("\n");
}
