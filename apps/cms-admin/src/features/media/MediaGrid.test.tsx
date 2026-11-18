import { EN_TEXT } from '@configs/locales/en';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import type { MediaFile } from './Media.api';
import { MEDIA_SEARCH_DEBOUNCE_MS } from './Media.constants';
import { MediaFilters, type MediaFiltersValue } from './MediaFilters';
import { MediaGrid } from './MediaGrid';

const copy = EN_TEXT.media;

function file(overrides: Partial<MediaFile> = {}): MediaFile {
  return {
    id: 'f1',
    fileName: 'portrait.jpg',
    mimeType: 'image/jpeg',
    size: 2048,
    width: 10,
    height: 10,
    alt: null,
    url: 'https://cdn.test/portrait.jpg',
    thumbnailUrl: 'https://cdn.test/portrait-t.jpg',
    isReviewerPreset: false,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
    sha256: 'abcdef0123456789',
    provider: 'cloudinary',
    ...overrides,
  };
}

const PDF = file({
  id: 'f2',
  fileName: 'cv.pdf',
  mimeType: 'application/pdf',
  thumbnailUrl: null,
  width: null,
  height: null,
});

describe('MediaGrid', () => {
  it('shows the stored name and size on each card', () => {
    render(<MediaGrid mode="manage" files={[file()]} emptyTitle="none" />);
    expect(screen.getByText('portrait.jpg')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
  });

  it('shows only the actions passed in, with view original for images only', async () => {
    const onDelete = vi.fn<(target: MediaFile, opener: HTMLElement) => void>();
    render(
      <MediaGrid mode="manage" files={[file(), PDF]} actions={{ onDelete }} emptyTitle="none" />,
    );
    expect(
      screen.getAllByRole('link', { name: copy.grid.viewOriginal('portrait.jpg') }),
    ).toHaveLength(1);
    expect(screen.queryByRole('link', { name: copy.grid.viewOriginal('cv.pdf') })).toBeNull();
    expect(screen.queryByRole('button', { name: copy.editAltLabel('portrait.jpg') })).toBeNull();
    expect(
      screen.queryByRole('button', { name: copy.grid.replaceLabel('portrait.jpg') }),
    ).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: copy.deleteLabel('cv.pdf') }));
    expect(onDelete).toHaveBeenCalledWith(PDF, expect.any(HTMLElement));
    expect(
      screen.getByRole('link', { name: copy.grid.viewOriginal('portrait.jpg') }),
    ).toHaveAttribute('target', '_blank');
  });

  it('pick mode makes the card one button that selects the file', async () => {
    const onSelect = vi.fn<(target: MediaFile) => void>();
    const target = file();
    render(<MediaGrid mode="pick" files={[target]} onSelect={onSelect} emptyTitle="none" />);
    expect(screen.queryByRole('link')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: copy.picker.select('portrait.jpg') }));
    expect(onSelect).toHaveBeenCalledWith(target);
  });

  it('renders loading, error and empty states', () => {
    const { rerender } = render(<MediaGrid mode="pick" files={[]} isLoading emptyTitle="none" />);
    expect(screen.getByText(copy.loading)).toBeInTheDocument();
    rerender(<MediaGrid mode="pick" files={[]} error={<p>boom</p>} emptyTitle="none" />);
    expect(screen.getByText('boom')).toBeInTheDocument();
    rerender(<MediaGrid mode="pick" files={[]} emptyTitle="Nothing here" emptyHint="Upload one" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Upload one')).toBeInTheDocument();
  });
});

describe('MediaFilters', () => {
  const value: MediaFiltersValue = { search: '', mimeType: '', pageSize: 10 };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends the search once, after the debounce', () => {
    const onChange = vi.fn<(next: MediaFiltersValue) => void>();
    render(<MediaFilters value={value} onChange={onChange} />);
    const input = screen.getByLabelText(copy.filters.search);
    for (const text of ['c', 'cv']) {
      fireEvent.change(input, { target: { value: text } });
      act(() => {
        vi.advanceTimersByTime(MEDIA_SEARCH_DEBOUNCE_MS - 50);
      });
    }
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ ...value, search: 'cv' });
  });

  it('follows a search changed from outside', () => {
    const { rerender } = render(
      <MediaFilters value={value} onChange={vi.fn<(next: MediaFiltersValue) => void>()} />,
    );
    rerender(
      <MediaFilters
        value={{ ...value, search: 'old' }}
        onChange={vi.fn<(next: MediaFiltersValue) => void>()}
      />,
    );
    expect(screen.getByLabelText(copy.filters.search)).toHaveValue('old');
  });

  it('changes type and page size at once and can hide the type', () => {
    const onChange = vi.fn<(next: MediaFiltersValue) => void>();
    const { rerender } = render(<MediaFilters value={value} onChange={onChange} />);
    const type = screen.getByLabelText(copy.filters.mimeType);
    expect(type.querySelectorAll('option')[1]).toHaveValue('image/*');
    rerender(<MediaFilters value={value} onChange={onChange} hideMimeType />);
    expect(screen.queryByLabelText(copy.filters.mimeType)).toBeNull();
    expect(screen.getByLabelText(copy.filters.pageSize)).toHaveValue('10');
  });
});
