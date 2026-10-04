import { useId, useMemo, useState } from 'react';
import { InfoIcon, SearchIcon } from 'lucide-react';

import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { Checkbox } from '@repo/ui/components/checkbox';
import { Input } from '@repo/ui/components/input';
import { Skeleton } from '@repo/ui/components/skeleton';
import { Field } from '@repo/ui/form/Field';
import { cn } from '@repo/ui/lib/cn';

import {
  buildPermissionTree,
  countSelected,
  filterPermissionTree,
  nodeState,
  toggleNode,
  toggleSlug,
  UNKNOWN_GROUP_ID,
  type NodeState,
  type PermissionTreeLeaf,
  type PermissionTreeNode,
} from '@/features/settings/permissionTree';
import type { Permission } from '@/features/settings/types';

export interface PermissionTreeProps {
  /** The legend. Defaults to "Permissions". */
  label?: string;
  /** The selected slugs. */
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** The P1 catalog; `undefined` while it loads, fails or can't be read. */
  catalog: readonly Permission[] | undefined;
  /** `false` without `permission:read`: the tree becomes a read-only list of `value`. */
  canReadCatalog: boolean;
  isLoading?: boolean;
  /** The catalog's load error, shown with a Retry. */
  error?: string | null;
  onRetry?: () => void;
}

const NO_READ = 'Requires the "permission:read" permission to change permissions.';
const UNKNOWN_DESCRIPTION = 'Not in the permission catalog.';

interface TriStateCheckboxProps {
  id: string;
  state: NodeState;
  /** The id of the visible text that names the box. */
  labelledBy: string;
  describedBy?: string;
  className?: string;
  onToggle: () => void;
}

/**
 * The `@repo/ui` Checkbox (AC-11): `indeterminate` renders the dash and `aria-checked="mixed"`.
 * It is named by its visible text through `aria-labelledby`; `id` lands on Base UI's hidden input,
 * so a `<label htmlFor={id}>` click still toggles it.
 */
const TriStateCheckbox: React.FC<TriStateCheckboxProps> = ({
  id,
  state,
  labelledBy,
  describedBy,
  className,
  onToggle,
}) => (
  <Checkbox
    id={id}
    className={cn('cursor-pointer', className)}
    checked={state === 'checked'}
    indeterminate={state === 'indeterminate'}
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
    onCheckedChange={() => onToggle()}
  />
);
TriStateCheckbox.displayName = 'TriStateCheckbox';

/** "n of m", with " selected" for screen readers. */
const Count: React.FC<{ id: string; node: PermissionTreeNode; value: readonly string[] }> = ({
  id,
  node,
  value,
}) => {
  const { selected, total } = countSelected(node, value);
  return (
    <span id={id} className="shrink-0 text-xs text-muted-foreground tabular-nums">
      <span>{`${selected} of ${total}`}</span> <span className="sr-only">selected</span>
    </span>
  );
};
Count.displayName = 'Count';

interface LeafProps {
  baseId: string;
  leaf: PermissionTreeLeaf;
  checked: boolean;
  onToggle: () => void;
}

/** One permission: a checkbox labelled by slug and name, described by its description. */
const Leaf: React.FC<LeafProps> = ({ baseId, leaf, checked, onToggle }) => {
  const id = `${baseId}-p-${leaf.slug}`;
  const description = leaf.known ? leaf.description : UNKNOWN_DESCRIPTION;
  // A name that only repeats the slug adds nothing.
  const name = leaf.name !== leaf.slug ? leaf.name : '';
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <li className="flex items-start gap-3 px-3">
      <TriStateCheckbox
        id={id}
        className="mt-3.5 lg:mt-2"
        state={checked ? 'checked' : 'unchecked'}
        labelledBy={`${id}-label`}
        describedBy={descriptionId}
        onToggle={onToggle}
      />
      <div className="flex min-w-0 flex-1 flex-col pb-1.5">
        <label
          id={`${id}-label`}
          htmlFor={id}
          className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 pt-1.5 lg:min-h-8 lg:pt-1"
        >
          <code className="font-mono text-xs break-all">{leaf.slug}</code>
          {name && ' '}
          {name && <span>{name}</span>}
        </label>
        {description && (
          <p id={descriptionId} className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </li>
  );
};
Leaf.displayName = 'Leaf';

interface GroupProps {
  baseId: string;
  node: PermissionTreeNode;
  value: readonly string[];
  onChange: (next: string[]) => void;
  depth: number;
}

/** A group: its tri-state checkbox and count, its permissions, then its sub-groups. */
const Group: React.FC<GroupProps> = ({ baseId, node, value, onChange, depth }) => {
  const id = `${baseId}-g-${node.id}`;
  const isResource = depth === 0 && node.id !== UNKNOWN_GROUP_ID;
  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      className={cn(depth === 0 ? 'border-b last:border-b-0' : 'ml-5 border-l')}
    >
      <div
        className={cn(
          'flex min-h-11 items-center gap-3 px-3 lg:min-h-9',
          depth === 0 && 'bg-muted/50',
        )}
      >
        <TriStateCheckbox
          id={id}
          state={nodeState(node, value)}
          labelledBy={`${id}-label`}
          describedBy={`${id}-count`}
          onToggle={() => onChange(toggleNode(node, value))}
        />
        <label
          id={`${id}-label`}
          htmlFor={id}
          className={cn(
            'flex min-h-11 flex-1 cursor-pointer items-center text-sm font-medium lg:min-h-9',
            isResource && 'font-mono',
          )}
        >
          {node.label}
        </label>
        <Count id={`${id}-count`} node={node} value={value} />
      </div>
      {node.permissions.length > 0 && (
        <ul className={cn(depth === 0 && 'ml-5 border-l')}>
          {node.permissions.map((leaf) => (
            <Leaf
              key={leaf.slug}
              baseId={baseId}
              leaf={leaf}
              checked={value.includes(leaf.slug)}
              onToggle={() => onChange(toggleSlug(value, leaf.slug))}
            />
          ))}
        </ul>
      )}
      {node.children.map((child) => (
        <Group
          key={child.id}
          baseId={baseId}
          node={child}
          value={value}
          onChange={onChange}
          depth={depth + 1}
        />
      ))}
    </div>
  );
};
Group.displayName = 'Group';

