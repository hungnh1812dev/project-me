import type { Editor } from '@tiptap/react';

import { RICHTEXT_TEXT_COLORS } from '@/constants/Richtext.constants';

import { paletteHexOf } from './Richtext.setup';

type RichtextColorName = Exclude<(typeof RICHTEXT_TEXT_COLORS)[number]['name'], 'default'>;

export interface RichtextColorLabels {
  /** Names the text colour button and its palette. */
  textColor: string;
  /** Removes the text colour (the palette's `default` entry). */
  clearTextColor: string;
  /** Accessible name of each palette swatch. */
  colors: Record<RichtextColorName, string>;
}

export interface RichtextToolbarSwatch {
  key: string;
  label: string;
  /** Null for the clear entry. */
  hex: string | null;
  isActive: boolean;
  run: () => void;
}

export interface RichtextToolbarColors {
  kind: 'colors';
  key: string;
  label: string;
  /** Palette hex of the colour at the cursor, or null. */
  currentHex: string | null;
  swatches: RichtextToolbarSwatch[];
  clear: RichtextToolbarSwatch;
}

export function buildColorControl(
  editor: Editor,
  labels: RichtextColorLabels,
): RichtextToolbarColors {
  const currentHex = paletteHexOf(editor.getAttributes('textStyle').color as string | undefined);
  const entries = RICHTEXT_TEXT_COLORS.map((color): RichtextToolbarSwatch => {
    const hex = color.hex;
    const isDefault = color.name === 'default';
    return {
      key: color.name,
      label: isDefault ? labels.clearTextColor : labels.colors[color.name],
      hex,
      isActive: hex === currentHex,
      run: () =>
        void (hex
          ? editor.chain().focus().setColor(hex).run()
          : editor.chain().focus().unsetColor().run()),
    };
  });
  const clear = entries.find((entry) => entry.hex === null) as RichtextToolbarSwatch;
  return {
    kind: 'colors',
    key: 'textColor',
    label: labels.textColor,
    currentHex,
    swatches: entries.filter((entry) => entry.hex !== null),
    clear,
  };
}
