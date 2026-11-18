import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useScreenText } from '@configs/locales';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type KeyboardCoordinateGetter,
  type KeyboardSensorProps,
  type UniqueIdentifier,
} from '@dnd-kit/core';

import { PALETTE_ID_PREFIX } from './FieldPalette';
import {
  COMPONENT_FIELD_TYPE,
  paletteItemLabel,
  paletteItemOfType,
  type FieldTypeName,
} from './FieldTypes.registry';
import {
  canPlaceComponentIn,
  findField,
  findParentId,
  listOf,
  moveTargetsOf,
  type ListOwnerId,
  type SchemaField,
  type SchemaTree,
} from './SchemaTree.reducer';

/** Pixels the pointer must travel before a press becomes a drag, so a click still selects or adds. */
const DRAG_ACTIVATION_DISTANCE_PX = 6;
const LIST_ID_PREFIX = 'list:';
const ROOT_LIST_KEY = 'root';

export const listDropId = (ownerId: ListOwnerId) => `${LIST_ID_PREFIX}${ownerId ?? ROOT_LIST_KEY}`;
const isPaletteId = (id: UniqueIdentifier) => String(id).startsWith(PALETTE_ID_PREFIX);

interface DropPlace {
  parentId: ListOwnerId;
  index: number;
}

/** Every list that can hold fields: the top level and each component. */
function listOwnersOf(tree: SchemaTree): ListOwnerId[] {
  const owners: ListOwnerId[] = [null];
  const walk = (fields: readonly SchemaField[]) => {
    for (const field of fields) {
      if (field.type !== COMPONENT_FIELD_TYPE) continue;
      owners.push(field.id);
      walk(field.fields);
    }
  };
  walk(tree.fields);
  return owners;
}

/** Lists the dragged item may be dropped into: `moveTargetsOf` for a field, the depth rule for a palette component (SB-7). */
export function allowedOwnersOf(
  tree: SchemaTree,
  activeId: UniqueIdentifier,
): ReadonlySet<ListOwnerId> {
  if (!isPaletteId(activeId)) {
    return new Set(moveTargetsOf(tree, String(activeId)).map((target) => target.parentId));
  }
  const type = String(activeId).slice(PALETTE_ID_PREFIX.length);
  return new Set(
    listOwnersOf(tree).filter(
      (ownerId) => type !== COMPONENT_FIELD_TYPE || canPlaceComponentIn(tree, ownerId),
    ),
  );
}

/** A list zone or a field row; a list zone counts as the end of its list. */
export function placeOf(
  tree: SchemaTree,
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
  isBelowOver: boolean,
): DropPlace | null {
  const over = String(overId);
  if (over.startsWith(LIST_ID_PREFIX)) {
    const key = over.slice(LIST_ID_PREFIX.length);
    const parentId = key === ROOT_LIST_KEY ? null : key;
    const list = listOf(tree, parentId);
    return list === undefined ? null : { parentId, index: list.length };
  }
  const parentId = findParentId(tree.fields, over);
  const list = parentId === undefined ? undefined : listOf(tree, parentId);
  if (parentId === undefined || list === undefined) return null;
  const isSameList = list.some((field) => field.id === String(activeId));
  const overIndex = list.findIndex((field) => field.id === over);
  return { parentId, index: overIndex + (!isSameList && isBelowOver ? 1 : 0) };
}

/** The pointer picks the innermost zone it is in (a component's list over the component row); the keyboard falls back to the closest centre. */
const innermostCollision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length === 0) return closestCenter(args);
  const area = (collision: (typeof within)[number]) => {
    const rect = args.droppableRects.get(collision.id);
    return rect === undefined ? 0 : rect.width * rect.height;
  };
  return [...within].sort((a, b) => area(a) - area(b));
};

const ARROW_DIRECTIONS: Record<string, { x: number; y: number }> = {
  [KeyboardCode.Up]: { x: 0, y: -1 },
  [KeyboardCode.Down]: { x: 0, y: 1 },
  [KeyboardCode.Left]: { x: -1, y: 0 },
  [KeyboardCode.Right]: { x: 1, y: 0 },
};

const isPointInRect = (
  point: { x: number; y: number },
  rect: { left: number; right: number; top: number; bottom: number },
) => rect.left <= point.x && point.x <= rect.right && rect.top <= point.y && point.y <= rect.bottom;

/**
 * Nothing lies further in the arrow's direction from inside a nested list: step out to the smallest
 * zone that encloses the dragged item and is larger than the one it is over (an empty component box
 * to the list that holds it), whose centre may sit behind the item.
 */
