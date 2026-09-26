// Verified active models as of September 2026 via official Google AI for Developers docs
// and web research. gemini-3.8-flash = GA Sept 2 2026, gemini-3.5-flash = GA May 2026,
// gemini-3.5-flash-lite = GA July 2026, gemini-2.5-flash = Legacy (retiring Oct 20, 2026)

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

export const AVAILABLE_GEMINI_MODELS = [
  // ── Gemini 3 Generation (Current Active Lineup) ──────────────────────────────────
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    description: "Latest GA (Sept 2026). Best reasoning, agentic vision & weed/pathology ID. Free: 5 RPM / 20 RPD.",
    tier: "free_accessible",
    isDefault: false
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    description: "Stable GA (May 2026). High-throughput multimodal crop plot analysis. Free: 500 RPD.",
    tier: "free_accessible"
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash-Lite",
    description: "Best free-tier throughput (July 2026). Ultra-low latency, 1000 RPD / 15 RPM free. Recommended default.",
    tier: "free_accessible",
    isDefault: true
  },
  // ── Gemini 2.5 Generation (Legacy Fallback — retiring Oct 20, 2026) ──────────────
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash (Legacy)",
    description: "Legacy fallback model. Retiring Oct 20, 2026. Use only as last resort. 500 RPD.",
    tier: "free_accessible"
  }
];

export const GEMINI_FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash"
];
