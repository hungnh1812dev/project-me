/** Focus and invalid styles shared by every form control primitive. */

/** The 1 px solid edge inside the 3 px ring; it replaces the browser outline. */
const FOCUS_EDGE_CLASSES =
  'focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-focus-edge';

export const CONTROL_FOCUS_CLASSES = `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ${FOCUS_EDGE_CLASSES}`;

export const CONTROL_FOCUS_WITHIN_CLASSES =
  'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 focus-within:outline-solid focus-within:outline-1 focus-within:outline-focus-edge';

/** For links, tabs and headings that take no border: also drops the browser outline until the focus edge shows. */
export const CONTROL_FOCUS_RING_ONLY_CLASSES = `outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${FOCUS_EDGE_CLASSES}`;

/** Destructive buttons keep a rose ring and edge. */
export const CONTROL_FOCUS_DESTRUCTIVE_CLASSES =
  'focus-visible:ring-destructive/40 focus-visible:outline-destructive';

export const CONTROL_INVALID_CLASSES =
  'aria-invalid:border-destructive aria-invalid:ring-destructive/20';
