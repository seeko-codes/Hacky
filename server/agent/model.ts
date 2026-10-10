// The only place that names AI models. Everything else imports from here.
// Reads GOOGLE_GENERATIVE_AI_API_KEY from the environment.
import {
  google,
  type GoogleEmbeddingModelOptions,
  type GoogleLanguageModelOptions,
} from "@ai-sdk/google";
import { defaultSettingsMiddleware, embedMany, wrapLanguageModel } from "ai";

export const CHAT_MODEL_ID = "gemini-3.8-flash";
export const EMBEDDING_MODEL_ID = "gemini-embedding-001";
/** Matches the vector(768) columns. Changing it means a migration and re-embedding. */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Chat model for streamText. Thinking is set to "low" (the floor for
 * gemini-3.8-flash) so chat replies and tool calls come back fast.
 */
export const chatModel = wrapLanguageModel({
  model: google(CHAT_MODEL_ID),
  middleware: defaultSettingsMiddleware({
    settings: {
      providerOptions: {
        google: {
          thinkingConfig: { thinkingLevel: "low" },
        } satisfies GoogleLanguageModelOptions,
      },
    },
  }),
});

export const embeddingModel = google.embedding(EMBEDDING_MODEL_ID);

/**
 * Embeds texts as 768-dim unit vectors, in input order.
 * "document" is for profile text we store; "query" is for search text.
 */
export async function embedTexts(
  texts: string[],
  kind: "document" | "query",
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: texts,
    dimensions: EMBEDDING_DIMENSIONS,
    // Batches of up to 100 go out together; keep parallelism low for the free tier.
    maxParallelCalls: 2,
    providerOptions: {
      google: {
        taskType: kind === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
      } satisfies GoogleEmbeddingModelOptions,
    },
  });

  return embeddings.map(normalize);
}

function normalize(vector: number[]): number[] {
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected a ${EMBEDDING_DIMENSIONS}-dim embedding, got ${vector.length}`,
    );
  }
  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || norm === 0) {
    throw new Error("Embedding has zero or invalid length");
  }
  return vector.map((x) => x / norm);
}
