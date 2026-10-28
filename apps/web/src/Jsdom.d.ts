// jsdom ships no types and @types/jsdom is not a dependency; this is the one
// part SafeRichtext.server.ts uses.
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string);
    readonly window: Window & typeof globalThis;
  }
}
