import { Flame, Plus, Search, TimerReset } from "lucide-react";
import { useMemo, useState } from "react";
import { InventoryTree } from "../components/InventoryTree";
import { itemSearchText } from "../lib/catalogs";
import { buildInventoryTree, displayName, entryItem, isActiveLight } from "../lib/rules";
import { useCampaignStore } from "../store/campaignStore";
import type { InventoryLocation, ItemType } from "../types";

const itemTypes: Array<ItemType | "all"> = ["all", "weapon", "armor", "gear", "container", "treasure"];

export function InventoryPage() {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const entities = useCampaignStore((state) => state.entities);
  const inventoryEntries = useCampaignStore((state) => state.inventoryEntries);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const addCatalogItem = useCampaignStore((state) => state.addCatalogItem);
  const addCustomTreasure = useCampaignStore((state) => state.addCustomTreasure);
  const spendTurn = useCampaignStore((state) => state.spendTurn);
  const [selectedEntityId, setSelectedEntityId] = useState(entities[0]?.id ?? "");
  const [itemQuery, setItemQuery] = useState("");
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ItemType | "all">("all");
  const [templateId, setTemplateId] = useState(catalogs.items[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [location, setLocation] = useState<InventoryLocation>("carried_loose");
  const [treasureName, setTreasureName] = useState("Gold coins");
  const [treasureValue, setTreasureValue] = useState(1);
  const [treasureQuantity, setTreasureQuantity] = useState(100);

  const activeEntityId = selectedEntityId || entities[0]?.id || "";
  const tree = useMemo(() => buildInventoryTree(inventoryEntries, catalogs), [inventoryEntries, catalogs]);
  const activeLights = inventoryEntries.filter((entry) => isActiveLight(entry, catalogs));
  const catalogOptions = catalogs.items.filter((item) => {
    const matchesQuery = itemSearchText(item).includes(itemQuery.toLowerCase());
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    return matchesQuery && matchesType;
  });
  const flatInventory = tree.allNodes.filter((node) => {
    const text = `${displayName(node.entry, catalogs, viewMode)} ${node.item.type} ${node.item.description ?? ""}`.toLowerCase();
    return text.includes(inventoryQuery.toLowerCase());
  });

  return (
    <main className="page-grid inventory-layout">
      <section className="panel entity-rail">
        <div className="section-heading">
          <h2>Entities</h2>
        </div>
        <div className="entity-list">
          {entities.map((entity) => (
            <button
              key={entity.id}
              className={activeEntityId === entity.id ? "entity-button active" : "entity-button"}
              onClick={() => setSelectedEntityId(entity.id)}
            >
              <strong>{entity.name}</strong>
              <span>{entity.type}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel inventory-main">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Inventory</p>
            <h2>Party Logistics</h2>
          </div>
          <button className="primary-action" onClick={() => void spendTurn()} title="Spend one turn">
            <TimerReset size={17} />
            Turn
          </button>
        </div>
        <div className="entity-inventory-list">
          {entities.map((entity) => (
            <article className="entity-inventory" key={entity.id}>
              <header>
                <h3>{entity.name}</h3>
                <span>{entity.type}</span>
              </header>
              <InventoryTree entity={entity} nodes={tree.byEntityId[entity.id] ?? []} />
            </article>
          ))}
        </div>
      </section>

      <aside className="panel side-tools">
        <div className="section-heading">
          <h2>Add Item</h2>
        </div>
        <div className="form-grid">
          <label>
            Search catalog
            <input value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} />
          </label>
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
            Item
            <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              {catalogOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Entity
            <select value={activeEntityId} onChange={(event) => setSelectedEntityId(event.target.value)}>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-fields">
            <label>
              Qty
              <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
            </label>
            <label>
              Location
              <select value={location} onChange={(event) => setLocation(event.target.value as InventoryLocation)}>
                <option value="carried_loose">carried</option>
                <option value="equipped">equipped</option>
                <option value="in_hand">in hand</option>
                <option value="stowed">stowed</option>
              </select>
            </label>
          </div>
          <button
            className="primary-action"
            onClick={() => void addCatalogItem({ entityId: activeEntityId, itemTemplateId: templateId, quantity, location })}
            disabled={!activeEntityId || !templateId}
          >
            <Plus size={17} />
            Add
          </button>
        </div>

        <div className="section-divider" />

        <div className="section-heading">
          <h2>Treasure</h2>
        </div>
        <div className="form-grid">
          <label>
            Name
            <input value={treasureName} onChange={(event) => setTreasureName(event.target.value)} />
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
          <button
            onClick={() =>
              void addCustomTreasure({
                entityId: activeEntityId,
                name: treasureName,
                description: `${treasureName}, ${treasureValue} gp each.`,
                gpValue: treasureValue,
                slotsPerUnit: treasureName.toLowerCase().includes("coin") ? 1 : 0,
                quantity: treasureQuantity
              })
            }
            disabled={!activeEntityId}
          >
            <Plus size={17} />
            Add
          </button>
        </div>

        <div className="section-divider" />

        <div className="section-heading">
          <h2>Search</h2>
          <Search size={17} />
        </div>
        <input value={inventoryQuery} onChange={(event) => setInventoryQuery(event.target.value)} />
        <div className="flat-list">
          {flatInventory.slice(0, 24).map((node) => (
            <div key={node.entry.id} className="flat-row">
              <span>{displayName(node.entry, catalogs, viewMode)}</span>
              <small>{entities.find((entity) => entity.id === node.entry.entityId)?.name}</small>
            </div>
          ))}
        </div>
        <div className="active-light-list">
          <h3>
            <Flame size={16} />
            Lights
          </h3>
          {activeLights.map((entry) => {
            const item = entryItem(entry, catalogs);
            return (
              <div className="flat-row" key={entry.id}>
                <span>{displayName(entry, catalogs, viewMode)}</span>
                <small>{item.lightRadiusFeet ?? "?"} ft</small>
              </div>
            );
          })}
        </div>
      </aside>
    </main>
  );
}
