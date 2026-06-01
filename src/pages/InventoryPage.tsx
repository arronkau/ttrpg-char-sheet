import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowRightLeft,
  Backpack,
  Box,
  ChevronDown,
  ChevronRight,
  Coins,
  EyeOff,
  Flame,
  Gem,
  GripVertical,
  Hand,
  Package,
  Pencil,
  Plus,
  Search,
  TimerReset,
  Trash2,
  Undo2,
  X
} from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { defaultInventoryQuantity, itemSearchText } from "../lib/catalogs";
import { isInventoryLocation } from "../lib/inventoryIntegrity";
import { inventoryRecordTypeForItemType } from "../lib/inventoryRecordTypes";
import {
  buildInventoryTree,
  coinBreakdownForEntry,
  coinTotal,
  displayName,
  entryItem,
  entrySlots,
  isActiveLight,
  isCoinPurseEntry,
  isZeroSlotTreasureEntry,
  normalizeCoins,
  summarizeEntity,
  turnsRemaining,
  validateHandAssignment
} from "../lib/rules";
import { useCampaignStore } from "../store/campaignStore";
import type {
  Catalogs,
  ArmorType,
  CoinBreakdown,
  ContainerLoadCategory,
  Entity,
  HandSlot,
  InventoryActionResult,
  InventoryEntry,
  InventoryLocation,
  InventoryNode,
  ItemTemplate,
  ItemType,
  ViewMode
} from "../types";

const itemTypeOptions: ItemType[] = ["gear", "weapon", "armor", "container", "treasure"];
const armorTypeOptions: ArmorType[] = ["armor", "shield", "helmet"];
const containerLoadOptions: ContainerLoadCategory[] = ["equipped", "stowed"];
const adventurerTypes = new Set<Entity["type"]>(["character", "retainer"]);

type AddTarget = {
  mode: "add";
  entityId: string;
  location: InventoryLocation;
  handSlot?: HandSlot | null;
  preferredType?: ItemType;
  title: string;
};

type EditTarget = {
  mode: "edit";
  entry: InventoryEntry;
  title: string;
};

type ItemModalTarget = AddTarget | EditTarget;

type RowDropPosition = "before" | "after" | "swap" | "inside";
type RowDropIntent = { entryId: string; position: RowDropPosition };

const DropIntentContext = createContext<RowDropIntent | null>(null);

