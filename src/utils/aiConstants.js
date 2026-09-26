export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const AVAILABLE_GEMINI_MODELS = [
  // ── Gemini 2.5 Generation (Current Production Lineup — Google AI Studio Free Tier) ──
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description: "Latest frontier GA. Supreme multimodal reasoning, agentic vision & weed/pathology ID (500 RPD, 10 RPM free).",
    tier: "free_accessible",
    isDefault: true
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
    description: "Ultra-low latency, high-throughput photo scanning (1500 RPD, 30 RPM free).",
    tier: "free_accessible"
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Deep Reasoning. Complex agronomic synthesis, comprehensive trial reports & statistical insights (50 RPD, 5 RPM free).",
    tier: "free_accessible"
  },
  // ── Gemini 2.0 Generation (Stable Fallback) ──────────────────────────────────────
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    description: "Stable GA. High-efficiency workhorse model for fast multimodal crop plot analysis (1500 RPD, 15 RPM free).",
    tier: "free_accessible"
  },
  {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash-Lite",
    description: "Highest throughput, lowest latency for high-volume photo batch scanning (30 RPM free).",
    tier: "free_accessible"
  },
  // ── Gemini 1.5 Generation (Legacy Reliable Fallback) ─────────────────────────────
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    description: "Proven stable production model for multimodal vision and analysis (1500 RPD, 15 RPM free).",
    tier: "free_accessible"
  },
  {
    id: "gemini-1.5-flash-8b",
    name: "Gemini 1.5 Flash 8B",
    description: "Ultra-fast, lightweight fallback for high-volume batch analysis (4000 RPD, 15 RPM free).",
    tier: "free_accessible"
  }
];

export const GEMINI_FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b"
];
