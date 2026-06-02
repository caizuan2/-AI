import "server-only";

export function toVectorLiteral(embedding: number[]) {
  if (
    embedding.length === 0 ||
    embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new Error("Invalid embedding vector.");
  }

  return `[${embedding.join(",")}]`;
}