function enclosingListCentre(
  {
    active,
    droppableRects,
    droppableContainers,
    over,
  }: Parameters<KeyboardCoordinateGetter>[1]['context'],
  from: { x: number; y: number },
): { x: number; y: number } | null {
  const overRect = over === null ? undefined : droppableRects.get(over.id);
  if (overRect === undefined) return null;
  let enclosing: { x: number; y: number; area: number } | null = null;
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id);
    if (rect === undefined || container.id === over?.id || container.id === active?.id) continue;
    const area = rect.width * rect.height;
    if (!isPointInRect(from, rect) || area <= overRect.width * overRect.height) continue;
    if (enclosing === null || area < enclosing.area) {
      enclosing = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, area };
    }
  }
  return enclosing;
}

/**
 * Arrow keys step the dragged item (palette item or field) to the nearest enabled place in that direction
 * (rows, lists and empty component boxes alike); the sortable getter skipped empty component boxes in the
 * production build. An item still away from the place it is announced over (a palette item, matched by
 * closest centre at pick-up) first moves onto that place, so the next arrow steps from where the user
 * was told it is, not from the palette.
 */
export const builderKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { active, collisionRect, droppableRects, droppableContainers, over } = args.context;
  const direction = ARROW_DIRECTIONS[event.code];
  if (active === null || direction === undefined || !collisionRect) return undefined;
  event.preventDefault();
  const from = {
    x: collisionRect.left + collisionRect.width / 2,
    y: collisionRect.top + collisionRect.height / 2,
  };
  const overRect = over === null ? undefined : droppableRects.get(over.id);
  if (overRect !== undefined && !isPointInRect(from, overRect)) {
    return {
      x: overRect.left + overRect.width / 2 - collisionRect.width / 2,
      y: overRect.top + overRect.height / 2 - collisionRect.height / 2,
    };
  }
  let nearest: { x: number; y: number; distance: number } | null = null;
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id);
    if (rect === undefined || container.id === over?.id || container.id === active.id) continue;
    const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const step = (centre.x - from.x) * direction.x + (centre.y - from.y) * direction.y;
    if (step <= 0) continue;
    const distance = Math.hypot(centre.x - from.x, centre.y - from.y);
    if (nearest === null || distance < nearest.distance) nearest = { ...centre, distance };
  }
  // Only an empty list zone steps out; the first or last row of a list stays where it is.
  const isOverListZone = String(over?.id).startsWith(LIST_ID_PREFIX);
  const target = nearest ?? (isOverListZone ? enclosingListCentre(args.context, from) : null);
  return target === null
    ? undefined
    : {
        x: target.x - collisionRect.width / 2,
        y: target.y - collisionRect.height / 2,
      };
};

/** Zones are re-measured whenever they change: offering only the lists that take the item reflows the canvas right after pick-up, and rects taken before that left the keyboard target stale under load. */
const DROPPABLE_MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };

/** The private members of dnd-kit 6.3 KeyboardSensor that ImmediateKeyboardSensor wraps. */
interface KeyboardSensorInternals {
  listeners: { add(eventName: string, handler: (event: Event) => void): void };
  handleKeyDown: (event: Event) => void;
  detach: () => void;
}

/**
 * dnd-kit's KeyboardSensor starts listening for keys in a setTimeout, so the key that picked the item
 * up does not drop it again. Chrome runs queued key presses before that timer when the main thread is
 * busy (the production build right after pick-up), so an arrow or Escape pressed then was lost and the
 * drag stayed where it began. This sensor listens at once, skipping only the pick-up key; the sensor's
 * own timer later adds the same listener again, which the DOM ignores.
 */
class ImmediateKeyboardSensor extends KeyboardSensor {
  constructor(props: KeyboardSensorProps) {
    super(props);
    const sensor = this as unknown as KeyboardSensorInternals;
    const handleKeyDown = sensor.handleKeyDown;
    const detach = sensor.detach.bind(this);
    let isListening = true;
    const handleKeyAfterPickUp = (event: Event) => {
      if (isListening && event !== props.event) handleKeyDown(event);
    };
    sensor.handleKeyDown = handleKeyAfterPickUp;
    // A drag ended before the sensor's timer fired gets the listener added after detach; remove it once more after that timer.
    sensor.detach = () => {
      isListening = false;
      detach();
      setTimeout(detach);
    };
    sensor.listeners.add('keydown', handleKeyAfterPickUp);
  }
}

const DragTargetsContext = createContext<ReadonlySet<ListOwnerId> | null>(null);

