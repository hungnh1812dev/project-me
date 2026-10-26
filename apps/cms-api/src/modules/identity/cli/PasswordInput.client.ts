/** Terminal input for owner:bootstrap. Nothing here ever echoes or logs the password. */

const CTRL_C = '\u0003';
const CTRL_D = '\u0004';
const BACKSPACE = '\u007f';
const BACKSPACE_ALT = '\b';
const LINE_ENDS = new Set(['\r', '\n']);
const TRAILING_NEWLINE = /\r?\n$/;

export class CliInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliInputError';
  }
}

/** Minimal TTY surface, so tests can drive it with a fake stream. */
export interface HiddenInput {
  isTTY?: boolean | undefined;
  setRawMode?: ((mode: boolean) => unknown) | undefined;
  setEncoding(encoding: BufferEncoding): unknown;
  on(event: 'data', listener: (chunk: string) => void): unknown;
  off(event: 'data', listener: (chunk: string) => void): unknown;
  resume(): unknown;
  pause(): unknown;
}

export interface PromptOutput {
  write(text: string): unknown;
}

/** Whole stdin as the password (`--password-stdin`); one trailing newline is dropped. */
export async function readPasswordFromStream(
  stream: AsyncIterable<Buffer | string>,
): Promise<string> {
  let text = '';
  for await (const chunk of stream) {
    text += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  }
  return text.replace(TRAILING_NEWLINE, '');
}

/** Prompts on `output` and reads one line from a raw-mode TTY without echo. */
export function promptHidden(
  input: HiddenInput,
  output: PromptOutput,
  prompt: string,
): Promise<string> {
  if (input.isTTY !== true || input.setRawMode === undefined) {
    return Promise.reject(
      new CliInputError('No terminal for the password prompt.'),
    );
  }
  const setRawMode = input.setRawMode.bind(input);
  output.write(prompt);
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      input.off('data', onData);
      setRawMode(false);
      input.pause();
      output.write('\n');
      if (error === undefined) resolve(value);
      else reject(error);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (LINE_ENDS.has(char)) return finish();
        if (char === CTRL_C || char === CTRL_D) {
          return finish(new CliInputError('Cancelled.'));
        }
        if (char === BACKSPACE || char === BACKSPACE_ALT) {
          value = [...value].slice(0, -1).join('');
        } else {
          value += char;
        }
      }
    };
    setRawMode(true);
    input.setEncoding('utf8');
    input.on('data', onData);
    input.resume();
  });
}
