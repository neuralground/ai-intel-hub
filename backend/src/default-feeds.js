// Default feed configuration for AI Intelligence Hub
// Categories: research, engineering, industry, policy, labs

export const DEFAULT_FEEDS = [
  // ── AI Research (arXiv) ──────────────────────────────────────────────────
  { id: "arxiv-cs-ai", name: "arXiv cs.AI", url: "https://rss.arxiv.org/rss/cs.AI", type: "rss", category: "research" },
  { id: "arxiv-cs-lg", name: "arXiv cs.LG (Machine Learning)", url: "https://rss.arxiv.org/rss/cs.LG", type: "rss", category: "research" },
  { id: "arxiv-cs-cl", name: "arXiv cs.CL (NLP)", url: "https://rss.arxiv.org/rss/cs.CL", type: "rss", category: "research" },
  { id: "arxiv-cs-cr", name: "arXiv cs.CR (Crypto/Security)", url: "https://rss.arxiv.org/rss/cs.CR", type: "rss", category: "research" },
  { id: "arxiv-quant-ph", name: "arXiv quant-ph (Quantum)", url: "https://rss.arxiv.org/rss/quant-ph", type: "rss", category: "research" },

  // ── Research Substacks/Blogs ──────────────────────────────────────────────
  { id: "interconnects", name: "Interconnects (Nathan Lambert)", url: "https://www.interconnects.ai/feed", type: "rss", category: "research" },
  { id: "thegradient", name: "The Gradient", url: "https://thegradient.pub/rss/", type: "rss", category: "research" },

  // ── AI Engineering & Practice ─────────────────────────────────────────────
  { id: "latentspace", name: "Latent Space (swyx)", url: "https://www.latent.space/feed", type: "rss", category: "engineering" },
  { id: "simonwillison", name: "Simon Willison's Blog", url: "https://simonwillison.net/atom/everything/", type: "rss", category: "engineering" },
  { id: "oneusefulthing", name: "One Useful Thing (Ethan Mollick)", url: "https://www.oneusefulthing.org/feed", type: "rss", category: "engineering" },
  { id: "chiphuyen", name: "Chip Huyen", url: "https://huyenchip.com/feed.xml", type: "rss", category: "engineering" },
  { id: "eugeneyan", name: "Eugene Yan", url: "https://eugeneyan.com/rss/", type: "rss", category: "engineering" },
  { id: "lilianweng", name: "Lil'Log (Lilian Weng)", url: "https://lilianweng.github.io/index.xml", type: "rss", category: "engineering" },
  { id: "langchain-blog", name: "LangChain Blog", url: "https://blog.langchain.dev/rss/", type: "rss", category: "engineering" },

  // ── AI Labs Official Blogs ────────────────────────────────────────────────
  { id: "openai-blog", name: "OpenAI Blog", url: "https://openai.com/blog/rss.xml", type: "rss", category: "labs" },
  // { id: "anthropic-blog", name: "Anthropic Research", url: "https://www.anthropic.com/feed.xml", type: "rss", category: "labs" },  // no RSS feed available
  { id: "deepmind-blog", name: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", type: "rss", category: "labs" },
  // { id: "meta-ai", name: "Meta AI", url: "https://ai.meta.com/blog/rss/", type: "rss", category: "labs" },  // no RSS feed available
  { id: "google-ai-blog", name: "Google AI Blog", url: "https://blog.research.google/feeds/posts/default", type: "rss", category: "labs" },
  // { id: "mistral-blog", name: "Mistral AI Blog", url: "https://mistral.ai/feed.xml", type: "rss", category: "labs" },  // no RSS feed available
  // { id: "cohere-blog", name: "Cohere Blog", url: "https://cohere.com/blog/rss.xml", type: "rss", category: "labs" },  // no RSS feed available
  { id: "huggingface", name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", type: "rss", category: "labs" },

  // ── AI Industry & Capital ─────────────────────────────────────────────────
  // { id: "a16z-ai", name: "a16z AI", url: "https://a16z.com/feed/", type: "rss", category: "industry" },  // no RSS feed available
  { id: "benedictevan", name: "Benedict Evans", url: "https://www.ben-evans.com/benedictevans?format=rss", type: "rss", category: "industry" },
  { id: "stratechery", name: "Stratechery (Ben Thompson)", url: "https://stratechery.com/feed/", type: "rss", category: "industry" },
  { id: "semianalysis", name: "SemiAnalysis", url: "https://www.semianalysis.com/feed", type: "rss", category: "industry" },
  { id: "thetransc", name: "The Transcript (earnings calls)", url: "https://thetranscript.substack.com/feed", type: "rss", category: "industry" },

  // ── AI Policy & Governance ────────────────────────────────────────────────
  { id: "importai", name: "Import AI (Jack Clark)", url: "https://importai.substack.com/feed", type: "rss", category: "policy" },
  { id: "chinai", name: "ChinAI Newsletter", url: "https://chinai.substack.com/feed", type: "rss", category: "policy" },
  { id: "aisnakeit", name: "AI Snake Oil (Narayanan & Kapoor)", url: "https://www.aisnakeoil.com/feed", type: "rss", category: "policy" },
  // { id: "lawfareblog", name: "Lawfare (AI & Law)", url: "https://www.lawfaremedia.org/feed", type: "rss", category: "policy" },  // 403 - blocking feed requests
  // { id: "iapp-ai", name: "IAPP AI Governance", url: "https://iapp.org/rss/daily-dashboard", type: "rss", category: "policy" },  // no RSS feed available
  { id: "cset-georgetown", name: "CSET Georgetown", url: "https://cset.georgetown.edu/feed/", type: "rss", category: "policy" },

  // ── X Accounts (tracked, manual or API-based) ─────────────────────────────
  // Research
  { id: "x-karpathy", name: "@karpathy", url: "https://x.com/karpathy", type: "x-account", category: "research" },
  { id: "x-ylecun", name: "@ylecun", url: "https://x.com/ylecun", type: "x-account", category: "research" },
  { id: "x-fchollet", name: "@fchollet", url: "https://x.com/fchollet", type: "x-account", category: "research" },
  { id: "x-drjimfan", name: "@DrJimFan", url: "https://x.com/DrJimFan", type: "x-account", category: "research" },
  { id: "x-demishassabis", name: "@demishassabis", url: "https://x.com/demishassabis", type: "x-account", category: "research" },
  { id: "x-andrewng", name: "@AndrewYNg", url: "https://x.com/AndrewYNg", type: "x-account", category: "research" },
  // Engineering
  { id: "x-swyx", name: "@swyx", url: "https://x.com/swyx", type: "x-account", category: "engineering" },
  { id: "x-simonw", name: "@simonw", url: "https://x.com/simonw", type: "x-account", category: "engineering" },
  { id: "x-emollick", name: "@emollick", url: "https://x.com/emollick", type: "x-account", category: "engineering" },
  { id: "x-hwchase17", name: "@hwchase17", url: "https://x.com/hwchase17", type: "x-account", category: "engineering" },
  { id: "x-steipete", name: "@steipete", url: "https://x.com/steipete", type: "x-account", category: "engineering" },
  { id: "x-officiallogank", name: "@OfficialLoganK", url: "https://x.com/OfficialLoganK", type: "x-account", category: "engineering" },
  // Industry
  { id: "x-sama", name: "@sama", url: "https://x.com/sama", type: "x-account", category: "industry" },
  { id: "x-alexandrwang", name: "@alexandr_wang", url: "https://x.com/alexandr_wang", type: "x-account", category: "industry" },
  { id: "x-kevinweil", name: "@kevinweil", url: "https://x.com/kevinweil", type: "x-account", category: "industry" },
  // Policy
  { id: "x-garymarcus", name: "@GaryMarcus", url: "https://x.com/GaryMarcus", type: "x-account", category: "policy" },
  { id: "x-randomwalker", name: "@random_walker", url: "https://x.com/random_walker", type: "x-account", category: "policy" },
];
