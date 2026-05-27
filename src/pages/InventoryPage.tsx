import {
  Backpack,
  Box,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Flame,
  Hand,
  Package,
  Plus,
  Search,
  TimerReset,
  Trash2,
  Undo2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { itemSearchText } from "../lib/catalogs";
import { isInventoryLocation } from "../lib/inventoryIntegrity";
import {
  buildInventoryTree,
  displayName,
  entrySlots,
  isActiveLight,
  summarizeEntity,
  turnsRemaining,
  validateHandAssignment
} from "../lib/rules";
import { useCampaignStore } from "../store/campaignStore";
import type {
  Catalogs,
  Entity,
  HandSlot,
  InventoryActionResult,
  InventoryEntry,
  InventoryLocation,
  InventoryNode,
  ItemType,
  ViewMode
} from "../types";

const itemTypes: Array<ItemType | "all"> = ["all", "weapon", "armor", "gear", "container", "treasure"];
const adventurerTypes = new Set<Entity["type"]>(["character", "retainer"]);

type AddTarget = {
  entityId: string;
  location: InventoryLocation;
  handSlot?: HandSlot | null;
  title: string;
};

export function InventoryPage() {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const entities = useCampaignStore((state) => state.entities);
  const inventoryEntries = useCampaignStore((state) => state.inventoryEntries);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const spendTurn = useCampaignStore((state) => state.spendTurn);
  const updateEntity = useCampaignStore((state) => state.updateEntity);
  const [query, setQuery] = useState("");
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
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
            onAdd={setAddTarget}
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
                      onAdd={setAddTarget}
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

      {addTarget && <AddItemModal target={addTarget} onClose={() => setAddTarget(null)} onResult={handleResult} />}
    </main>
  );
}

function InventoryCard({
  entity,
  nodes,
  summary,
  onAdd,
  onHide,
  onResult
}: {
  entity: Entity;
  nodes: InventoryNode[];
  summary: ReturnType<typeof summarizeEntity>;
  onAdd: (target: AddTarget) => void;
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
      <EntityInventorySections entity={entity} nodes={nodes} onAdd={onAdd} onResult={onResult} />
    </article>
  );
}

