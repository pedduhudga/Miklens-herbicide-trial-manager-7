export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export const AVAILABLE_GEMINI_MODELS = [
  // ── Gemini 3 Generation (September 2026 Active Lineup — 100% Free Tier) ────
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    description: "Frontier GA (Sept 2026). Supreme multimodal reasoning, agentic vision & weed/pathology ID (1500 RPD, 15 RPM free).",
    tier: "free_accessible",
    isDefault: true
  },
  {
    id: "gemini-3.7-flash",
    name: "Gemini 3.7 Flash",
    description: "Stable GA (Aug 2026). High-efficiency workhorse model for fast multimodal crop plot analysis (1500 RPD, 15 RPM free).",
    tier: "free_accessible"
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    description: "Stable Production. High intelligence and robust vision understanding (1500 RPD, 15 RPM free).",
    tier: "free_accessible"
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash-Lite",
    description: "Ultra-Fast GA. Highest throughput, lowest latency for high-volume photo batch scanning (1500 RPD, 30 RPM free).",
    tier: "free_accessible"
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    description: "Deep Reasoning. Complex agronomic synthesis, comprehensive trial reports & statistical insights (50 RPD, 5 RPM free).",
    tier: "free_accessible"
  }
];

export const GEMINI_FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-pro-preview"
];
