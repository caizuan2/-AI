export type KnowledgeTrendWindow = "7d" | "30d" | "90d";

export type KnowledgeTrendLabel =
  | "fast_rising"
  | "stale_high_score"
  | "declining"
  | "evergreen"
  | "neutral";

export type KnowledgeTrendSignal = {
  usageDelta: number;
  feedbackDelta: number;
  behaviorDelta: number;
  freshnessDelta: number;
  trendScore: number;
  confidence: number;
};

export interface KnowledgeTrendDiagnostics extends KnowledgeTrendSignal {
  trendLabel: KnowledgeTrendLabel;
  fastRising: boolean;
  staleHighScore: boolean;
  decliningTrend: boolean;
  evergreen: boolean;
  staleRisk: number;
  trendReason: string;
  shadowMode: boolean;
  usage7d: number;
  usage30d: number;
  feedback7d: number;
  feedback30d: number;
  behavior7d: number;
  behavior30d: number;
}