function EntityInventorySections({
  entity,
  nodes,
  onAdd,
  onResult
}: {
  entity: Entity;
  nodes: InventoryNode[];
  onAdd: (target: AddTarget) => void;
  onResult: (result: InventoryActionResult) => void;
}) {
  const rootNodes = nodes;
  const equippedNodes = rootNodes.filter((node) => node.item.type !== "container" && !node.entry.handSlot);
  const handNodes = rootNodes.filter((node) => Boolean(node.entry.handSlot));
  const containerNodes = rootNodes.filter((node) => node.item.type === "container");
  const allContainerNodes = flattenNodes(nodes).filter((node) => node.item.type === "container");

  return (
    <div className="inventory-sections">
      <InventorySection
        title="Hands"
        icon={<Hand size={15} />}
        actionLabel="hand"
        onAdd={() =>
          onAdd({
            entityId: entity.id,
            location: { kind: "equipped" },
            handSlot: firstFreeHandSlot(entity.id, nodes),
            title: `Add to ${entity.name}'s hands`
          })
        }
      >
        <HandSlots entityId={entity.id} nodes={handNodes} onAdd={onAdd} />
      </InventorySection>

      <InventorySection
        title="Equipped"
        icon={<Package size={15} />}
        actionLabel="equip"
        onAdd={() =>
          onAdd({
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
          onResult={onResult}
        />
      </InventorySection>

      <InventorySection
        title="Containers"
        icon={<Backpack size={15} />}
        actionLabel="container"
        onAdd={() =>
          onAdd({
            entityId: entity.id,
            location: { kind: "equipped" },
            handSlot: null,
            title: `Add container to ${entity.name}`
          })
        }
      >
        <NodeList
          nodes={containerNodes}
          allContainerNodes={allContainerNodes}
          empty="No containers"
          onAdd={onAdd}
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
  onAdd
}: {
  entityId: string;
  nodes: InventoryNode[];
  onAdd: (target: AddTarget) => void;
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
              <HandItemRow key={node.entry.id} node={node} blockedByBoth />
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
        onAdd={() => onAdd({ entityId, location: { kind: "equipped" }, handSlot: "left_hand", title: "Add to left hand" })}
      />
      <HandSlotBox
        label="Right"
        node={right}
        blockedByBoth={false}
        onAdd={() => onAdd({ entityId, location: { kind: "equipped" }, handSlot: "right_hand", title: "Add to right hand" })}
      />
    </div>
  );
}

function HandSlotBox({
  label,
  node,
  blockedByBoth,
  onAdd
}: {
  label: string;
  node: InventoryNode | undefined;
  blockedByBoth: boolean;
  onAdd: () => void;
}) {
  return (
    <div className={node ? "hand-slot-box occupied" : "hand-slot-box"}>
      <header>
        <span>{label}</span>
        <button className="icon-button" onClick={onAdd} title={`Add to ${label.toLowerCase()}`} disabled={Boolean(node)}>
          <Plus size={13} />
        </button>
      </header>
      {node ? <HandItemRow node={node} blockedByBoth={blockedByBoth} /> : <p className="empty-row">Empty</p>}
    </div>
  );
}

function HandItemRow({ node, blockedByBoth }: { node: InventoryNode; blockedByBoth: boolean }) {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const moveInventoryEntry = useCampaignStore((state) => state.moveInventoryEntry);
  const toggleLight = useCampaignStore((state) => state.toggleLight);
  const deleteEntry = useCampaignStore((state) => state.deleteEntry);
  const remaining = turnsRemaining(node.entry, node.item);

  return (
    <div className="hand-item-row">
      <div>
        <strong>{displayName(node.entry, catalogs, viewMode)}</strong>
        <span>{blockedByBoth ? "both hands" : `${node.entry.quantity} x ${node.item.type}`}</span>
      </div>
      <div>
        {node.item.emitsLight && (
          <button className={node.entry.state?.isLit ? "icon-button lit" : "icon-button"} onClick={() => void toggleLight(node.entry.id)} title="Toggle light">
            <Flame size={13} />
            {remaining === null ? "Lit" : remaining}
          </button>
        )}
        <button
          className="icon-button"
          onClick={() =>
            void moveInventoryEntry({
              entryId: node.entry.id,
              entityId: node.entry.entityId,
              location: { kind: "equipped" },
              handSlot: null
            })
          }
          title="Clear hand"
        >
          <Package size={13} />
        </button>
        <button className="icon-button danger" onClick={() => void deleteEntry(node.entry.id)} title="Delete item">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function NodeList({
  nodes,
  allContainerNodes,
  empty,
  onAdd,
  onResult
}: {
  nodes: InventoryNode[];
  allContainerNodes: InventoryNode[];
  empty: string;
  onAdd: (target: AddTarget) => void;
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
  onResult
}: {
  node: InventoryNode;
  depth: number;
  allContainerNodes: InventoryNode[];
  onAdd: (target: AddTarget) => void;
  onResult: (result: InventoryActionResult) => void;
}) {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const entities = useCampaignStore((state) => state.entities);
  const inventoryEntries = useCampaignStore((state) => state.inventoryEntries);
  const moveInventoryEntry = useCampaignStore((state) => state.moveInventoryEntry);
  const splitEntry = useCampaignStore((state) => state.splitEntry);
  const toggleLight = useCampaignStore((state) => state.toggleLight);
  const deleteEntry = useCampaignStore((state) => state.deleteEntry);
  const [expanded, setExpanded] = useState(true);
  const remaining = turnsRemaining(node.entry, node.item);
  const availableContainers = containersForMove(node, allContainerNodes);
  const currentLocation: InventoryLocation = isInventoryLocation(node.entry.location) ? node.entry.location : { kind: "equipped" };

  const applyMove = async (input: { entityId?: string; location?: InventoryLocation; handSlot?: HandSlot | null }) => {
    const result = await moveInventoryEntry({
      entryId: node.entry.id,
      entityId: input.entityId ?? node.entry.entityId,
      location: input.location ?? node.entry.location,
      handSlot: input.handSlot !== undefined ? input.handSlot : node.entry.handSlot ?? null
    });
    onResult(result);
  };

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
          <strong>{displayName(node.entry, catalogs, viewMode)}</strong>
          <span>
            {node.entry.quantity} x {node.item.type} · {entrySlots(node.entry, catalogs)} slots · {locationLabel(node.entry.location)}
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
          <button className={node.entry.state?.isLit ? "icon-button lit" : "icon-button"} onClick={() => void toggleLight(node.entry.id)} title="Toggle light">
            <Flame size={15} />
            {remaining === null ? "Lit" : remaining}
          </button>
        )}
        {node.entry.quantity > 1 && (
          <button className="tiny-button" onClick={() => void splitEntry(node.entry.id, Math.ceil(node.entry.quantity / 2))}>
            Split
          </button>
        )}
        <select
          value={currentLocation.kind}
          onChange={(event) => {
            if (event.target.value === "equipped") {
              void applyMove({ location: { kind: "equipped" }, handSlot: node.entry.handSlot ?? null });
              return;
            }
            const firstContainer = availableContainers[0];
            if (firstContainer) {
              void applyMove({ location: { kind: "contained", parentEntryId: firstContainer.entry.id }, handSlot: null });
            }
          }}
        >
          <option value="equipped">equipped</option>
          <option value="contained" disabled={!availableContainers.length}>inside</option>
        </select>
        {currentLocation.kind === "contained" && (
          <select
            value={currentLocation.parentEntryId}
            onChange={(event) => void applyMove({ location: { kind: "contained", parentEntryId: event.target.value }, handSlot: null })}
            title="Container"
          >
            {availableContainers.map((containerNode) => (
              <option key={containerNode.entry.id} value={containerNode.entry.id}>
                {displayName(containerNode.entry, catalogs, viewMode)}
              </option>
            ))}
          </select>
        )}
        {currentLocation.kind === "equipped" && (
          <HandSelect
            entityId={node.entry.entityId}
            entries={inventoryEntries}
            ignoreEntryId={node.entry.id}
            value={node.entry.handSlot ?? null}
            catalogs={catalogs}
            viewMode={viewMode}
            onChange={(handSlot) => void applyMove({ handSlot })}
          />
        )}
        {node.item.type === "container" && (
          <button
            className="tiny-button"
            onClick={() =>
              onAdd({
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
        <select
          value={node.entry.entityId}
          onChange={(event) =>
            void applyMove({
              entityId: event.target.value,
              location: { kind: "equipped" },
              handSlot: null
            })
          }
          title="Transfer to entity"
        >
          {entities.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
        <button className="icon-button danger" onClick={() => void deleteEntry(node.entry.id)} title="Delete item">
          <Trash2 size={14} />
        </button>
      </div>
      {expanded &&
        node.children.map((child) => (
          <InventoryNodeRow
            key={child.entry.id}
            node={child}
            depth={depth + 1}
            allContainerNodes={allContainerNodes}
            onAdd={onAdd}
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

function AddItemModal({
  target,
  onClose,
  onResult
}: {
  target: AddTarget;
  onClose: () => void;
  onResult: (result: InventoryActionResult) => void;
}) {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const entities = useCampaignStore((state) => state.entities);
  const inventoryEntries = useCampaignStore((state) => state.inventoryEntries);
  const addCatalogItem = useCampaignStore((state) => state.addCatalogItem);
  const addCustomTreasure = useCampaignStore((state) => state.addCustomTreasure);
  const [mode, setMode] = useState<"catalog" | "treasure">("catalog");
  const [entityId, setEntityId] = useState(target.entityId);
  const [locationKind, setLocationKind] = useState<InventoryLocation["kind"]>(target.location.kind);
  const [parentEntryId, setParentEntryId] = useState(target.location.kind === "contained" ? target.location.parentEntryId : "");
  const [handSlot, setHandSlot] = useState<HandSlot | null>(target.handSlot ?? null);
  const [itemQuery, setItemQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ItemType | "all">("all");
  const [templateId, setTemplateId] = useState(catalogs.items[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [treasureName, setTreasureName] = useState("Coins");
  const [treasureValue, setTreasureValue] = useState(1);
  const [treasureQuantity, setTreasureQuantity] = useState(100);
  const [modalMessage, setModalMessage] = useState<string | null>(null);

  const tree = useMemo(() => buildInventoryTree(inventoryEntries, catalogs), [inventoryEntries, catalogs]);
  const containerNodes = flattenNodes(tree.byEntityId[entityId] ?? []).filter((node) => node.item.type === "container");
  const catalogOptions = catalogs.items.filter((item) => {
    const matchesQuery = itemSearchText(item).includes(itemQuery.toLowerCase());
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    return matchesQuery && matchesType;
  });
  const selectedLocation: InventoryLocation =
    locationKind === "contained" && parentEntryId
      ? { kind: "contained", parentEntryId }
      : { kind: "equipped" };

  useEffect(() => {
    if (!catalogOptions.some((item) => item.id === templateId)) setTemplateId(catalogOptions[0]?.id ?? "");
  }, [catalogOptions, templateId]);

  useEffect(() => {
    if (locationKind === "contained" && !containerNodes.some((node) => node.entry.id === parentEntryId)) {
      setParentEntryId(containerNodes[0]?.entry.id ?? "");
    }
  }, [containerNodes, locationKind, parentEntryId]);

  const addItem = async () => {
    if (!entityId) return;
    if (locationKind === "contained" && !parentEntryId) {
      setModalMessage("Choose a container first.");
      return;
    }
    const normalizedHandSlot = selectedLocation.kind === "equipped" ? handSlot : null;
    const result =
      mode === "catalog"
        ? await addCatalogItem({ entityId, itemTemplateId: templateId, quantity, location: selectedLocation, handSlot: normalizedHandSlot })
        : await addCustomTreasure({
            entityId,
            name: treasureName,
            description: `${treasureName}, ${treasureValue} gp each.`,
            gpValue: treasureValue,
            slotsPerUnit: treasureName.toLowerCase().includes("coin") ? 1 : 0,
            quantity: treasureQuantity,
            location: selectedLocation,
            handSlot: normalizedHandSlot
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
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label={target.title}>
        <header>
          <div>
            <p className="eyebrow">Add Item</p>
            <h2>{target.title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </header>
        {modalMessage && <span className="warning-pill">{modalMessage}</span>}
        <div className="segmented-control">
          <button className={mode === "catalog" ? "toggle active" : "toggle"} onClick={() => setMode("catalog")}>
            Catalog
          </button>
          <button className={mode === "treasure" ? "toggle active" : "toggle"} onClick={() => setMode("treasure")}>
            Treasure
          </button>
        </div>
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
        {mode === "catalog" ? (
          <div className="form-grid">
            <label>
              Search catalog
              <input value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} autoFocus />
            </label>
            <div className="inline-fields">
              <label>
                Type
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as ItemType | "all")}>
                  {itemTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Qty
                <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
              </label>
            </div>
            <label>
              Item
              <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                {catalogOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="form-grid">
            <label>
              Name
              <input value={treasureName} onChange={(event) => setTreasureName(event.target.value)} autoFocus />
            </label>
            <div className="inline-fields">
              <label>
                GP
                <input type="number" min={0} value={treasureValue} onChange={(event) => setTreasureValue(Number(event.target.value))} />
              </label>
              <label>
                Qty
                <input type="number" min={1} value={treasureQuantity} onChange={(event) => setTreasureQuantity(Number(event.target.value))} />
              </label>
            </div>
          </div>
        )}
        <footer>
          <button onClick={onClose}>Cancel</button>
          <button className="primary-action" onClick={() => void addItem()} disabled={mode === "catalog" && !templateId}>
            <Plus size={17} />
            Add
          </button>
        </footer>
      </section>
    </div>
  );
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
