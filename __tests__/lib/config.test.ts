/**
 * Tests for lib/truly-govern/config.ts — getTGConfig()
 */

describe("getTGConfig", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    // Isolate env mutations per test
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function loadGetTGConfig() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@/lib/truly-govern/config").getTGConfig;
  }

  // ── Missing required key ─────────────────────────────────────────────────

  it("throws when OPENAI_API_KEY is not set", () => {
    delete process.env.OPENAI_API_KEY;
    const getTGConfig = loadGetTGConfig();
    expect(() => getTGConfig()).toThrow("OPENAI_API_KEY is required");
  });

  // ── Defaults ─────────────────────────────────────────────────────────────

  it("returns correct defaults when only OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    const getTGConfig = loadGetTGConfig();
    const config = getTGConfig();

    expect(config.openaiApiKey).toBe("sk-test-key");
    expect(config.langsmithApiKey).toBe("");
    expect(config.langsmithProject).toBe("truly-govern");
    expect(config.advisorModel).toBe("gpt-4o");
    expect(config.fastModel).toBe("gpt-4o-mini");
    expect(config.maxRetrievalChunks).toBe(16);
    expect(config.advisorMaxTokens).toBe(4096);
    expect(config.enableImplementationGovernance).toBe(false);
    expect(config.enableMaturityScoring).toBe(false);
  });

  // ── Custom env values ────────────────────────────────────────────────────

  it("respects custom environment variable overrides", () => {
    process.env.OPENAI_API_KEY = "sk-custom";
    process.env.LANGSMITH_API_KEY = "ls-key";
    process.env.LANGSMITH_PROJECT = "my-project";
    process.env.TG_ADVISOR_MODEL = "gpt-4-turbo";
    process.env.TG_FAST_MODEL = "gpt-3.5-turbo";
    process.env.TG_MAX_RETRIEVAL_CHUNKS = "32";
    process.env.TG_ADVISOR_MAX_TOKENS = "8192";
    process.env.TG_ENABLE_IMPLEMENTATION_GOVERNANCE = "true";
    process.env.TG_ENABLE_MATURITY_SCORING = "true";

    const getTGConfig = loadGetTGConfig();
    const config = getTGConfig();

    expect(config.openaiApiKey).toBe("sk-custom");
    expect(config.langsmithApiKey).toBe("ls-key");
    expect(config.langsmithProject).toBe("my-project");
    expect(config.advisorModel).toBe("gpt-4-turbo");
    expect(config.fastModel).toBe("gpt-3.5-turbo");
    expect(config.maxRetrievalChunks).toBe(32);
    expect(config.advisorMaxTokens).toBe(8192);
    expect(config.enableImplementationGovernance).toBe(true);
    expect(config.enableMaturityScoring).toBe(true);
  });

  // ── Boolean parsing ──────────────────────────────────────────────────────

  it("treats non-'true' strings as false for boolean flags", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.TG_ENABLE_IMPLEMENTATION_GOVERNANCE = "false";
    process.env.TG_ENABLE_MATURITY_SCORING = "yes"; // not "true"

    const getTGConfig = loadGetTGConfig();
    const config = getTGConfig();

    expect(config.enableImplementationGovernance).toBe(false);
    expect(config.enableMaturityScoring).toBe(false);
  });

  // ── Integer parsing ──────────────────────────────────────────────────────

  it("parses integer env vars correctly", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.TG_MAX_RETRIEVAL_CHUNKS = "64";
    process.env.TG_ADVISOR_MAX_TOKENS = "2048";

    const getTGConfig = loadGetTGConfig();
    const config = getTGConfig();

    expect(config.maxRetrievalChunks).toBe(64);
    expect(config.advisorMaxTokens).toBe(2048);
  });

  it("returns NaN for non-numeric chunk values", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.TG_MAX_RETRIEVAL_CHUNKS = "abc";

    const getTGConfig = loadGetTGConfig();
    const config = getTGConfig();

    expect(Number.isNaN(config.maxRetrievalChunks)).toBe(true);
  });
});
