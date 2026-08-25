/** A form definition plus answers matching its component keys. Answers come from a row index. */
export interface DevFormFixture {
  code: string;
  /** Definition fields only. The engine adds name, path, tags, and properties on upsert. */
  schema: Record<string, unknown>;
  /** Answers for row index. Keys must match component keys or Form.io drops them. */
  answers: (index: number) => Record<string, unknown>;
}
