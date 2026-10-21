// Active models verified via Google AI Studio API:
// gemini-3.5-flash = Recommended production model (reliable, no 503 spikes)
// gemini-flash-latest = Canonical alias pointing to current stable production flash
// gemini-3.5-flash-lite = High free-tier throughput (1000 RPD / 15 RPM)
// gemini-3.8-flash = Frontier reasoning & vision
// gemini-3.6-flash = Oct 2026 GA (may experience temporary demand spikes)

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

export const AVAILABLE_GEMINI_MODELS = [
  // ── Gemini Production Lineup ──────────────────────────────────────────────
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    description: "Most reliable production model. Fast, accurate agronomic vision without demand spikes. Free: 500 RPD.",
    tier: "free_accessible",
    isDefault: true
  },
  {
    id: "gemini-flash-latest",
    name: "Gemini Flash (Latest Stable)",
    description: "Official canonical alias. Automatically routes to the highest-availability production model.",
    tier: "free_accessible"
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash-Lite",
    description: "Best free-tier throughput. Ultra-low latency, 1000 RPD / 15 RPM free. High availability.",
    tier: "free_accessible"
  },
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    description: "Frontier reasoning, agentic vision & deep weed/pathology ID. Free: 5 RPM / 20 RPD.",
    tier: "free_accessible"
  },
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    description: "Oct 2026 release. May experience demand spikes during peak usage. Free: 500 RPD.",
    tier: "free_accessible"
  }
];

export const GEMINI_FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.6-flash"
];

