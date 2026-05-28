import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { defaultInventoryQuantity, itemSearchText } from "../lib/catalogs";
import { useCampaignStore } from "../store/campaignStore";
import type { ItemTemplate, ItemType } from "../types";

function formatItemDetails(item: ItemTemplate): string[] {
  const details: string[] = [];

  if (item.weapon) {
    details.push(`Damage ${item.weapon.damage}`);
    if (item.handsRequired) details.push(`${item.handsRequired} hand${item.handsRequired === 1 ? "" : "s"}`);
    if (item.weapon.rangeShort || item.weapon.rangeMedium || item.weapon.rangeLong) {
      details.push(`Range ${[item.weapon.rangeShort, item.weapon.rangeMedium, item.weapon.rangeLong].filter(Boolean).join("/")}`);
    }
    if (item.weapon.qualities?.length) details.push(item.weapon.qualities.join(", "));
  }

  if (item.armor) {
    if (item.armor.baseAcAscending) details.push(`AC ${item.armor.baseAcAscending}`);
    if (item.armor.acBonus) details.push(`AC bonus +${item.armor.acBonus}`);
    details.push(item.armor.armorType);
  }

  if (item.container) {
    details.push(`Capacity ${item.container.capacitySlots} slots`);
    details.push(`Stowed size ${item.container.slotsWhenStowed} slots`);
    if (item.container.loadCategory) details.push(`${item.container.loadCategory} load`);
  }

  if (item.gear?.gearKind) details.push(item.gear.gearKind);
  if (item.gear?.rulesNote) details.push(item.gear.rulesNote);
  if (item.emitsLight) details.push(`Light ${item.lightRadiusFeet ?? "?"}′`);
  if (item.stackSize && item.stackSize > 1) details.push(`${item.stackSize}/slot`);

  return details;
}

function formatSlots(item: ItemTemplate): string {
  if (item.slotsPerUnit === 0) return "0 slots";
  if (item.slotsPerUnit === 1) return "1 slot";
  return `${item.slotsPerUnit} slots`;
}

export function ItemsPage() {
  const items = useCampaignStore((state) => state.catalogs.items);
  const entities = useCampaignStore((state) => state.entities);
  const addCatalogItem = useCampaignStore((state) => state.addCatalogItem);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ItemType | "all">("all");
  const [slotFilter, setSlotFilter] = useState("all");
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const activeEntities = useMemo(() => entities.filter((entity) => entity.active), [entities]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const details = formatItemDetails(item).join(" ").toLowerCase();
        const matchesQuery = `${itemSearchText(item)} ${details} ${item.gpValue ?? ""}`.includes(query.toLowerCase());
        const matchesType = type === "all" || item.type === type;
        const matchesSlots =
          slotFilter === "all" ||
          (slotFilter === "0" && item.slotsPerUnit === 0) ||
          (slotFilter === "1" && item.slotsPerUnit === 1) ||
          (slotFilter === "2plus" && item.slotsPerUnit >= 2) ||
          (slotFilter === "stackable" && Boolean(item.stackSize && item.stackSize > 1));
        return matchesQuery && matchesType && matchesSlots;
      }),
    [items, query, slotFilter, type]
  );

  useEffect(() => {
    if (!activeEntities.some((entity) => entity.id === entityId)) {
      setEntityId(activeEntities[0]?.id ?? "");
    }
  }, [activeEntities, entityId]);

  return (
    <main className="page-stack">
      <section className="panel reference-page">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Reference</p>
            <h2>Items</h2>
            <p className="muted-copy">Catalog descriptions of item properties. These are not inventory entries.</p>
          </div>
          <Search size={18} />
        </div>
        <div className="reference-toolbar reference-toolbar-four">
          <label>
            <span>Search</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="name, property, source…" />
          </label>
          <label>
            <span>Type</span>
            <select value={type} onChange={(event) => setType(event.target.value as ItemType | "all")}>
              <option value="all">All types</option>
              <option value="weapon">Weapons</option>
              <option value="armor">Armor</option>
              <option value="gear">Gear</option>
              <option value="container">Containers</option>
              <option value="treasure">Treasure</option>
            </select>
          </label>
          <label>
            <span>Slots</span>
            <select value={slotFilter} onChange={(event) => setSlotFilter(event.target.value)}>
              <option value="all">All slots</option>
              <option value="0">0 slots</option>
              <option value="1">1 slot</option>
              <option value="2plus">2+ slots</option>
              <option value="stackable">Stackable</option>
            </select>
          </label>
          <label>
            <span>Add to</span>
            <select value={entityId} onChange={(event) => setEntityId(event.target.value)} disabled={!activeEntities.length}>
              {activeEntities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="reference-results-summary">{filteredItems.length} items</div>
        <div className="reference-row-list">
          {filteredItems.map((item) => {
            const details = formatItemDetails(item);
            return (
              <article className="reference-row" key={item.id}>
                <div className="reference-row-main">
                  <header>
                    <h3>{item.name}</h3>
                    <div className="metadata-pills">
                      <span>{item.type}</span>
                      <span>{formatSlots(item)}</span>
                      <span>{item.gpValue != null ? `${item.gpValue} gp` : "gp —"}</span>
                      {item.source ? <span>{item.source}</span> : null}
                    </div>
                  </header>
                  {item.description ? <p>{item.description}</p> : null}
                  {details.length ? (
                    <footer className="metadata-line">
                      {details.map((detail) => (
                        <span key={detail}>{detail}</span>
                      ))}
                    </footer>
                  ) : null}
                </div>
                <button
                  className="icon-button reference-row-action"
                  onClick={() =>
                    void addCatalogItem({
                      entityId,
                      itemTemplateId: item.id,
                      quantity: defaultInventoryQuantity(item),
                      location: { kind: "equipped" },
                      handSlot: null
                    })
                  }
                  disabled={!entityId}
                  title="Add item"
                >
                  <Plus size={16} />
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
