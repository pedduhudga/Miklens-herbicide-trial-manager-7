// Active models verified via Google AI Studio API:
// gemini-3.5-flash = Recommended production model (reliable, no 503 spikes, 500 RPD free)
// gemini-3.5-flash-lite = High free-tier throughput (1000 RPD / 15 RPM free, ultra-low latency)
// gemini-3.1-flash-lite = High-availability lightweight fallback (1000 RPD / 15 RPM free)
// gemini-flash-latest = Canonical alias pointing to current stable production flash
// gemini-3.6-flash = Oct 2026 GA (may experience temporary demand spikes)
// gemini-3.8-flash = Frontier reasoning & vision (Strict free tier cap: ~20 RPD)

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
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash-Lite",
    description: "Best free-tier throughput. Ultra-low latency, 1000 RPD / 15 RPM free. High availability for 100+ batch photos.",
    tier: "free_accessible"
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash-Lite",
    description: "High-capacity lightweight fallback. 1000 RPD / 15 RPM free. Ideal for multi-user photo analysis.",
    tier: "free_accessible"
  },
  {
    id: "gemini-flash-latest",
    name: "Gemini Flash (Latest Stable)",
    description: "Official canonical alias. Automatically routes to the highest-availability production model.",
    tier: "free_accessible"
  },
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    description: "Oct 2026 GA release. Rich vision, may experience occasional peak demand spikes. Free: 500 RPD.",
    tier: "free_accessible"
  },
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    description: "Frontier reasoning, agentic vision & deep weed ID. (Note: Free tier strictly capped at ~20 RPD / 5 RPM).",
    tier: "free_accessible"
  }
];

export const GEMINI_FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.6-flash",
  "gemini-3.8-flash"
];

