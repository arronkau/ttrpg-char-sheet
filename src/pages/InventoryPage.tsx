import {
  Backpack,
  Box,
  ChevronDown,
  ChevronRight,
  Coins,
  EyeOff,
  Flame,
  Gem,
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
import { useEffect, useMemo, useState } from "react";
import { defaultInventoryQuantity, itemSearchText } from "../lib/catalogs";
import { isInventoryLocation } from "../lib/inventoryIntegrity";
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

const BELT_POUCH_ITEM_ID = "item_belt_pouch_005";
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

export function InventoryPage() {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const entities = useCampaignStore((state) => state.entities);
  const inventoryEntries = useCampaignStore((state) => state.inventoryEntries);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const spendTurn = useCampaignStore((state) => state.spendTurn);
  const updateEntity = useCampaignStore((state) => state.updateEntity);
  const [query, setQuery] = useState("");
  const [itemModalTarget, setItemModalTarget] = useState<ItemModalTarget | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [expandedOtherIds, setExpandedOtherIds] = useState<string[]>([]);

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

  return (
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
            onHide={() => void updateEntity({ ...entity, active: false })}
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
                    <span className="capacity">{summaries[entity.id]?.carriedSlots ?? 0} slots</span>
                    <button className="icon-button" onClick={() => void updateEntity({ ...entity, active: false })} title="Hide">
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
                <button className="small-button" onClick={() => void updateEntity({ ...entity, active: true })}>
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
        <span>Total {summary.carriedSlots}</span>
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
  const addCatalogItem = useCampaignStore((state) => state.addCatalogItem);
  const rootNodes = nodes;
  const equippedNodes = rootNodes.filter((node) => node.item.type !== "container" && !node.entry.handSlot);
  const handNodes = rootNodes.filter((node) => Boolean(node.entry.handSlot));
  const coinPurseNodes = rootNodes.filter((node) => isCoinPurseEntry(node.entry, catalogs));
  const containerNodes = rootNodes.filter((node) => node.item.type === "container" && !isCoinPurseEntry(node.entry, catalogs));
  const allContainerNodes = flattenNodes(nodes).filter((node) => node.item.type === "container");
  const addCoinPouch = async () => {
    const result = await addCatalogItem({
      entityId: entity.id,
      itemTemplateId: BELT_POUCH_ITEM_ID,
      quantity: 1,
      location: { kind: "equipped" },
      handSlot: null
    });
    onResult(result);
  };

  return (
    <div className="inventory-sections">
      <InventorySection
        title="Hands"
        icon={<Hand size={15} />}
        actionLabel="hand"
        onAdd={() =>
          onAdd({
            mode: "add",
            entityId: entity.id,
            location: { kind: "equipped" },
            handSlot: firstFreeHandSlot(entity.id, nodes),
            title: `Add to ${entity.name}'s hands`
          })
        }
      >
        <HandSlots entityId={entity.id} nodes={handNodes} onAdd={onAdd} onEdit={onEdit} />
      </InventorySection>

      <InventorySection
        title="Coin Purse"
        icon={<Coins size={15} />}
        actionLabel={coinPurseNodes.length ? undefined : "pouch"}
        onAdd={coinPurseNodes.length ? undefined : () => void addCoinPouch()}
      >
        <CoinPurseList entity={entity} purseNodes={coinPurseNodes} onAdd={onAdd} onEdit={onEdit} onResult={onResult} />
      </InventorySection>

      <InventorySection
        title="Equipped"
        icon={<Package size={15} />}
        actionLabel="equip"
        onAdd={() =>
          onAdd({
            mode: "add",
            entityId: entity.id,
            location: { kind: "equipped" },
            handSlot: null,
            title: `Add equipped item to ${entity.name}`
          })
        }
      >
        <NodeList
          nodes={equippedNodes}
          allContainerNodes={allContainerNodes}
          empty="Nothing equipped"
          onAdd={onAdd}
          onEdit={onEdit}
          onResult={onResult}
        />
      </InventorySection>

      <InventorySection
        title="Containers"
        icon={<Backpack size={15} />}
        actionLabel="container"
        onAdd={() =>
          onAdd({
            mode: "add",
            entityId: entity.id,
            location: { kind: "equipped" },
            handSlot: null,
            preferredType: "container",
            title: `Add container to ${entity.name}`
          })
        }
      >
        <NodeList
          nodes={containerNodes}
          allContainerNodes={allContainerNodes}
          empty="No containers"
          onAdd={onAdd}
          onEdit={onEdit}
          onResult={onResult}
        />
      </InventorySection>
    </div>
  );
}

function InventorySection({
  title,
  icon,
  actionLabel,
  onAdd,
  children
}: {
  title: string;
  icon: React.ReactNode;
  actionLabel?: string;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="inventory-section">
      <header>
        <span>
          {icon}
          {title}
        </span>
        {onAdd && (
          <button className="tiny-button" onClick={onAdd}>
            <Plus size={13} />
            {actionLabel}
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

function HandSlots({
  entityId,
  nodes,
  onAdd,
  onEdit
}: {
  entityId: string;
  nodes: InventoryNode[];
  onAdd: (target: AddTarget) => void;
  onEdit: (target: EditTarget) => void;
}) {
  const bothHands = nodes.filter((node) => node.entry.handSlot === "both_hands");
  const left = nodes.find((node) => node.entry.handSlot === "left_hand");
  const right = nodes.find((node) => node.entry.handSlot === "right_hand");

  if (bothHands.length) {
    return (
      <div className="hand-slot-grid two-hands">
        <div className="hand-slot-box occupied both-hands-occupied">
          <header>
            <span>Both hands</span>
            <button className="icon-button" title="Both hands occupied" disabled>
              <Plus size={13} />
            </button>
          </header>
          <div className="hand-item-list">
            {bothHands.map((node) => (
              <HandItemRow key={node.entry.id} node={node} blockedByBoth onEdit={onEdit} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hand-slot-grid two-hands">
      <HandSlotBox
        label="Left"
        node={left}
        blockedByBoth={false}
        onAdd={() => onAdd({ mode: "add", entityId, location: { kind: "equipped" }, handSlot: "left_hand", title: "Add to left hand" })}
        onEdit={onEdit}
      />
      <HandSlotBox
        label="Right"
        node={right}
        blockedByBoth={false}
        onAdd={() => onAdd({ mode: "add", entityId, location: { kind: "equipped" }, handSlot: "right_hand", title: "Add to right hand" })}
        onEdit={onEdit}
      />
    </div>
  );
}

function HandSlotBox({
  label,
  node,
  blockedByBoth,
  onAdd,
  onEdit
}: {
  label: string;
  node: InventoryNode | undefined;
  blockedByBoth: boolean;
  onAdd: () => void;
  onEdit: (target: EditTarget) => void;
}) {
  return (
    <div className={node ? "hand-slot-box occupied" : "hand-slot-box"}>
      <header>
        <span>{label}</span>
        <button className="icon-button" onClick={onAdd} title={`Add to ${label.toLowerCase()}`} disabled={Boolean(node)}>
          <Plus size={13} />
        </button>
      </header>
      {node ? <HandItemRow node={node} blockedByBoth={blockedByBoth} onEdit={onEdit} /> : <p className="empty-row">Empty</p>}
    </div>
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

  return (
    <div className="hand-item-row">
      <div>
        <button className="item-name-button" onClick={() => onEdit({ mode: "edit", entry: node.entry, title: `Edit ${displayName(node.entry, catalogs, viewMode)}` })}>
          {displayName(node.entry, catalogs, viewMode)}
        </button>
        <span>{blockedByBoth ? "both hands" : `${node.entry.quantity} x ${node.item.type}`}</span>
      </div>
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
  onAdd,
  onEdit,
  onResult
}: {
  entity: Entity;
  purseNodes: InventoryNode[];
  onAdd: (target: AddTarget) => void;
  onEdit: (target: EditTarget) => void;
  onResult: (result: InventoryActionResult) => void;
}) {
  if (!purseNodes.length) return <p className="empty-row">No coin purse</p>;
  return (
    <div className="coin-purse-list">
      {purseNodes.map((node) => (
        <CoinPurseCard key={node.entry.id} entity={entity} node={node} onAdd={onAdd} onEdit={onEdit} onResult={onResult} />
      ))}
    </div>
  );
}

function CoinPurseCard({
  entity,
  node,
  onAdd,
  onEdit,
  onResult
}: {
  entity: Entity;
  node: InventoryNode;
  onAdd: (target: AddTarget) => void;
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
    <article className="coin-purse-card">
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
              type="number"
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
        <button
          className="tiny-button"
          onClick={() =>
            onAdd({
              mode: "add",
              entityId: entity.id,
              location: { kind: "contained", parentEntryId: node.entry.id },
              handSlot: null,
              preferredType: "treasure",
              title: `Add small treasure to ${displayName(node.entry, catalogs, viewMode)}`
            })
          }
        >
          <Plus size={13} />
          treasure
        </button>
      </div>
      <div className="coin-treasure-list">
        {treasureNodes.length ? (
          treasureNodes.map((treasureNode) => (
            <div className="coin-treasure-row" key={treasureNode.entry.id}>
              <Gem size={14} />
              <div>
                <button
                  className="item-name-button"
                  onClick={() =>
                    onEdit({
                      mode: "edit",
                      entry: treasureNode.entry,
                      title: `Edit ${displayName(treasureNode.entry, catalogs, viewMode)}`
                    })
                  }
                >
                  {displayName(treasureNode.entry, catalogs, viewMode)}
                </button>
                <span>{treasureSummary(treasureNode)}</span>
              </div>
            </div>
          ))
        ) : (
          <p className="empty-row">No small treasure</p>
        )}
      </div>
    </article>
  );
}

function NodeList({
  nodes,
  allContainerNodes,
  empty,
  onAdd,
  onEdit,
  onResult
}: {
  nodes: InventoryNode[];
  allContainerNodes: InventoryNode[];
  empty: string;
  onAdd: (target: AddTarget) => void;
  onEdit: (target: EditTarget) => void;
  onResult: (result: InventoryActionResult) => void;
}) {
  if (!nodes.length) return <p className="empty-row">{empty}</p>;
  return (
    <div className="inventory-node-list">
      {nodes.map((node) => (
        <InventoryNodeRow
          key={node.entry.id}
          node={node}
          depth={0}
          allContainerNodes={allContainerNodes}
          onAdd={onAdd}
          onEdit={onEdit}
          onResult={onResult}
        />
      ))}
    </div>
  );
}

function InventoryNodeRow({
  node,
  depth,
  allContainerNodes,
  onAdd,
  onEdit,
  onResult
}: {
  node: InventoryNode;
  depth: number;
  allContainerNodes: InventoryNode[];
  onAdd: (target: AddTarget) => void;
  onEdit: (target: EditTarget) => void;
  onResult: (result: InventoryActionResult) => void;
}) {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const splitEntry = useCampaignStore((state) => state.splitEntry);
  const toggleLight = useCampaignStore((state) => state.toggleLight);
  const [expanded, setExpanded] = useState(true);
  const remaining = turnsRemaining(node.entry, node.item);
  const isDepleted = node.entry.state?.isDepleted === true;
  const currentLocation: InventoryLocation = isInventoryLocation(node.entry.location) ? node.entry.location : { kind: "equipped" };
  const coins = coinBreakdownForEntry(node.entry, catalogs);

  return (
    <div className="inventory-node" style={{ "--depth": depth } as React.CSSProperties}>
      <div className="inventory-row">
        <button
          className={node.children.length ? "icon-button" : "icon-button muted"}
          onClick={() => setExpanded((value) => !value)}
          disabled={!node.children.length}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <Box size={15} />
        <div className="inventory-row-name">
          <button className="item-name-button" onClick={() => onEdit({ mode: "edit", entry: node.entry, title: `Edit ${displayName(node.entry, catalogs, viewMode)}` })}>
            {displayName(node.entry, catalogs, viewMode)}
          </button>
          <span>
            {coins ? coinBreakdownSummary(coins) : `${node.entry.quantity} x ${node.item.type}`} · {entrySlots(node.entry, catalogs)} slots · {locationLabel(currentLocation)}
            {node.entry.handSlot ? ` · ${node.entry.handSlot.replace("_", " ")}` : ""}
          </span>
        </div>
        {node.item.type === "container" && (
          <span className={node.overCapacity ? "capacity over" : "capacity"}>
            {node.usedSlots}/{node.capacitySlots} · {node.item.container?.loadCategory ?? "stowed"}
          </span>
        )}
      </div>
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
        {node.item.type === "container" && (
          <button
            className="tiny-button"
            onClick={() =>
              onAdd({
                mode: "add",
                entityId: node.entry.entityId,
                location: { kind: "contained", parentEntryId: node.entry.id },
                handSlot: null,
                title: `Add inside ${displayName(node.entry, catalogs, viewMode)}`
              })
            }
          >
            <Plus size={13} />
            item
          </button>
        )}
      </div>
      {expanded &&
        node.children.map((child) => (
          <InventoryNodeRow
            key={child.entry.id}
            node={child}
            depth={depth + 1}
            allContainerNodes={allContainerNodes}
            onAdd={onAdd}
            onEdit={onEdit}
            onResult={onResult}
          />
        ))}
    </div>
  );
}

function HandSelect({
  entityId,
  entries,
  ignoreEntryId,
  value,
  catalogs,
  viewMode,
  onChange
}: {
  entityId: string;
  entries: InventoryEntry[];
  ignoreEntryId?: string;
  value: HandSlot | null;
  catalogs: Catalogs;
  viewMode: ViewMode;
  onChange: (handSlot: HandSlot | null) => void;
}) {
  return (
    <select value={value ?? "none"} onChange={(event) => onChange(event.target.value === "none" ? null : (event.target.value as HandSlot))} title="Hand use">
      <option value="none">no hand</option>
      {(["left_hand", "right_hand", "both_hands"] as HandSlot[]).map((slot) => {
        const validation = validateHandAssignment(entityId, entries, slot, ignoreEntryId);
        const blockers = validation.ok ? "" : ` (${validation.blockers.map((entry) => displayName(entry, catalogs, viewMode)).join(", ")})`;
        return (
          <option key={slot} value={slot} disabled={!validation.ok && value !== slot}>
            {slot.replace("_", " ")}{blockers}
          </option>
        );
      })}
    </select>
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
  const deleteEntry = useCampaignStore((state) => state.deleteEntry);
  const editingEntry = target.mode === "edit" ? target.entry : null;
  const isEditing = Boolean(editingEntry);
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
  const [name, setName] = useState(startingItem.name === "Custom item" ? "" : startingItem.name);
  const [type, setType] = useState<ItemType>(startingItem.type);
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
  const editNode = editingEntry ? tree.allNodes.find((node) => node.entry.id === editingEntry.id) : undefined;
  const allContainerNodes = flattenNodes(tree.byEntityId[entityId] ?? []).filter((node) => node.item.type === "container");
  const containerNodes = editingEntry && editNode ? containersForMove(editNode, allContainerNodes) : allContainerNodes;
  const itemSuggestions = useMemo(() => rankItemSuggestions(catalogs.items, name).slice(0, 6), [catalogs.items, name]);
  const showSuggestions = suggestionsOpen && name.trim().length >= 2 && itemSuggestions.length > 0;
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

  const saveItem = async () => {
    if (!entityId) return;
    if (!name.trim()) {
      setModalMessage("Name the item first.");
      return;
    }
    if (locationKind === "contained" && !parentEntryId) {
      setModalMessage("Choose a container first.");
      return;
    }
    const item = buildItemTemplate({
      id: itemId,
      name,
      type,
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
    const normalizedHandSlot = selectedLocation.kind === "equipped" ? handSlot : null;
    const result = editingEntry
      ? await updateInventoryItem({
          entryId: editingEntry.id,
          entityId,
          item,
          quantity,
          location: selectedLocation,
          handSlot: normalizedHandSlot
        })
      : await addCustomItem({ entityId, item, quantity, location: selectedLocation, handSlot: normalizedHandSlot });
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
          <div className="form-grid">
            <label>
              Entity
              <select value={entityId} onChange={(event) => setEntityId(event.target.value)}>
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="inline-fields">
              <label>
                Location
                <select
                  value={locationKind}
                  onChange={(event) => {
                    const nextKind = event.target.value as InventoryLocation["kind"];
                    setLocationKind(nextKind);
                    if (nextKind === "contained") setHandSlot(null);
                  }}
                >
                  <option value="equipped">equipped</option>
                  <option value="contained" disabled={!containerNodes.length}>inside container</option>
                </select>
              </label>
              {locationKind === "equipped" ? (
                <label>
                  Hand
                  <HandSelect
                    entityId={entityId}
                    entries={inventoryEntries}
                    value={handSlot}
                    catalogs={catalogs}
                    viewMode="gm"
                    onChange={setHandSlot}
                  />
                </label>
              ) : (
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
            </div>
          </div>
        )}
        <div className="form-grid">
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
          <div className="inline-fields">
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
            <label>
              Qty
              <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(positiveIntegerFromInput(event.target.value, 1))} />
            </label>
          </div>
          <div className="inline-fields three-fields">
            <label>
              Slots
              <input type="number" min={0} value={slotsPerUnit} onChange={(event) => setSlotsPerUnit(positiveIntegerFromInput(event.target.value, 0))} />
            </label>
            <label>
              Stack
              <input type="number" min={1} value={nullableInputValue(stackSize)} onChange={(event) => setStackSize(nullableIntegerFromInput(event.target.value))} />
            </label>
            <label>
              GP
              <input type="number" min={0} value={nullableInputValue(gpValue)} onChange={(event) => setGpValue(nullableIntegerFromInput(event.target.value))} />
            </label>
          </div>
          <label>
            Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label>
            Hands required
            <input type="number" min={0} value={nullableInputValue(handsRequired)} onChange={(event) => setHandsRequired(nullableIntegerFromInput(event.target.value))} />
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
                <input type="number" min={0} value={nullableInputValue(weaponRangeShort)} onChange={(event) => setWeaponRangeShort(nullableIntegerFromInput(event.target.value))} />
              </label>
              <label>
                Medium
                <input type="number" min={0} value={nullableInputValue(weaponRangeMedium)} onChange={(event) => setWeaponRangeMedium(nullableIntegerFromInput(event.target.value))} />
              </label>
              <label>
                Long
                <input type="number" min={0} value={nullableInputValue(weaponRangeLong)} onChange={(event) => setWeaponRangeLong(nullableIntegerFromInput(event.target.value))} />
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
                <input type="number" min={0} value={nullableInputValue(baseAcAscending)} onChange={(event) => setBaseAcAscending(nullableIntegerFromInput(event.target.value))} />
              </label>
              <label>
                AC bonus
                <input type="number" min={0} value={nullableInputValue(acBonus)} onChange={(event) => setAcBonus(nullableIntegerFromInput(event.target.value))} />
              </label>
            </div>
          </div>
        )}
        {type === "container" && (
          <div className="form-grid type-fields">
            <div className="inline-fields three-fields">
              <label>
                Capacity
                <input type="number" min={0} value={containerCapacity} onChange={(event) => setContainerCapacity(positiveIntegerFromInput(event.target.value, 0))} />
              </label>
              <label>
                Stowed slots
                <input type="number" min={0} value={slotsWhenStowed} onChange={(event) => setSlotsWhenStowed(positiveIntegerFromInput(event.target.value, 0))} />
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
                <input type="number" min={0} value={nullableInputValue(coinCapacity)} onChange={(event) => setCoinCapacity(nullableIntegerFromInput(event.target.value))} />
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
              <label>
                Radius
                <input type="number" min={0} value={nullableInputValue(lightRadiusFeet)} onChange={(event) => setLightRadiusFeet(nullableIntegerFromInput(event.target.value))} />
              </label>
              <label>
                Turns
                <input type="number" min={0} value={nullableInputValue(durationTurnsMax)} onChange={(event) => setDurationTurnsMax(nullableIntegerFromInput(event.target.value))} />
              </label>
              <label>
                Uses
                <input type="number" min={0} value={nullableInputValue(usesMax)} onChange={(event) => setUsesMax(nullableIntegerFromInput(event.target.value))} />
              </label>
            </div>
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
    type: fields.type,
    identified: true,
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
    gpValue: fields.gpValue
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

function treasureSummary(node: InventoryNode): string {
  const value = node.item.gpValue !== null && node.item.gpValue !== undefined ? ` · ${node.item.gpValue} gp` : "";
  return `${node.entry.quantity} x treasure${value}`;
}

function containersForMove(node: InventoryNode, allContainerNodes: InventoryNode[]): InventoryNode[] {
  const blockedIds = new Set([node.entry.id, ...flattenNodes(node.children).map((child) => child.entry.id)]);
  return allContainerNodes.filter((containerNode) => !blockedIds.has(containerNode.entry.id));
}

function firstFreeHandSlot(entityId: string, nodes: InventoryNode[]): HandSlot | null {
  const entries = flattenNodes(nodes).map((node) => node.entry);
  if (validateHandAssignment(entityId, entries, "right_hand").ok) return "right_hand";
  if (validateHandAssignment(entityId, entries, "left_hand").ok) return "left_hand";
  return null;
}

function locationLabel(location: InventoryLocation): string {
  return isInventoryLocation(location) && location.kind === "contained" ? "inside" : "equipped";
}
