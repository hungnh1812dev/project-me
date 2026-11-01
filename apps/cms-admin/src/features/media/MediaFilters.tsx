import { useEffect, useRef, useState } from 'react';
import { Input, NativeSelect } from '@abyss/form-commons';
import { COPY } from '@configs/Copy.constants';

import {
  MEDIA_MIME_FILTER_VALUES,
  MEDIA_PAGE_SIZES,
  MEDIA_SEARCH_DEBOUNCE_MS,
} from './Media.constants';

const copy = COPY.media.filters;
const mimeLabels: Readonly<Record<string, string>> = copy.mimeOptions;

export interface MediaFiltersValue {
  search: string;
  mimeType: string;
  pageSize: number;
}

interface MediaFiltersProps {
  value: MediaFiltersValue;
  onChange: (value: MediaFiltersValue) => void;
  /** Hide the type select when the caller fixes the type (an image-only picker). */
  hideMimeType?: boolean;
}

/** Search (debounced), type and page-size controls; the parent owns the value. */
export function MediaFilters({ value, onChange, hideMimeType = false }: MediaFiltersProps) {
  const [searchText, setSearchText] = useState(value.search);
  const latest = useRef({ value, onChange });
  const lastSentSearch = useRef(value.search);

  useEffect(() => {
    latest.current = { value, onChange };
  });

  useEffect(() => {
    if (value.search !== lastSentSearch.current) {
      lastSentSearch.current = value.search;
      setSearchText(value.search);
    }
  }, [value.search]);

  useEffect(() => {
    if (searchText === latest.current.value.search) return undefined;
    const timer = setTimeout(() => {
      lastSentSearch.current = searchText;
      latest.current.onChange({ ...latest.current.value, search: searchText });
    }, MEDIA_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText]);

  return (
    <search aria-label={copy.label} className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-48 flex-1 gap-1 text-sm font-medium">
        {copy.search}
        <Input
          type="search"
          name="search"
          value={searchText}
          placeholder={copy.searchPlaceholder}
          onChange={(event) => setSearchText(event.target.value)}
        />
      </label>
      {hideMimeType ? null : (
        <label className="grid gap-1 text-sm font-medium">
          {copy.mimeType}
          <NativeSelect
            name="mimeType"
            value={value.mimeType}
            onChange={(event) => onChange({ ...value, mimeType: event.target.value })}
          >
            {MEDIA_MIME_FILTER_VALUES.map((mimeType) => (
              <option key={mimeType} value={mimeType}>
                {mimeLabels[mimeType] ?? mimeType}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      <label className="grid gap-1 text-sm font-medium">
        {copy.pageSize}
        <NativeSelect
          name="pageSize"
          value={value.pageSize}
          onChange={(event) => onChange({ ...value, pageSize: Number(event.target.value) })}
        >
          {MEDIA_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {copy.pageSizeOption(size)}
            </option>
          ))}
        </NativeSelect>
      </label>
    </search>
  );
}
