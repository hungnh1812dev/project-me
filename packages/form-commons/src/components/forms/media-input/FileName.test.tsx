import { render, screen } from '@testing-library/react';

import { FileName, splitFileName } from './FileName';

describe('splitFileName', () => {
  it('keeps the hash and extension as the tail', () => {
    expect(splitFileName('holiday_a1b2c3d4.jpg')).toEqual({
      head: 'holiday',
      tail: '_a1b2c3d4.jpg',
    });
  });

  it('keeps only the extension without a hash', () => {
    expect(splitFileName('report.pdf')).toEqual({ head: 'report', tail: '.pdf' });
    expect(splitFileName('notes_abc.txt')).toEqual({ head: 'notes_abc', tail: '.txt' });
  });

  it('has an empty tail without an extension', () => {
    expect(splitFileName('README')).toEqual({ head: 'README', tail: '' });
    expect(splitFileName('.env')).toEqual({ head: '.env', tail: '' });
  });

  it('keeps the last extension of a name with several dots', () => {
    expect(splitFileName('a.b.c.jpg')).toEqual({ head: 'a.b.c', tail: '.jpg' });
    expect(splitFileName('a.b_a1b2c3d4.jpg')).toEqual({ head: 'a.b', tail: '_a1b2c3d4.jpg' });
  });

  it('splits a 255-character stored name', () => {
    const tail = '_a1b2c3d4.jpg';
    const head = 'x'.repeat(255 - tail.length);
    expect(splitFileName(head + tail)).toEqual({ head, tail });
  });
});

describe('FileName', () => {
  it('holds the full name in title and in the accessible text', () => {
    const name = 'a-very-long-holiday-photo_a1b2c3d4.jpg';
    const { container } = render(<FileName name={name} />);
    expect(container.querySelector('[data-slot="file-name"]')).toHaveAttribute('title', name);
    expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByText('_a1b2c3d4.jpg')).toHaveClass('shrink-0');
    expect(screen.getByText('a-very-long-holiday-photo')).toHaveClass('truncate');
  });
});