export function InventoryPage() {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const entities = useCampaignStore((state) => state.entities);
  const inventoryEntries = useCampaignStore((state) => state.inventoryEntries);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const spendTurn = useCampaignStore((state) => state.spendTurn);
  const retireEntity = useCampaignStore((state) => state.retireEntity);
  const restoreEntity = useCampaignStore((state) => state.restoreEntity);
  const moveInventoryEntry = useCampaignStore((state) => state.moveInventoryEntry);
  const updateInventoryEntry = useCampaignStore((state) => state.updateInventoryEntry);
  const swapInventoryOrder = useCampaignStore((state) => state.swapInventoryOrder);
  const [query, setQuery] = useState("");
  const [itemModalTarget, setItemModalTarget] = useState<ItemModalTarget | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [expandedOtherIds, setExpandedOtherIds] = useState<string[]>([]);
  const [activeDragEntryId, setActiveDragEntryId] = useState<string | null>(null);
  const [dropIntent, setDropIntent] = useState<RowDropIntent | null>(null);
  const dropIntentRef = useRef<RowDropIntent | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const tree = useMemo(() => buildInventoryTree(inventoryEntries, catalogs), [inventoryEntries, catalogs]);
  const summaries = useMemo(
    () => Object.fromEntries(entities.map((entity) => [entity.id, summarizeEntity(entity, inventoryEntries, catalogs, viewMode)])),
    [entities, inventoryEntries, catalogs, viewMode]
  );
  const activeLights = inventoryEntries.filter((entry) => isActiveLight(entry, catalogs));
  const activeEntities = entities.filter((entity) => entity.active);
  const adventurers = activeEntities.filter((entity) => adventurerTypes.has(entity.type));
  const otherEntities = activeEntities.filter((entity) => !adventurerTypes.has(entity.type));
  const hiddenEntities = entities.filter((entity) => !entity.active);
  const normalizedQuery = query.trim().toLowerCase();

  const visibleAdventurers = adventurers.filter((entity) =>
    matchesEntitySearch(entity, tree.byEntityId[entity.id] ?? [], catalogs, viewMode, normalizedQuery)
  );

  const handleResult = (result: InventoryActionResult) => {
    setActionMessage(result.ok ? null : result.message);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragEntryId(entryIdFromDragId(event.active.id));
  };

  const setIntent = (intent: RowDropIntent | null) => {
    dropIntentRef.current = intent;
    setDropIntent(intent);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    setIntent(computeRowZone(event, tree, catalogs, entryIdFromDragId(event.active.id)));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragEntryId(null);
    const intent = dropIntentRef.current;
    setIntent(null);
    const entryId = entryIdFromDragId(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : "";
    if (!entryId || !overId) return;
    const activeEntry = inventoryEntries.find((entry) => entry.id === entryId);
    if (!activeEntry || isCoinPurseEntry(activeEntry, catalogs)) return;

    // Center-on-row swap: when both items are siblings, just exchange their order.
    if (intent?.position === "swap" && intent.entryId !== entryId) {
      const targetEntry = inventoryEntries.find((entry) => entry.id === intent.entryId);
      if (targetEntry && canSwapOrder(activeEntry, targetEntry)) {
        const location: InventoryLocation = isInventoryLocation(activeEntry.location) ? activeEntry.location : { kind: "equipped" };
        const siblings = nodesForDestination(tree, { entityId: activeEntry.entityId, location, handSlot: activeEntry.handSlot ?? null });
        const effectiveSortOrder = (id: string) => {
          const index = siblings.findIndex((node) => node.entry.id === id);
          return normalizedSortOrder(siblings[index]?.entry.sortOrder) ?? (index + 1) * 10;
        };
        handleResult(
          await swapInventoryOrder(
            { entryId, sortOrder: effectiveSortOrder(targetEntry.id) },
            { entryId: targetEntry.id, sortOrder: effectiveSortOrder(entryId) }
          )
        );
        return;
      }
      // Different lists: fall through to an insert below the target.
    }

    const position = intent?.position;
    const destination = dropDestinationFromId(overId, tree, inventoryEntries, catalogs, entryId, position);
    if (!destination || destination.targetEntryId === entryId) return;
    const resolvedHandSlot = handSlotForDrop(activeEntry, destination.handSlot, catalogs);
    const resolvedDestination = { ...destination, handSlot: resolvedHandSlot };
    const orderPlan = inventorySortOrderPlan(tree, resolvedDestination, entryId, position === "before" ? "before" : "after");
    const result = await moveInventoryEntry({
      entryId,
      entityId: resolvedDestination.entityId,
      location: resolvedDestination.location,
      handSlot: resolvedHandSlot,
      sortOrder: orderPlan.sortOrder
    });
    handleResult(result);
    if (!result.ok) return;
    await Promise.all(
      orderPlan.rebalancedEntries.map(({ entry, sortOrder }) =>
        updateInventoryEntry({
          ...entry,
          sortOrder
        })
      )
    );
  };

  const handleDragCancel = () => {
    setActiveDragEntryId(null);
    setIntent(null);
  };

  const activeDragNode = activeDragEntryId ? tree.allNodes.find((node) => node.entry.id === activeDragEntryId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={inventoryCollisionDetection}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={(event) => void handleDragEnd(event)}
      onDragCancel={handleDragCancel}
    >
      <DropIntentContext.Provider value={dropIntent}>
      <main className="page-stack inventory-page">
      <section className="inventory-toolbar panel">
        <div>
          <p className="eyebrow">Inventory</p>
          <h2>Party Logistics</h2>
        </div>
        <label className="search-field">
          <Search size={16} />
          <input placeholder="Search inventory" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="toolbar-actions">
          {actionMessage && <span className="warning-pill">{actionMessage}</span>}
          <span className="quiet-pill">
            <Flame size={14} />
            {activeLights.length} lights
          </span>
          <button className="primary-action" onClick={() => void spendTurn()} title="Spend one turn">
            <TimerReset size={17} />
            Turn
          </button>
        </div>
      </section>

      <section className="inventory-card-grid">
        {visibleAdventurers.map((entity) => (
          <InventoryCard
            key={entity.id}
            entity={entity}
            nodes={tree.byEntityId[entity.id] ?? []}
            summary={summaries[entity.id]}
            onAdd={setItemModalTarget}
            onEdit={setItemModalTarget}
            onHide={() => void retireEntity(entity.id)}
            onResult={handleResult}
          />
        ))}
      </section>

      {otherEntities.length > 0 && (
        <section className="panel compact-entity-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Other</p>
              <h2>Mounts, Hirelings, Storage</h2>
            </div>
          </div>
          <div className="compact-entity-list">
            {otherEntities.map((entity) => {
              const expanded = expandedOtherIds.includes(entity.id);
              return (
                <article className="compact-entity" key={entity.id}>
                  <header>
                    <button
                      className="icon-button"
                      onClick={() =>
                        setExpandedOtherIds((ids) =>
                          ids.includes(entity.id) ? ids.filter((id) => id !== entity.id) : [...ids, entity.id]
                        )
                      }
                      title={expanded ? "Collapse" : "Expand"}
                    >
                      {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <div>
                      <strong>{entity.name}</strong>
                      <span>{entity.type}</span>
                    </div>
                    <span className="capacity">{loadSummary(summaries[entity.id])}</span>
                    <button className="icon-button" onClick={() => void retireEntity(entity.id)} title="Hide">
                      <EyeOff size={15} />
                    </button>
                  </header>
                  {expanded && (
                    <EntityInventorySections
                      entity={entity}
                      nodes={tree.byEntityId[entity.id] ?? []}
                      onAdd={setItemModalTarget}
                      onEdit={setItemModalTarget}
                      onResult={handleResult}
                    />
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {hiddenEntities.length > 0 && (
        <section className="panel compact-entity-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Hidden</p>
              <h2>Retired or Hidden</h2>
            </div>
          </div>
          <div className="hidden-entity-list">
            {hiddenEntities.map((entity) => (
              <div className="flat-row" key={entity.id}>
                <span>
                  <strong>{entity.name}</strong> · {entity.type}
                </span>
                <button className="small-button" onClick={() => void restoreEntity(entity.id)}>
                  <Undo2 size={14} />
                  Show
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {itemModalTarget && <ItemModal target={itemModalTarget} onClose={() => setItemModalTarget(null)} onResult={handleResult} />}
      </main>
      <DragOverlay>
        {activeDragNode ? <InventoryDragOverlay node={activeDragNode} catalogs={catalogs} viewMode={viewMode} /> : null}
      </DragOverlay>
      </DropIntentContext.Provider>
    </DndContext>
  );
}

function InventoryCard({
  entity,
  nodes,
  summary,
  onAdd,
  onEdit,
  onHide,
  onResult
}: {
  entity: Entity;
  nodes: InventoryNode[];
  summary: ReturnType<typeof summarizeEntity>;
  onAdd: (target: AddTarget) => void;
  onEdit: (target: EditTarget) => void;
  onHide: () => void;
  onResult: (result: InventoryActionResult) => void;
}) {
  return (
    <article className="inventory-card">
      <header className="inventory-card-header">
        <div>
          <h3>{entity.name}</h3>
          <span>{entity.type}</span>
        </div>
        <button className="icon-button" onClick={onHide} title="Hide from inventory">
          <EyeOff size={15} />
        </button>
      </header>
      <div className="load-strip">
        <span>Move {summary.movementExploration}/{summary.movementEncounter}</span>
        <span>Eq {summary.equippedSlots}</span>
        <span>St {summary.stowedSlots}</span>
        <span>Total {loadSummary(summary)}</span>
      </div>
      <EntityInventorySections entity={entity} nodes={nodes} onAdd={onAdd} onEdit={onEdit} onResult={onResult} />
    </article>
  );
}

function EntityInventorySections({
  entity,
  nodes,
  onAdd,
  onEdit,
  onResult
}: {
  entity: Entity;
  nodes: InventoryNode[];
  onAdd: (target: AddTarget) => void;
  onEdit: (target: EditTarget) => void;
  onResult: (result: InventoryActionResult) => void;
}) {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const rootNodes = nodes;
  const equippedNodes = rootNodes.filter((node) => node.item.type !== "container" && !node.entry.handSlot);
  const handNodes = rootNodes.filter((node) => Boolean(node.entry.handSlot));
  const coinPurseNodes = rootNodes.filter((node) => isCoinPurseEntry(node.entry, catalogs));
  const containerNodes = rootNodes.filter((node) => node.item.type === "container" && !isCoinPurseEntry(node.entry, catalogs));

  return (
    <div className="inventory-sections">
      <div className="entity-inventory-actions">
        <button
          className="tiny-button primary-action"
          onClick={() =>
            onAdd({
              mode: "add",
              entityId: entity.id,
              location: { kind: "equipped" },
              handSlot: null,
              title: `Add item to ${entity.name}`
            })
          }
        >
          <Plus size={13} />
          Add item
        </button>
      </div>

      <InventorySection title="Hands" icon={<Hand size={15} />}>
        <HandSlots entity={entity} nodes={handNodes} onEdit={onEdit} />
      </InventorySection>

      {coinPurseNodes.length > 0 && (
        <InventorySection title="Coin Purse" icon={<Coins size={15} />}>
          <CoinPurseList entity={entity} purseNodes={coinPurseNodes} onEdit={onEdit} onResult={onResult} />
        </InventorySection>
      )}

      <InventorySection title={rootInventoryTitle(entity)} icon={<Package size={15} />}>
        <InventoryDropZone id={rootDropId(entity.id, "equipped")} className="inventory-drop-zone">
          <NodeList
            nodes={equippedNodes}
            empty={rootInventoryEmptyLabel(entity)}
            onEdit={onEdit}
          />
        </InventoryDropZone>
      </InventorySection>

      <InventorySection title="Containers" icon={<Backpack size={15} />}>
        <InventoryDropZone id={rootDropId(entity.id, "containers")} className="inventory-drop-zone">
          <NodeList
            nodes={containerNodes}
            empty="No containers"
            onEdit={onEdit}
          />
        </InventoryDropZone>
      </InventorySection>
    </div>
  );
}

function InventorySection({
  title,
  icon,
  children
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="inventory-section">
      <header>
        <span>
          {icon}
          {title}
        </span>
      </header>
      {children}
    </section>
  );
}

function HandSlots({
  entity,
  nodes,
  onEdit
}: {
  entity: Entity;
  nodes: InventoryNode[];
  onEdit: (target: EditTarget) => void;
}) {
  const bothHands = nodes.filter((node) => node.entry.handSlot === "both_hands");
  const left = nodes.filter((node) => node.entry.handSlot === "left_hand");
  const right = nodes.filter((node) => node.entry.handSlot === "right_hand");

  if (bothHands.length) {
    return (
      <div className="hand-slot-stack">
        <HandSlotBox entity={entity} label="Both hands" slot="left_hand" nodes={bothHands} blockedByBoth={false} onEdit={onEdit} doubleHeight />
      </div>
    );
  }

  return (
    <div className="hand-slot-stack">
      <HandSlotBox entity={entity} label="Left" slot="left_hand" nodes={left} blockedByBoth={false} onEdit={onEdit} />
      <HandSlotBox entity={entity} label="Right" slot="right_hand" nodes={right} blockedByBoth={false} onEdit={onEdit} />
    </div>
  );
}

function HandSlotBox({
  entity,
  label,
  slot,
  nodes,
  blockedByBoth,
  onEdit,
  doubleHeight = false
}: {
  entity: Entity;
  label: string;
  slot: HandSlot;
  nodes: InventoryNode[];
  blockedByBoth: boolean;
  onEdit: (target: EditTarget) => void;
  doubleHeight?: boolean;
}) {
  return (
    <InventoryDropZone
      id={handDropId(entity.id, slot)}
      className={`${nodes.length ? "hand-slot-box occupied" : "hand-slot-box"}${doubleHeight ? " double-hand-slot" : ""}`}
    >
      <header>
        <span>{label}</span>
      </header>
      {nodes.length ? (
        <div className="hand-item-list">
          {nodes.map((node) => (
            <HandItemRow key={node.entry.id} node={node} blockedByBoth={blockedByBoth} onEdit={onEdit} />
          ))}
        </div>
      ) : (
        <p className="empty-row">Empty</p>
      )}
    </InventoryDropZone>
  );
}

function HandItemRow({
  node,
  blockedByBoth,
  onEdit
}: {
  node: InventoryNode;
  blockedByBoth: boolean;
  onEdit: (target: EditTarget) => void;
}) {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const toggleLight = useCampaignStore((state) => state.toggleLight);
  const remaining = turnsRemaining(node.entry, node.item);
  const isDepleted = node.entry.state?.isDepleted === true;
  const drag = useInventoryDraggable(node.entry.id);
  const rowDrop = useInventoryRowDrop(node.entry.id);
  const name = itemRowName(node.entry, catalogs, viewMode);
  const meta = itemSlotSummary(node.entry, catalogs);

  return (
    <div ref={mergeRefs(drag.setNodeRef, rowDrop.setNodeRef)} className={rowClassName("hand-item-row", drag.isDragging, rowDrop.isOver, rowDrop.position)} style={drag.style}>
      <DragHandle drag={drag} label={`Drag ${name}`} />
      <div className="inventory-row-name">
        <button className="item-name-button" onClick={() => onEdit({ mode: "edit", entry: node.entry, title: `Edit ${displayName(node.entry, catalogs, viewMode)}` })}>
          {name}
        </button>
      </div>
      <span className="item-meta">{blockedByBoth ? `both hands · ${meta}` : meta}</span>
      {node.item.emitsLight && (
        <div>
          <button
            className={node.entry.state?.isLit ? "icon-button lit" : "icon-button"}
            onClick={() => void toggleLight(node.entry.id)}
            title={isDepleted ? "Light source is depleted" : "Toggle light"}
            disabled={isDepleted}
          >
            <Flame size={13} />
            {isDepleted ? "Empty" : remaining === null ? "Lit" : remaining}
          </button>
        </div>
      )}
    </div>
  );
}

function CoinPurseList({
  entity,
  purseNodes,
  onEdit,
  onResult
}: {
  entity: Entity;
  purseNodes: InventoryNode[];
  onEdit: (target: EditTarget) => void;
  onResult: (result: InventoryActionResult) => void;
}) {
  return (
    <div className="coin-purse-list">
      {purseNodes.map((node) => (
        <CoinPurseCard key={node.entry.id} entity={entity} node={node} onEdit={onEdit} onResult={onResult} />
      ))}
    </div>
  );
}

function CoinPurseCard({
  entity,
  node,
  onEdit,
  onResult
}: {
  entity: Entity;
  node: InventoryNode;
  onEdit: (target: EditTarget) => void;
  onResult: (result: InventoryActionResult) => void;
}) {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const upsertCoinPurseCoins = useCampaignStore((state) => state.upsertCoinPurseCoins);
  const savedCoins = useMemo(() => coinsInPurse(node, catalogs), [node, catalogs]);
  const [coins, setCoins] = useState<CoinBreakdown>(savedCoins);
  const totalCoins = coinTotal(coins);
  const coinCapacity = node.coinCapacity ?? 0;
  const overCoinCapacity = node.coinCapacity !== undefined && totalCoins > node.coinCapacity;
  const treasureNodes = node.children.filter((child) => isZeroSlotTreasureEntry(child.entry, catalogs));

  useEffect(() => {
    setCoins(savedCoins);
  }, [savedCoins.pp, savedCoins.gp, savedCoins.sp, savedCoins.cp]);

  const setDenomination = (denomination: keyof CoinBreakdown, value: string) => {
    setCoins((current) => normalizeCoins({ ...current, [denomination]: positiveIntegerFromInput(value, 0) }));
  };

  const saveCoins = async () => {
    const result = await upsertCoinPurseCoins({ entityId: entity.id, purseEntryId: node.entry.id, coins });
    onResult(result);
  };

  return (
    <article className="coin-purse-card fixed-inventory-card">
      <header>
        <button className="item-name-button" onClick={() => onEdit({ mode: "edit", entry: node.entry, title: `Edit ${displayName(node.entry, catalogs, viewMode)}` })}>
          {displayName(node.entry, catalogs, viewMode)}
        </button>
        <span className={overCoinCapacity ? "capacity over" : "capacity"}>
          {totalCoins}/{coinCapacity} coins
        </span>
      </header>
      <div className="coin-input-grid">
        {(["pp", "gp", "sp", "cp"] as Array<keyof CoinBreakdown>).map((denomination) => (
          <label key={denomination}>
            {denomination.toUpperCase()}
            <input
              type="text" inputMode="numeric" pattern="[0-9]*"
              min={0}
              value={coins[denomination]}
              onChange={(event) => setDenomination(denomination, event.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="coin-purse-actions">
        <span className={overCoinCapacity ? "warning-pill" : "quiet-pill"}>{totalCoins} total</span>
        <button className="tiny-button" onClick={() => void saveCoins()}>
          Save coins
        </button>
      </div>
      <InventoryDropZone id={insideDropId(node.entry.id)} className="coin-treasure-list inventory-drop-zone inside-drop-zone">
        {treasureNodes.length ? (
          treasureNodes.map((treasureNode) => (
            <CoinTreasureRow key={treasureNode.entry.id} node={treasureNode} onEdit={onEdit} />
          ))
        ) : (
          <p className="empty-row">No small treasure</p>
        )}
      </InventoryDropZone>
    </article>
  );
}

function CoinTreasureRow({
  node,
  onEdit
}: {
  node: InventoryNode;
  onEdit: (target: EditTarget) => void;
}) {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const drag = useInventoryDraggable(node.entry.id);
  const rowDrop = useInventoryRowDrop(node.entry.id);
  const name = itemRowName(node.entry, catalogs, viewMode);

  return (
    <div ref={mergeRefs(drag.setNodeRef, rowDrop.setNodeRef)} className={rowClassName("coin-treasure-row", drag.isDragging, rowDrop.isOver, rowDrop.position)} style={drag.style}>
      <DragHandle drag={drag} label={`Drag ${name}`} />
      <Gem size={14} />
      <div>
        <button
          className="item-name-button"
          onClick={() =>
            onEdit({
              mode: "edit",
              entry: node.entry,
              title: `Edit ${displayName(node.entry, catalogs, viewMode)}`
            })
          }
        >
          {name}
        </button>
      </div>
      <span className="item-meta">{treasureSummary(node, catalogs)}</span>
    </div>
  );
}

type InventoryDragHandle = ReturnType<typeof useInventoryDraggable>;

function useInventoryDraggable(entryId: string) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragEntryId(entryId),
    data: { type: "inventory-entry", entryId }
  });
  return {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    style: {
      transform: CSS.Translate.toString(transform)
    } as React.CSSProperties
  };
}

function useInventoryRowDrop(entryId: string) {
  const { setNodeRef, isOver } = useDroppable({ id: rowDropId(entryId) });
  const intent = useContext(DropIntentContext);
  const position = intent && intent.entryId === entryId ? intent.position : null;
  return { setNodeRef, isOver, position };
}

function mergeRefs<T>(...refs: Array<(node: T | null) => void>) {
  return (node: T | null) => {
    refs.forEach((ref) => ref(node));
  };
}

function rowClassName(base: string, dragging: boolean, over: boolean, position: RowDropPosition | null): string {
  const dropClass = position
    ? position === "before"
      ? "drop-before"
      : position === "after"
        ? "drop-after"
        : position === "inside"
          ? "drop-inside"
          : "drop-swap"
    : over
      ? "row-drop-over"
      : "";
  return [base, dragging ? "dragging" : "", dropClass].filter(Boolean).join(" ");
}

function DragHandle({ drag, label }: { drag: InventoryDragHandle; label: string }) {
  return (
    <button
      className="drag-handle"
      type="button"
      title={label}
      aria-label={label}
      {...drag.attributes}
      {...drag.listeners}
    >
      <GripVertical size={14} />
    </button>
  );
}

function InventoryDropZone({
  id,
  className,
  children
}: {
  id: string;
  className: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={isOver ? `${className} drop-over` : className}>
      {children}
    </div>
  );
}

function NodeList({
  nodes,
  empty,
  onEdit
}: {
  nodes: InventoryNode[];
  empty: string;
  onEdit: (target: EditTarget) => void;
}) {
  if (!nodes.length) return <p className="empty-row">{empty}</p>;
  return (
    <div className="inventory-node-list">
      {nodes.map((node) => (
        <InventoryNodeRow
          key={node.entry.id}
          node={node}
          depth={0}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}

function InventoryNodeRow({
  node,
  depth,
  onEdit
}: {
  node: InventoryNode;
  depth: number;
  onEdit: (target: EditTarget) => void;
}) {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const splitEntry = useCampaignStore((state) => state.splitEntry);
  const toggleLight = useCampaignStore((state) => state.toggleLight);
  const [expanded, setExpanded] = useState(true);
  const remaining = turnsRemaining(node.entry, node.item);
  const isDepleted = node.entry.state?.isDepleted === true;
  const coins = coinBreakdownForEntry(node.entry, catalogs);
  const isContainer = node.item.type === "container";
  const hasRowActions = node.item.emitsLight || (node.entry.quantity > 1 && !coins);
  const drag = useInventoryDraggable(node.entry.id);
  const rowDrop = useInventoryRowDrop(node.entry.id);
  const name = itemRowName(node.entry, catalogs, viewMode);
  const meta = coins ? coinBreakdownSummary(coins) : itemSlotSummary(node.entry, catalogs);

  return (
    <div className={isContainer ? "inventory-node container-node" : "inventory-node"} style={{ "--depth": depth } as React.CSSProperties}>
      <div ref={mergeRefs(drag.setNodeRef, rowDrop.setNodeRef)} className={rowClassName("inventory-row", drag.isDragging, rowDrop.isOver, rowDrop.position)} style={drag.style}>
        <DragHandle drag={drag} label={`Drag ${name}`} />
        {node.children.length ? (
          <button
            className="icon-button"
            onClick={() => setExpanded((value) => !value)}
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : null}
        <Box size={15} />
        <div className="inventory-row-name">
          <button className="item-name-button" onClick={() => onEdit({ mode: "edit", entry: node.entry, title: `Edit ${displayName(node.entry, catalogs, viewMode)}` })}>
            {name}
          </button>
        </div>
        <span className="item-meta">{meta}</span>
        {isContainer && (
          <span className={node.overCapacity ? "capacity over" : "capacity"}>
            {node.usedSlots}/{node.capacitySlots}
          </span>
        )}
        {hasRowActions && (
          <div className="row-actions">
            {node.item.emitsLight && (
              <button
                className={node.entry.state?.isLit ? "icon-button lit" : "icon-button"}
                onClick={() => void toggleLight(node.entry.id)}
                title={isDepleted ? "Light source is depleted" : "Toggle light"}
                disabled={isDepleted}
              >
                <Flame size={15} />
                {isDepleted ? "Empty" : remaining === null ? "Lit" : remaining}
              </button>
            )}
            {node.entry.quantity > 1 && !coins && (
              <button className="tiny-button" onClick={() => void splitEntry(node.entry.id, Math.ceil(node.entry.quantity / 2))}>
                Split
              </button>
            )}
          </div>
        )}
      </div>
      {expanded && node.children.length > 0 && (
        <div className="inventory-node-children">
          {node.children.map((child) => (
            <InventoryNodeRow
              key={child.entry.id}
              node={child}
              depth={depth + 1}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemModal({
  target,
  onClose,
  onResult
}: {
  target: ItemModalTarget;
  onClose: () => void;
  onResult: (result: InventoryActionResult) => void;
}) {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const entities = useCampaignStore((state) => state.entities);
  const inventoryEntries = useCampaignStore((state) => state.inventoryEntries);
  const addCustomItem = useCampaignStore((state) => state.addCustomItem);
  const updateInventoryItem = useCampaignStore((state) => state.updateInventoryItem);
  const moveInventoryEntry = useCampaignStore((state) => state.moveInventoryEntry);
  const deleteEntry = useCampaignStore((state) => state.deleteEntry);
  const activeEntities = useMemo(() => entities.filter((entity) => entity.active), [entities]);
  const editingEntry = target.mode === "edit" ? target.entry : null;
  const isEditing = Boolean(editingEntry);
  const currentEntry = editingEntry ? inventoryEntries.find((entry) => entry.id === editingEntry.id) ?? editingEntry : null;
  const startingItem = editingEntry ? entryItem(editingEntry, catalogs) : createBlankItem(target.mode === "add" ? target.preferredType ?? "gear" : "gear");
  const [itemId] = useState(() => editingEntry?.customItem?.id ?? `custom-${crypto.randomUUID()}`);
  const [entityId, setEntityId] = useState(editingEntry?.entityId ?? (target.mode === "add" ? target.entityId : ""));
  const [locationKind, setLocationKind] = useState<InventoryLocation["kind"]>(
    editingEntry ? editingEntry.location.kind : target.mode === "add" ? target.location.kind : "equipped"
  );
  const [parentEntryId, setParentEntryId] = useState(
    (editingEntry?.location.kind === "contained" ? editingEntry.location.parentEntryId : "") ||
      (target.mode === "add" && target.location.kind === "contained" ? target.location.parentEntryId : "")
  );
  const [handSlot, setHandSlot] = useState<HandSlot | null>(editingEntry?.handSlot ?? (target.mode === "add" ? target.handSlot ?? null : null));
  const [transferOpen, setTransferOpen] = useState(false);
  const [name, setName] = useState(startingItem.name === "Custom item" ? "" : startingItem.name);
  const [type, setType] = useState<ItemType>(startingItem.type);
  const [identified, setIdentified] = useState(startingItem.identified ?? true);
  const [description, setDescription] = useState(startingItem.description ?? "");
  const [quantity, setQuantity] = useState(editingEntry?.quantity ?? startingItem.quantity ?? 1);
  const [slotsPerUnit, setSlotsPerUnit] = useState(startingItem.slotsPerUnit ?? 0);
  const [stackSize, setStackSize] = useState<number | null>(startingItem.stackSize ?? null);
  const [gpValue, setGpValue] = useState<number | null>(startingItem.gpValue ?? null);
  const [handsRequired, setHandsRequired] = useState<number | null>(startingItem.handsRequired ?? 0);
  const [weaponDamage, setWeaponDamage] = useState(startingItem.weapon?.damage ?? "1d6");
  const [weaponRangeShort, setWeaponRangeShort] = useState<number | null>(startingItem.weapon?.rangeShort ?? null);
  const [weaponRangeMedium, setWeaponRangeMedium] = useState<number | null>(startingItem.weapon?.rangeMedium ?? null);
  const [weaponRangeLong, setWeaponRangeLong] = useState<number | null>(startingItem.weapon?.rangeLong ?? null);
  const [weaponQualities, setWeaponQualities] = useState(startingItem.weapon?.qualities?.join(", ") ?? "");
  const [armorType, setArmorType] = useState<ArmorType>(startingItem.armor?.armorType ?? "armor");
  const [baseAcAscending, setBaseAcAscending] = useState<number | null>(startingItem.armor?.baseAcAscending ?? 12);
  const [acBonus, setAcBonus] = useState<number | null>(startingItem.armor?.acBonus ?? (startingItem.armor?.armorType === "shield" ? 1 : null));
  const [containerCapacity, setContainerCapacity] = useState(startingItem.container?.capacitySlots ?? 1);
  const [slotsWhenStowed, setSlotsWhenStowed] = useState(startingItem.container?.slotsWhenStowed ?? startingItem.slotsPerUnit ?? 0);
  const [canBeStowed, setCanBeStowed] = useState(startingItem.container?.canBeStowed ?? true);
  const [containerLoadCategory, setContainerLoadCategory] = useState<ContainerLoadCategory>(startingItem.container?.loadCategory ?? "stowed");
  const [coinCapacity, setCoinCapacity] = useState<number | null>(startingItem.container?.coinCapacity ?? null);
  const [emitsLight, setEmitsLight] = useState(Boolean(startingItem.emitsLight));
  const [lightRadiusFeet, setLightRadiusFeet] = useState<number | null>(startingItem.lightRadiusFeet ?? null);
  const [durationTurnsMax, setDurationTurnsMax] = useState<number | null>(startingItem.gear?.durationTurnsMax ?? null);
  const [usesMax, setUsesMax] = useState<number | null>(startingItem.gear?.usesMax ?? startingItem.gear?.usesRemaining ?? null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState<string | null>(null);

  const tree = useMemo(() => buildInventoryTree(inventoryEntries, catalogs), [inventoryEntries, catalogs]);
  const editNode = currentEntry ? tree.allNodes.find((node) => node.entry.id === currentEntry.id) : undefined;
  const allContainerNodes = flattenNodes(tree.byEntityId[entityId] ?? []).filter((node) => node.item.type === "container");
  const containerNodes = editingEntry && editNode ? containersForMove(editNode, allContainerNodes) : allContainerNodes;
  const itemSuggestions = useMemo(() => rankItemSuggestions(catalogs.items, name).slice(0, 6), [catalogs.items, name]);
  const showSuggestions = suggestionsOpen && name.trim().length >= 2 && itemSuggestions.length > 0;
  const selectedEntity = activeEntities.find((entity) => entity.id === entityId);
  const transferDestination = locationKind === "contained" ? "contained" : handSlot ?? "root";
  const selectedLocation: InventoryLocation =
    locationKind === "contained" && parentEntryId
      ? { kind: "contained", parentEntryId }
      : { kind: "equipped" };

  useEffect(() => {
    if (locationKind === "contained" && !containerNodes.some((node) => node.entry.id === parentEntryId)) {
      setParentEntryId(containerNodes[0]?.entry.id ?? "");
    }
  }, [containerNodes, locationKind, parentEntryId]);

  const applySuggestion = (item: ItemTemplate) => {
    setName(item.name);
    setType(item.type);
    setIdentified(item.identified ?? true);
    setDescription(item.description ?? "");
    setQuantity(defaultInventoryQuantity(item));
    setSlotsPerUnit(item.slotsPerUnit ?? 0);
    setStackSize(item.stackSize ?? null);
    setGpValue(item.gpValue ?? null);
    setHandsRequired(item.handsRequired ?? 0);
    setWeaponDamage(item.weapon?.damage ?? "1d6");
    setWeaponRangeShort(item.weapon?.rangeShort ?? null);
    setWeaponRangeMedium(item.weapon?.rangeMedium ?? null);
    setWeaponRangeLong(item.weapon?.rangeLong ?? null);
    setWeaponQualities(item.weapon?.qualities?.join(", ") ?? "");
    setArmorType(item.armor?.armorType ?? "armor");
    setBaseAcAscending(item.armor?.baseAcAscending ?? 12);
    setAcBonus(item.armor?.acBonus ?? (item.armor?.armorType === "shield" ? 1 : null));
    setContainerCapacity(item.container?.capacitySlots ?? 1);
    setSlotsWhenStowed(item.container?.slotsWhenStowed ?? item.slotsPerUnit ?? 0);
    setCanBeStowed(item.container?.canBeStowed ?? true);
    setContainerLoadCategory(item.container?.loadCategory ?? (item.id === "item_belt_pouch_005" ? "equipped" : "stowed"));
    setCoinCapacity(item.container?.coinCapacity ?? null);
    setEmitsLight(Boolean(item.emitsLight));
    setLightRadiusFeet(item.lightRadiusFeet ?? null);
    setDurationTurnsMax(item.gear?.durationTurnsMax ?? null);
    setUsesMax(item.gear?.usesMax ?? item.gear?.usesRemaining ?? null);
    setSuggestionsOpen(false);
  };

  const deleteItem = async () => {
    if (!editingEntry) return;
    await deleteEntry(editingEntry.id);
    onResult({ ok: true });
    onClose();
  };

  const changeTransferDestination = (destination: string) => {
    if (destination === "contained") {
      setLocationKind("contained");
      setHandSlot(null);
      setParentEntryId(containerNodes[0]?.entry.id ?? "");
      return;
    }
    setLocationKind("equipped");
    setParentEntryId("");
    setHandSlot(destination === "root" ? null : (destination as HandSlot));
  };

  const transferItem = async () => {
    if (!editingEntry) return;
    if (!entityId) {
      setModalMessage("Choose an entity first.");
      return;
    }
    if (locationKind === "contained" && !parentEntryId) {
      setModalMessage("Choose a container first.");
      return;
    }
    const transferLocation: InventoryLocation =
      locationKind === "contained" && parentEntryId ? { kind: "contained", parentEntryId } : { kind: "equipped" };
    const result = await moveInventoryEntry({
      entryId: editingEntry.id,
      entityId,
      location: transferLocation,
      handSlot: transferLocation.kind === "equipped" ? handSlot : null
    });
    if (!result.ok) {
      setModalMessage(result.message);
      onResult(result);
      return;
    }
    setTransferOpen(false);
    setModalMessage(null);
    onResult(result);
  };

  const saveItem = async () => {
    const placementEntityId = currentEntry?.entityId ?? (target.mode === "add" ? entityId : "");
    const placementLocation = currentEntry?.location ?? selectedLocation;
    const placementHandSlot = placementLocation.kind === "equipped" ? (currentEntry ? currentEntry.handSlot ?? null : handSlot) : null;
    if (!placementEntityId) return;
    if (!name.trim()) {
      setModalMessage("Name the item first.");
      return;
    }
    if (!editingEntry && locationKind === "contained" && !parentEntryId) {
      setModalMessage("Choose a container first.");
      return;
    }
    const item = buildItemTemplate({
      id: itemId,
      name,
      type,
      identified,
      description,
      slotsPerUnit,
      stackSize,
      gpValue,
      handsRequired,
      weaponDamage,
      weaponRangeShort,
      weaponRangeMedium,
      weaponRangeLong,
      weaponQualities,
      armorType,
      baseAcAscending,
      acBonus,
      containerCapacity,
      slotsWhenStowed,
      canBeStowed,
      containerLoadCategory,
      coinCapacity,
      emitsLight,
      lightRadiusFeet,
      durationTurnsMax,
      usesMax
    });
    const result = editingEntry
      ? await updateInventoryItem({
          entryId: editingEntry.id,
          entityId: placementEntityId,
          item,
          quantity,
          location: placementLocation,
          handSlot: placementHandSlot
        })
      : await addCustomItem({
          entityId: placementEntityId,
          item,
          quantity,
          location: selectedLocation,
          handSlot: selectedLocation.kind === "equipped" ? handSlot : null
        });
    if (!result.ok) {
      setModalMessage(result.message);
      onResult(result);
      return;
    }
    onResult(result);
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel item-modal" role="dialog" aria-modal="true" aria-label={target.title}>
        <header>
          <div>
            <p className="eyebrow">{isEditing ? "Edit Item" : "Add Item"}</p>
            <h2>{target.title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </header>
        {modalMessage && <span className="warning-pill">{modalMessage}</span>}
        {isEditing && (
          <section className="transfer-panel">
            <div className="transfer-summary">
              <span>{currentEntry ? placementSummary(currentEntry, catalogs, "gm", entities, inventoryEntries) : "Item placement unavailable"}</span>
              <button className="tiny-button" onClick={() => setTransferOpen((open) => !open)}>
                <ArrowRightLeft size={13} />
                Transfer
              </button>
            </div>
            {transferOpen && (
              <div className="form-grid transfer-fields">
                <div className="inline-fields">
                  <label>
                    Entity
                    <select
                      value={entityId}
                      onChange={(event) => {
                        setEntityId(event.target.value);
                        setLocationKind("equipped");
                        setHandSlot(null);
                        setParentEntryId("");
                      }}
                    >
                      {activeEntities.map((entity) => (
                        <option key={entity.id} value={entity.id}>
                          {entity.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Destination
                    <select value={transferDestination} onChange={(event) => changeTransferDestination(event.target.value)}>
                      <option value="root">{rootInventoryTitle(selectedEntity)}</option>
                      {(["left_hand", "right_hand", "both_hands"] as HandSlot[]).map((slot) => {
                        const validation = validateHandAssignment(entityId, inventoryEntries, slot, editingEntry?.id);
                        const blockers = validation.ok ? "" : ` (${validation.blockers.map((entry) => displayName(entry, catalogs, "gm")).join(", ")})`;
                        return (
                          <option key={slot} value={slot} disabled={!validation.ok && transferDestination !== slot}>
                            {slot.replace("_", " ")}{blockers}
                          </option>
                        );
                      })}
                      <option value="contained" disabled={!containerNodes.length}>inside container</option>
                    </select>
                  </label>
                </div>
                {locationKind === "contained" && (
                  <label>
                    Container
                    <select value={parentEntryId} onChange={(event) => setParentEntryId(event.target.value)}>
                      {containerNodes.map((node) => (
                        <option key={node.entry.id} value={node.entry.id}>
                          {displayName(node.entry, catalogs, "gm")}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="transfer-actions">
                  <button onClick={() => setTransferOpen(false)}>Cancel transfer</button>
                  <button className="primary-action" onClick={() => void transferItem()}>
                    <ArrowRightLeft size={15} />
                    Move item
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
        <div className="form-grid">
          <div className="inline-fields modal-line-1">
            <label className="suggestion-field">
              Name
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setSuggestionsOpen(true);
                }}
                autoFocus
              />
              {showSuggestions && (
                <div className="suggestion-list">
                  {itemSuggestions.map((item) => (
                    <button key={item.id} type="button" onClick={() => applySuggestion(item)}>
                      <strong>{suggestionName(item)}</strong>
                      <span>{suggestionSummary(item)}</span>
                    </button>
                  ))}
                </div>
              )}
            </label>
            <label>
              Type
              <select value={type} onChange={(event) => setType(event.target.value as ItemType)}>
                {itemTypeOptions.map((itemType) => (
                  <option key={itemType} value={itemType}>
                    {itemType}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-field compact-checkbox">
              <input type="checkbox" checked={!identified} onChange={(event) => setIdentified(!event.target.checked)} />
              Unidentified
            </label>
          </div>
          <div className="inline-fields four-fields">
            <label>
              Qty.
              <input type="text" inputMode="numeric" pattern="[0-9]*" min={1} value={quantity} onChange={(event) => setQuantity(positiveIntegerFromInput(event.target.value, 1))} />
            </label>
            <label>
              Slots
              <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={slotsPerUnit} onChange={(event) => setSlotsPerUnit(positiveIntegerFromInput(event.target.value, 0))} />
            </label>
            <label>
              Stack size
              <input type="text" inputMode="numeric" pattern="[0-9]*" min={1} value={nullableInputValue(stackSize)} onChange={(event) => setStackSize(nullableIntegerFromInput(event.target.value))} />
            </label>
            <label>
              Hands required
              <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={nullableInputValue(handsRequired)} onChange={(event) => setHandsRequired(nullableIntegerFromInput(event.target.value))} />
            </label>
          </div>
          <label>
            Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>
        {type === "weapon" && (
          <div className="form-grid type-fields">
            <div className="inline-fields">
              <label>
                Damage
                <input value={weaponDamage} onChange={(event) => setWeaponDamage(event.target.value)} />
              </label>
              <label>
                Qualities
                <input value={weaponQualities} onChange={(event) => setWeaponQualities(event.target.value)} />
              </label>
            </div>
            <div className="inline-fields three-fields">
              <label>
                Short
                <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={nullableInputValue(weaponRangeShort)} onChange={(event) => setWeaponRangeShort(nullableIntegerFromInput(event.target.value))} />
              </label>
              <label>
                Medium
                <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={nullableInputValue(weaponRangeMedium)} onChange={(event) => setWeaponRangeMedium(nullableIntegerFromInput(event.target.value))} />
              </label>
              <label>
                Long
                <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={nullableInputValue(weaponRangeLong)} onChange={(event) => setWeaponRangeLong(nullableIntegerFromInput(event.target.value))} />
              </label>
            </div>
          </div>
        )}
        {type === "armor" && (
          <div className="form-grid type-fields">
            <div className="inline-fields three-fields">
              <label>
                Armor type
                <select value={armorType} onChange={(event) => setArmorType(event.target.value as ArmorType)}>
                  {armorTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Base AC
                <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={nullableInputValue(baseAcAscending)} onChange={(event) => setBaseAcAscending(nullableIntegerFromInput(event.target.value))} />
              </label>
              <label>
                AC bonus
                <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={nullableInputValue(acBonus)} onChange={(event) => setAcBonus(nullableIntegerFromInput(event.target.value))} />
              </label>
            </div>
          </div>
        )}
        {type === "container" && (
          <div className="form-grid type-fields">
            <div className="inline-fields three-fields">
              <label>
                Capacity
                <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={containerCapacity} onChange={(event) => setContainerCapacity(positiveIntegerFromInput(event.target.value, 0))} />
              </label>
              <label>
                Stowed slots
                <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={slotsWhenStowed} onChange={(event) => setSlotsWhenStowed(positiveIntegerFromInput(event.target.value, 0))} />
              </label>
              <label>
                Load
                <select value={containerLoadCategory} onChange={(event) => setContainerLoadCategory(event.target.value as ContainerLoadCategory)}>
                  {containerLoadOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Coin cap
                <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={nullableInputValue(coinCapacity)} onChange={(event) => setCoinCapacity(nullableIntegerFromInput(event.target.value))} />
              </label>
            </div>
            <label className="checkbox-field">
              <input type="checkbox" checked={canBeStowed} onChange={(event) => setCanBeStowed(event.target.checked)} />
              Can be stowed
            </label>
          </div>
        )}
        {type === "gear" && (
          <div className="form-grid type-fields">
            <label className="checkbox-field">
              <input type="checkbox" checked={emitsLight} onChange={(event) => setEmitsLight(event.target.checked)} />
              Emits light
            </label>
            <div className="inline-fields three-fields">
              {emitsLight && (
                <>
                  <label>
                    Radius
                    <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={nullableInputValue(lightRadiusFeet)} onChange={(event) => setLightRadiusFeet(nullableIntegerFromInput(event.target.value))} />
                  </label>
                  <label>
                    Turns
                    <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={nullableInputValue(durationTurnsMax)} onChange={(event) => setDurationTurnsMax(nullableIntegerFromInput(event.target.value))} />
                  </label>
                </>
              )}
              <label>
                Uses
                <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={nullableInputValue(usesMax)} onChange={(event) => setUsesMax(nullableIntegerFromInput(event.target.value))} />
              </label>
            </div>
          </div>
        )}
        {type === "treasure" && (
          <div className="form-grid type-fields">
            <label>
              GP value
              <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={nullableInputValue(gpValue)} onChange={(event) => setGpValue(nullableIntegerFromInput(event.target.value))} />
            </label>
          </div>
        )}
        <footer>
          {editingEntry && (
            <button className="danger-action" onClick={() => void deleteItem()}>
              <Trash2 size={17} />
              Delete
            </button>
          )}
          <div className="footer-actions">
            <button onClick={onClose}>Cancel</button>
            <button className="primary-action" onClick={() => void saveItem()} disabled={!name.trim()}>
              {editingEntry ? <Pencil size={17} /> : <Plus size={17} />}
              {editingEntry ? "Save" : "Add"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

type ItemDraftFields = {
  id: string;
  name: string;
  type: ItemType;
  identified: boolean;
  description: string;
  slotsPerUnit: number;
  stackSize: number | null;
  gpValue: number | null;
  handsRequired: number | null;
  weaponDamage: string;
  weaponRangeShort: number | null;
  weaponRangeMedium: number | null;
  weaponRangeLong: number | null;
  weaponQualities: string;
  armorType: ArmorType;
  baseAcAscending: number | null;
  acBonus: number | null;
  containerCapacity: number;
  slotsWhenStowed: number;
  canBeStowed: boolean;
  containerLoadCategory: ContainerLoadCategory;
  coinCapacity: number | null;
  emitsLight: boolean;
  lightRadiusFeet: number | null;
  durationTurnsMax: number | null;
  usesMax: number | null;
};

function createBlankItem(type: ItemType): ItemTemplate {
  return {
    id: "custom-item",
    recordType: inventoryRecordTypeForItemType(type),
    type,
    identified: true,
    name: "Custom item",
    description: "",
    quantity: 1,
    slotsPerUnit: type === "treasure" ? 0 : 1,
    stackSize: null,
    handsRequired: 0,
    emitsLight: false,
    lightRadiusFeet: null,
    cursed: false,
    curseDescription: null,
    gpValue: null,
    gear: type === "gear" ? defaultGearFields() : undefined,
    container: type === "container" ? { capacitySlots: 4, canBeStowed: true, slotsWhenStowed: 1, loadCategory: "stowed" } : undefined,
    armor: type === "armor" ? { armorType: "armor", baseAcAscending: 12, acBonus: null, magicAcBonus: null } : undefined,
    weapon: type === "weapon" ? { damage: "1d6", rangeShort: null, rangeMedium: null, rangeLong: null, qualities: [] } : undefined,
    treasure: type === "treasure" ? {} : undefined
  };
}

function buildItemTemplate(fields: ItemDraftFields): ItemTemplate {
  const item: ItemTemplate = {
    id: fields.id,
    recordType: inventoryRecordTypeForItemType(fields.type),
    type: fields.type,
    identified: fields.identified,
    name: fields.name.trim(),
    description: fields.description.trim() || undefined,
    quantity: 1,
    slotsPerUnit: Math.max(0, Math.floor(fields.slotsPerUnit)),
    stackSize: fields.stackSize && fields.stackSize > 1 ? Math.floor(fields.stackSize) : null,
    handsRequired: fields.handsRequired === null ? null : Math.max(0, Math.floor(fields.handsRequired)),
    emitsLight: fields.type === "gear" ? fields.emitsLight : false,
    lightRadiusFeet: fields.type === "gear" && fields.emitsLight ? fields.lightRadiusFeet : null,
    cursed: false,
    curseDescription: null,
    gpValue: fields.type === "treasure" ? fields.gpValue : null
  };

  if (fields.type === "weapon") {
    item.weapon = {
      damage: fields.weaponDamage.trim() || "1d6",
      rangeShort: fields.weaponRangeShort,
      rangeMedium: fields.weaponRangeMedium,
      rangeLong: fields.weaponRangeLong,
      qualities: fields.weaponQualities
        .split(",")
        .map((quality) => quality.trim())
        .filter(Boolean)
    };
  }

  if (fields.type === "armor") {
    item.armor = {
      armorType: fields.armorType,
      baseAcAscending: fields.armorType === "armor" ? fields.baseAcAscending : null,
      acBonus: fields.armorType === "shield" ? fields.acBonus ?? 1 : fields.acBonus,
      magicAcBonus: null
    };
  }

  if (fields.type === "container") {
    item.container = {
      capacitySlots: Math.max(0, Math.floor(fields.containerCapacity)),
      canBeStowed: fields.canBeStowed,
      slotsWhenStowed: Math.max(0, Math.floor(fields.slotsWhenStowed)),
      loadCategory: fields.containerLoadCategory
    };
    if (fields.coinCapacity !== null) item.container.coinCapacity = Math.max(0, Math.floor(fields.coinCapacity));
  }

  if (fields.type === "gear") {
    item.gear = {
      ...defaultGearFields(),
      usesMax: fields.usesMax,
      usesRemaining: fields.usesMax,
      durationTurnsMax: fields.durationTurnsMax,
      durationTurnsUsed: 0,
      rulesNote: fields.emitsLight ? "Light source." : null
    };
  }

  if (fields.type === "treasure") {
    item.handsRequired = 0;
    item.emitsLight = false;
    item.lightRadiusFeet = null;
    item.treasure = {};
  }

  return item;
}

function defaultGearFields(): NonNullable<ItemTemplate["gear"]> {
  return {
    gearKind: "misc",
    usesMax: null,
    usesRemaining: null,
    consumedOnUse: false,
    durationTurnsMax: null,
    durationTurnsUsed: 0,
    durationDescription: null,
    containsSpells: false,
    spellData: null,
    language: null,
    readable: null,
    deciphered: null,
    rulesNote: null
  };
}

function rankItemSuggestions(items: ItemTemplate[], query: string): ItemTemplate[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 2) return [];
  return items
    .map((item) => ({ item, score: itemSuggestionScore(item, normalizedQuery) }))
    .filter(({ score }) => score < 100)
    .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name))
    .map(({ item }) => item);
}

function itemSuggestionScore(item: ItemTemplate, query: string): number {
  const name = item.name.toLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  if (name.includes(query)) return 3;
  return itemSearchText(item).includes(query) ? 4 : 100;
}

function suggestionName(item: ItemTemplate): string {
  const quantity = defaultInventoryQuantity(item);
  return quantity > 1 ? `${item.name} (${quantity})` : item.name;
}

function suggestionSummary(item: ItemTemplate): string {
  const details = [item.type, `${item.slotsPerUnit} slots`, item.gpValue !== null && item.gpValue !== undefined ? `${item.gpValue} gp` : null];
  if (item.weapon?.damage) details.push(`dmg ${item.weapon.damage}`);
  if (item.armor?.armorType === "armor" && item.armor.baseAcAscending) details.push(`AC ${item.armor.baseAcAscending}`);
  if (item.armor?.armorType === "shield") details.push(`+${item.armor.acBonus ?? 1} AC`);
  if (item.container) details.push(`${item.container.capacitySlots} cap`);
  if (item.container?.coinCapacity !== undefined) details.push(`${item.container.coinCapacity} coins`);
  if (item.emitsLight && item.lightRadiusFeet) details.push(`${item.lightRadiusFeet} ft light`);
  return details.filter(Boolean).join(" · ");
}

function nullableInputValue(value: number | null): string | number {
  return value ?? "";
}

function nullableIntegerFromInput(value: string): number | null {
  if (value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.floor(numberValue)) : null;
}

function positiveIntegerFromInput(value: string, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(fallback, Math.floor(numberValue)) : fallback;
}

function matchesEntitySearch(
  entity: Entity,
  nodes: InventoryNode[],
  catalogs: Catalogs,
  viewMode: ViewMode,
  query: string
) {
  if (!query) return true;
  if (`${entity.name} ${entity.type}`.toLowerCase().includes(query)) return true;
  return nodes.some((node) => nodeMatchesSearch(node, catalogs, viewMode, query));
}

function nodeMatchesSearch(node: InventoryNode, catalogs: Catalogs, viewMode: ViewMode, query: string): boolean {
  const text = `${displayName(node.entry, catalogs, viewMode)} ${node.item.type} ${node.item.description ?? ""}`.toLowerCase();
  return text.includes(query) || node.children.some((child) => nodeMatchesSearch(child, catalogs, viewMode, query));
}

function flattenNodes(nodes: InventoryNode[]): InventoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}

function coinsInPurse(node: InventoryNode, catalogs: Catalogs): CoinBreakdown {
  return node.children.reduce((total, child) => {
    const childCoins = coinBreakdownForEntry(child.entry, catalogs);
    if (!childCoins) return total;
    return normalizeCoins({
      pp: total.pp + childCoins.pp,
      gp: total.gp + childCoins.gp,
      sp: total.sp + childCoins.sp,
      cp: total.cp + childCoins.cp
    });
  }, normalizeCoins(null));
}

function coinBreakdownSummary(coins: CoinBreakdown): string {
  const parts = (["pp", "gp", "sp", "cp"] as Array<keyof CoinBreakdown>)
    .filter((denomination) => coins[denomination] > 0)
    .map((denomination) => `${coins[denomination]} ${denomination}`);
  return parts.length ? parts.join(", ") : "0 coins";
}

function treasureSummary(node: InventoryNode, catalogs: Catalogs): string {
  const value = node.item.gpValue !== null && node.item.gpValue !== undefined ? ` · ${node.item.gpValue} gp` : "";
  return `${itemSlotSummary(node.entry, catalogs)}${value}`;
}

function itemRowName(entry: InventoryEntry, catalogs: Catalogs, viewMode: ViewMode): string {
  const name = displayName(entry, catalogs, viewMode);
  return entry.quantity > 1 ? `${name} (x${entry.quantity})` : name;
}

function itemSlotSummary(entry: InventoryEntry, catalogs: Catalogs): string {
  const slots = entrySlots(entry, catalogs);
  return `${slots} slot${slots === 1 ? "" : "s"}`;
}

function containersForMove(node: InventoryNode, allContainerNodes: InventoryNode[]): InventoryNode[] {
  const blockedIds = new Set([node.entry.id, ...flattenNodes(node.children).map((child) => child.entry.id)]);
  return allContainerNodes.filter((containerNode) => !blockedIds.has(containerNode.entry.id));
}

function rootInventoryTitle(entity: Entity | undefined): string {
  return entity && adventurerTypes.has(entity.type) ? "Equipped" : "Inventory";
}

function rootInventoryEmptyLabel(entity: Entity): string {
  return adventurerTypes.has(entity.type) ? "Nothing equipped" : "No loose inventory";
}

function placementSummary(entry: InventoryEntry, catalogs: Catalogs, viewMode: ViewMode, entities: Entity[], entries: InventoryEntry[]): string {
  const entityName = entities.find((entity) => entity.id === entry.entityId)?.name ?? "Unknown entity";
  const itemLocation: InventoryLocation = isInventoryLocation(entry.location) ? entry.location : { kind: "equipped" };
  if (itemLocation.kind === "contained") {
    const parentEntry = entries.find((candidate) => candidate.id === itemLocation.parentEntryId);
    const parentName = parentEntry ? displayName(parentEntry, catalogs, viewMode) : "container";
    return `${entityName} · inside ${parentName}`;
  }
  if (entry.handSlot) return `${entityName} · ${entry.handSlot.replace("_", " ")}`;
  return `${entityName} · ${rootInventoryTitle(entities.find((entity) => entity.id === entry.entityId))}`;
}

function loadSummary(summary: ReturnType<typeof summarizeEntity> | undefined): string {
  if (!summary) return "0 slots";
  const capacity = summary.capacitySlots !== null && summary.capacitySlots !== undefined ? `/${summary.capacitySlots}` : "";
  return `${summary.carriedSlots}${capacity} slots`;
}

type InventoryDropDestination = {
  entityId: string;
  location: InventoryLocation;
  handSlot: HandSlot | null;
  targetEntryId?: string;
};

type InventorySortOrderPlan = {
  sortOrder: number;
  rebalancedEntries: Array<{ entry: InventoryEntry; sortOrder: number }>;
};

const inventoryCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  const rectangleCollisions = rectIntersection(args);
  return rectangleCollisions.length > 0 ? rectangleCollisions : closestCenter(args);
};

function InventoryDragOverlay({ node, catalogs, viewMode }: { node: InventoryNode; catalogs: Catalogs; viewMode: ViewMode }) {
  return (
    <div className="inventory-drag-overlay">
      <GripVertical size={14} />
      <Box size={15} />
      <div className="inventory-row-name">
        <strong>{displayName(node.entry, catalogs, viewMode)}</strong>
        <span>
          {node.entry.quantity} x {node.item.type} · {entrySlots(node.entry, catalogs)} slots
        </span>
      </div>
    </div>
  );
}

function dragEntryId(entryId: string): string {
  return `entry:${entryId}`;
}

function entryIdFromDragId(id: unknown): string | null {
  const value = String(id);
  return value.startsWith("entry:") ? value.slice("entry:".length) : null;
}

function rootDropId(entityId: string, surface: string): string {
  return `root:${entityId}:${surface}`;
}

function handDropId(entityId: string, slot: HandSlot): string {
  return `hand:${entityId}:${slot}`;
}

function insideDropId(entryId: string): string {
  return `inside:${entryId}`;
}

function rowDropId(entryId: string): string {
  return `row:${entryId}`;
}

function dropDestinationFromId(
  overId: string,
  tree: ReturnType<typeof buildInventoryTree>,
  entries: InventoryEntry[],
  catalogs: Catalogs,
  activeEntryId: string,
  position?: RowDropPosition
): InventoryDropDestination | null {
  const [kind, id, slot] = overId.split(":");
  if (kind === "root" && id) {
    return { entityId: id, location: { kind: "equipped" }, handSlot: null };
  }
  if (kind === "hand" && id && isHandSlot(slot)) {
    return { entityId: id, location: { kind: "equipped" }, handSlot: slot };
  }
  if (kind === "inside" && id) {
    const container = entries.find((entry) => entry.id === id);
    if (!container) return null;
    return { entityId: container.entityId, location: { kind: "contained", parentEntryId: container.id }, handSlot: null };
  }
  if (kind === "row" && id) {
    const targetNode = tree.allNodes.find((node) => node.entry.id === id);
    if (!targetNode) return null;
    const target = targetNode.entry;
    const isContainerTarget =
      targetNode.item.type === "container" && !isCoinPurseEntry(target, catalogs) && target.id !== activeEntryId;
    // Drop inside a container only for the center zone (or legacy drops with no zone).
    if (isContainerTarget && (position === "inside" || position === undefined)) {
      return { entityId: target.entityId, location: { kind: "contained", parentEntryId: target.id }, handSlot: null };
    }
    const location: InventoryLocation = isInventoryLocation(target.location) ? target.location : { kind: "equipped" };
    return {
      entityId: target.entityId,
      location,
      handSlot: location.kind === "equipped" ? target.handSlot ?? null : null,
      targetEntryId: target.id
    };
  }
  return null;
}

function computeRowZone(
  event: DragMoveEvent | DragEndEvent,
  tree: ReturnType<typeof buildInventoryTree>,
  catalogs: Catalogs,
  activeEntryId: string | null
): RowDropIntent | null {
  const over = event.over;
  if (!over) return null;
  const [kind, id] = String(over.id).split(":");
  if (kind !== "row" || !id || id === activeEntryId) return null;
  const targetNode = tree.allNodes.find((node) => node.entry.id === id);
  if (!targetNode) return null;
  const overRect = over.rect;
  if (!overRect || !overRect.height) return null;
  const isContainerTarget = targetNode.item.type === "container" && !isCoinPurseEntry(targetNode.entry, catalogs);

  const activator = event.activatorEvent as { clientY?: number } | null;
  if (activator && typeof activator.clientY === "number") {
    const pointerY = activator.clientY + event.delta.y;
    const ratio = (pointerY - overRect.top) / overRect.height;
    let position: RowDropPosition;
    if (ratio < 0.25) position = "before";
    else if (ratio > 0.75) position = "after";
    else position = isContainerTarget ? "inside" : "swap";
    return { entryId: id, position };
  }
  // Keyboard fallback: compare the dragged element's center to the row center.
  const activeRect = event.active.rect.current.translated;
  const activeCenter = activeRect ? activeRect.top + activeRect.height / 2 : overRect.top;
  const ratio = (activeCenter - overRect.top) / overRect.height;
  return { entryId: id, position: ratio < 0.5 ? "before" : "after" };
}

function canSwapOrder(active: InventoryEntry, target: InventoryEntry): boolean {
  if (active.entityId !== target.entityId) return false;
  const activeLocation: InventoryLocation = isInventoryLocation(active.location) ? active.location : { kind: "equipped" };
  const targetLocation: InventoryLocation = isInventoryLocation(target.location) ? target.location : { kind: "equipped" };
  if (!sameInventoryLocation(activeLocation, targetLocation)) return false;
  return (active.handSlot ?? null) === (target.handSlot ?? null);
}

function inventorySortOrderPlan(
  tree: ReturnType<typeof buildInventoryTree>,
  destination: InventoryDropDestination,
  activeEntryId: string,
  insertPosition: "before" | "after" = "after"
): InventorySortOrderPlan {
  const destinationNodes = nodesForDestination(tree, destination).filter((node) => node.entry.id !== activeEntryId);
  if (!destination.targetEntryId) {
    return { sortOrder: nextTrailingSortOrder(destinationNodes), rebalancedEntries: [] };
  }
  const targetIndex = destinationNodes.findIndex((node) => node.entry.id === destination.targetEntryId);
  if (targetIndex === -1) return { sortOrder: nextTrailingSortOrder(destinationNodes), rebalancedEntries: [] };
  return sortOrderAtIndex(destinationNodes, insertPosition === "before" ? targetIndex : targetIndex + 1);
}

function nodesForDestination(tree: ReturnType<typeof buildInventoryTree>, destination: InventoryDropDestination): InventoryNode[] {
  return flattenNodes(tree.byEntityId[destination.entityId] ?? []).filter((node) => {
    const location: InventoryLocation = isInventoryLocation(node.entry.location) ? node.entry.location : { kind: "equipped" };
    return sameInventoryLocation(location, destination.location) && (node.entry.handSlot ?? null) === destination.handSlot;
  });
}

function sortOrderAtIndex(nodes: InventoryNode[], insertIndex: number): InventorySortOrderPlan {
  const positioned = nodes.map((node, index) => ({
    entry: node.entry,
    sortOrder: normalizedSortOrder(node.entry.sortOrder) ?? (index + 1) * 10
  }));
  const previous = positioned[insertIndex - 1]?.sortOrder;
  const next = positioned[insertIndex]?.sortOrder;
  if (previous === undefined && next === undefined) return { sortOrder: 10, rebalancedEntries: [] };
  if (previous === undefined) return { sortOrder: next - 10, rebalancedEntries: [] };
  if (next === undefined) return { sortOrder: previous + 10, rebalancedEntries: [] };
  if (next - previous > 1) return { sortOrder: previous + (next - previous) / 2, rebalancedEntries: [] };
  return {
    sortOrder: (insertIndex + 1) * 10,
    rebalancedEntries: positioned.map(({ entry }, index) => ({
      entry,
      sortOrder: index < insertIndex ? (index + 1) * 10 : (index + 2) * 10
    }))
  };
}

function nextTrailingSortOrder(nodes: InventoryNode[]): number {
  if (!nodes.length) return 10;
  return nodes.reduce((max, node, index) => Math.max(max, normalizedSortOrder(node.entry.sortOrder) ?? (index + 1) * 10), 0) + 10;
}

function normalizedSortOrder(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function handSlotForDrop(entry: InventoryEntry, requestedSlot: HandSlot | null, catalogs: Catalogs): HandSlot | null {
  if (!requestedSlot) return null;
  const item = entryItem(entry, catalogs);
  return (item.handsRequired ?? 0) >= 2 ? "both_hands" : requestedSlot;
}

function sameInventoryLocation(left: InventoryLocation, right: InventoryLocation): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "equipped") return true;
  return right.kind === "contained" && left.parentEntryId === right.parentEntryId;
}

function isHandSlot(value: string | undefined): value is HandSlot {
  return value === "left_hand" || value === "right_hand" || value === "both_hands";
}
