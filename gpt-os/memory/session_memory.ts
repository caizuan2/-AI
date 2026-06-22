export interface GptOsSessionMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface GptOsSessionSnapshot {
  sessionId: string;
  messages: GptOsSessionMessage[];
  metadata: Record<string, unknown>;
}

export class SessionMemory {
  private readonly messages: GptOsSessionMessage[] = [];

  constructor(
    private readonly sessionId: string,
    private readonly metadata: Record<string, unknown> = {},
  ) {}

  addMessage(
    role: GptOsSessionMessage["role"],
    content: string,
    metadata?: Record<string, unknown>,
  ): GptOsSessionMessage {
    // Session memory is in-memory only and intentionally does not write to Prisma or storage.
    const message: GptOsSessionMessage = {
      role,
      content,
      createdAt: new Date().toISOString(),
      metadata,
    };
    this.messages.push(message);
    return message;
  }

  snapshot(): GptOsSessionSnapshot {
    return {
      sessionId: this.sessionId,
      messages: [...this.messages],
      metadata: { ...this.metadata },
    };
  }
}
