export type CheckedState = boolean | 'indeterminate';

export function getCheckedState(
  selectedCount: number,
  rowCount: number,
): CheckedState {
  if (rowCount > 0 && selectedCount === rowCount) return true;
  return selectedCount > 0 ? 'indeterminate' : false;
}

/** Selection by row id; the page's ids decide what "all" means. */
export function useRowSelection(
  ids: readonly string[],
  selectedIds: ReadonlySet<string> | undefined,
  onSelectedChange: ((next: Set<string>) => void) | undefined,
) {
  const selectedIdSet = selectedIds ?? new Set<string>();
  const selectedCount = ids.filter((id) => selectedIdSet.has(id)).length;
  const isAllSelected = ids.length > 0 && selectedCount === ids.length;

  const toggleAll = () => {
    if (onSelectedChange === undefined) return;
    const next = new Set(selectedIdSet);
    for (const id of ids) {
      if (isAllSelected) next.delete(id);
      else next.add(id);
    }
    onSelectedChange(next);
  };
  const toggleRow = (id: string) => {
    if (onSelectedChange === undefined) return;
    const next = new Set(selectedIdSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  return {
    isSelectable: onSelectedChange !== undefined,
    isSelected: (id: string) => selectedIdSet.has(id),
    checkedState: getCheckedState(selectedCount, ids.length),
    toggleAll,
    toggleRow,
  };
}