/** Whether the list takes the item being dragged; true while nothing is dragged. */
export const useIsListOffered = (ownerId: ListOwnerId) => {
  const allowedOwners = useContext(DragTargetsContext);
  return allowedOwners === null || allowedOwners.has(ownerId);
};

interface SchemaDragContextProps {
  tree: SchemaTree;
  onAdd: (parentId: ListOwnerId, fieldType: FieldTypeName, index?: number) => void;
  onMove: (fieldId: string, parentId: ListOwnerId, index: number) => void;
  children: ReactNode;
}

/**
 * The one drag and drop context of the builder (SB-5, SB-7): wraps the canvas and the palette,
 * offers only the lists that take the dragged item, and announces each step to screen readers.
 */
export function SchemaDragContext({ tree, onAdd, onMove, children }: SchemaDragContextProps) {
  const copy = useScreenText('schemaBuilder').schemaBuilder;
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const focusHandleOf = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX } }),
    useSensor(ImmediateKeyboardSensor, { coordinateGetter: builderKeyboardCoordinates }),
  );
  const allowedOwners = useMemo(
    () => (activeId === null ? null : allowedOwnersOf(tree, activeId)),
    [tree, activeId],
  );

  // Moving a row to another list re-creates it; give keyboard focus back to its handle once dnd-kit has restored its own.
  useEffect(() => {
    const id = focusHandleOf.current;
    if (id === null) return;
    focusHandleOf.current = null;
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-field-drag="${id}"]`)?.focus(),
    );
  });

  const labelOf = (id: UniqueIdentifier) => {
    if (isPaletteId(id)) {
      const item = paletteItemOfType(String(id).slice(PALETTE_ID_PREFIX.length));
      return item === undefined ? String(id) : paletteItemLabel(item, copy);
    }
    return findField(tree.fields, String(id))?.name ?? String(id);
  };

  const placeFor = (event: Pick<DragOverEvent, 'active' | 'over'>): DropPlace | null => {
    const { active, over } = event;
    if (over === null) return null;
    const translated = active.rect.current.translated;
    const isBelowOver =
      translated !== null &&
      translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2;
    const place = placeOf(tree, active.id, over.id, isBelowOver);
    return place !== null && allowedOwners?.has(place.parentId) === true ? place : null;
  };

  const describe = (event: Pick<DragOverEvent, 'active' | 'over'>, place: DropPlace) => {
    const list = listOf(tree, place.parentId) ?? [];
    const isSameList = list.some((field) => field.id === String(event.active.id));
    const listLabel =
      place.parentId === null
        ? copy.fields.rootListLabel
        : copy.fields.listLabel(findField(tree.fields, place.parentId)?.name ?? '');
    const lastIndex = isSameList ? list.length - 1 : list.length;
    return copy.dnd.place(
      Math.min(place.index, lastIndex) + 1,
      list.length + (isSameList ? 0 : 1),
      listLabel,
    );
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => copy.dnd.pickedUp(labelOf(active.id)),
    onDragOver: (event) => {
      const place = placeFor(event);
      return place === null
        ? copy.dnd.overNothing(labelOf(event.active.id))
        : copy.dnd.over(labelOf(event.active.id), describe(event, place));
    },
    onDragEnd: (event) => {
      const place = placeFor(event);
      return place === null
        ? copy.dnd.droppedNowhere(labelOf(event.active.id))
        : copy.dnd.dropped(labelOf(event.active.id), describe(event, place));
    },
    onDragCancel: ({ active }) => copy.dnd.cancelled(labelOf(active.id)),
  };

  const drop = (event: DragEndEvent) => {
    const place = placeFor(event);
    setActiveId(null);
    if (place === null) return;
    if (isPaletteId(event.active.id)) {
      // The page selects the new field (SB-6).
      onAdd(
        place.parentId,
        String(event.active.id).slice(PALETTE_ID_PREFIX.length) as FieldTypeName,
        place.index,
      );
      return;
    }
    const fieldId = String(event.active.id);
    focusHandleOf.current = fieldId;
    onMove(fieldId, place.parentId, place.index);
  };

  return (
    <DragTargetsContext.Provider value={allowedOwners}>
      <DndContext
        sensors={sensors}
        collisionDetection={innermostCollision}
        measuring={DROPPABLE_MEASURING}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: copy.dnd.instructions },
        }}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragEnd={drop}
        onDragCancel={() => setActiveId(null)}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {activeId === null ? null : (
            <div className="rounded-control border border-primary bg-card px-3 py-2 text-sm font-medium shadow-md">
              {labelOf(activeId)}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </DragTargetsContext.Provider>
  );
}
