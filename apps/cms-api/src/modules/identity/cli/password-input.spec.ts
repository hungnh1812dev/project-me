import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

import {
  CliInputError,
  type HiddenInput,
  promptHidden,
  readPasswordFromStream,
} from './password-input';

class FakeTty extends EventEmitter implements HiddenInput {
  isTTY = true;
  rawModes: boolean[] = [];
  setRawMode = (mode: boolean) => this.rawModes.push(mode);
  setEncoding = () => this;
  resume = () => this;
  pause = () => this;
  type(text: string) {
    this.emit('data', text);
  }
}

function output() {
  const written: string[] = [];
  return { written, write: (text: string) => written.push(text) };
}

describe('readPasswordFromStream', () => {
  it.each([
    ['secret value\n', 'secret value'],
    ['secret value\r\n', 'secret value'],
    ['secret value', 'secret value'],
    ['  spaced  \n\n', '  spaced  \n'],
  ])('reads %j as %j', async (input, expected) => {
    await expect(readPasswordFromStream(Readable.from([input]))).resolves.toBe(
      expected,
    );
  });
});

describe('promptHidden', () => {
  it('reads a line in raw mode without echoing it, with backspace', async () => {
    const tty = new FakeTty();
    const out = output();
    const answer = promptHidden(tty, out, 'Password: ');
    tty.type('hunter2x');
    tty.type('\u007fY\r');
    await expect(answer).resolves.toBe('hunter2Y');
    expect(out.written.join('')).toBe('Password: \n');
    expect(tty.rawModes).toEqual([true, false]);
    expect(tty.listenerCount('data')).toBe(0);
  });

  it('cancels on Ctrl+C and restores the terminal', async () => {
    const tty = new FakeTty();
    const answer = promptHidden(tty, output(), 'Password: ');
    tty.type('abc\u0003');
    await expect(answer).rejects.toBeInstanceOf(CliInputError);
    expect(tty.rawModes).toEqual([true, false]);
  });

  it('refuses when there is no terminal', async () => {
    const tty = new FakeTty();
    tty.isTTY = false;
    await expect(promptHidden(tty, output(), 'x')).rejects.toBeInstanceOf(
      CliInputError,
    );
  });
});
