export interface TGConfig {
  openaiApiKey: string;
  langsmithApiKey: string;
  langsmithProject: string;
  advisorModel: string;
  fastModel: string;
  maxRetrievalChunks: number;
  advisorMaxTokens: number;
  enableImplementationGovernance: boolean;
  enableMaturityScoring: boolean;
}

export function getTGConfig(): TGConfig {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error("ValidationError: OPENAI_API_KEY is required");
  }

  return {
    openaiApiKey,
    langsmithApiKey: process.env.LANGSMITH_API_KEY ?? "",
    langsmithProject: process.env.LANGSMITH_PROJECT ?? "truly-govern",
    advisorModel: process.env.TG_ADVISOR_MODEL ?? "gpt-4o",
    fastModel: process.env.TG_FAST_MODEL ?? "gpt-4o-mini",
    maxRetrievalChunks: parseInt(process.env.TG_MAX_RETRIEVAL_CHUNKS ?? "16", 10),
    advisorMaxTokens: parseInt(process.env.TG_ADVISOR_MAX_TOKENS ?? "4096", 10),
    enableImplementationGovernance: process.env.TG_ENABLE_IMPLEMENTATION_GOVERNANCE === "true",
    enableMaturityScoring: process.env.TG_ENABLE_MATURITY_SCORING === "true",
  };
}
