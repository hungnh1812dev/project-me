export class ContentEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentEngineError';
  }
}