/**
 * Picks permission slugs from the P1 catalog (AC-23). Groups come from `buildPermissionTree`: one
 * per resource, `document` split by content type (D3), and selected slugs the catalog lacks under
 * "Unknown permissions" (still uncheckable and re-checkable). Each group has a tri-state checkbox
 * and an "n of m" count; Select all and the filter act on the visible, known permissions. All
 * boxes are `@repo/ui` Checkboxes named by their visible text, so Tab and Space work, a partial
 * group is `aria-checked="mixed"`, and no label wraps a control. Without
 * `permission:read` it shows the current slugs read-only with a note.
 */
export const PermissionTree: React.FC<PermissionTreeProps> = ({
  label = 'Permissions',
  value,
  onChange,
  catalog,
  canReadCatalog,
  isLoading = false,
  error,
  onRetry,
}) => {
  const baseId = useId();
  const legendId = `${baseId}-legend`;
  const [filter, setFilter] = useState('');
  // Unknown slugs stay listed after they are unchecked, so they can be checked again.
  const [initialValue] = useState(value);
  const tree = useMemo(
    () => buildPermissionTree(catalog ?? [], [...new Set([...initialValue, ...value])]),
    [catalog, initialValue, value],
  );
  const visible = useMemo(() => filterPermissionTree(tree, filter), [tree, filter]);
  const root = useMemo<PermissionTreeNode>(
    () => ({
      id: 'all',
      label: 'Select all',
      permissions: [],
      children: visible.filter((node) => node.id !== UNKNOWN_GROUP_ID),
    }),
    [visible],
  );

  const rootCount = countSelected(root, value);

  const legend = (
    <legend id={legendId} className="mb-1.5 text-sm font-medium">
      {label}
    </legend>
  );

  if (!canReadCatalog) {
    const sorted = [...value].sort();
    return (
      <fieldset className="flex min-w-0 flex-col gap-2">
        {legend}
        {sorted.length > 0 ? (
          <ul aria-labelledby={legendId} className="flex flex-wrap gap-1.5">
            {sorted.map((slug) => (
              <li key={slug}>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{slug}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No permissions.</p>
        )}
        <Alert role="note">
          <InfoIcon aria-hidden="true" />
          <AlertDescription>{NO_READ}</AlertDescription>
        </Alert>
      </fieldset>
    );
  }

  let body: React.ReactNode;
  if (catalog === undefined && error) {
    body = (
      <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  } else if (catalog === undefined) {
    body = (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-8 w-full" />
        ))}
      </div>
    );
  } else if (tree.length === 0) {
    body = <p className="text-sm text-muted-foreground">The permission catalog is empty.</p>;
  } else {
    body = (
      <>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Field label="Filter permissions" hideLabel className="min-w-0 flex-1 basis-48">
            <Input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => {
                // Enter filters; it must not submit the surrounding form.
                if (event.key === 'Enter') event.preventDefault();
              }}
              placeholder="Filter permissions"
              autoComplete="off"
              leading={<SearchIcon aria-hidden="true" />}
            />
          </Field>
          <div className="flex items-center gap-3">
            <TriStateCheckbox
              id={`${baseId}-all`}
              state={nodeState(root, value)}
              labelledBy={`${baseId}-all-label`}
              describedBy={`${baseId}-all-count`}
              onToggle={() => onChange(toggleNode(root, value))}
            />
            <label
              id={`${baseId}-all-label`}
              htmlFor={`${baseId}-all`}
              className="flex min-h-11 cursor-pointer items-center text-sm font-medium lg:min-h-9"
            >
              Select all
            </label>
            <span id={`${baseId}-all-count`} className="text-xs text-muted-foreground tabular-nums">
              {`${rootCount.selected} of ${rootCount.total} selected`}
            </span>
          </div>
        </div>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">{`No permissions match "${filter.trim()}".`}</p>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-md border">
            {visible.map((node) => (
              <Group
                key={node.id}
                baseId={baseId}
                node={node}
                value={value}
                onChange={onChange}
                depth={0}
              />
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <fieldset aria-busy={isLoading || undefined} className="flex min-w-0 flex-col gap-3">
      {legend}
      {body}
    </fieldset>
  );
};
PermissionTree.displayName = 'PermissionTree';
