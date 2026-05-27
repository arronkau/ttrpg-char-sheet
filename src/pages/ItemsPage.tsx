import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { itemSearchText } from "../lib/catalogs";
import { useCampaignStore } from "../store/campaignStore";
import type { ItemType } from "../types";

export function ItemsPage() {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const entities = useCampaignStore((state) => state.entities);
  const addCatalogItem = useCampaignStore((state) => state.addCatalogItem);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ItemType | "all">("all");
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");

  const filteredItems = useMemo(
    () =>
      catalogs.items.filter((item) => {
        const matchesQuery = itemSearchText(item).includes(query.toLowerCase());
        const matchesType = type === "all" || item.type === type;
        return matchesQuery && matchesType;
      }),
    [catalogs.items, query, type]
  );

  return (
    <main className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Reference</p>
            <h2>Items</h2>
          </div>
          <Search size={18} />
        </div>
        <div className="toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={type} onChange={(event) => setType(event.target.value as ItemType | "all")}>
            <option value="all">all</option>
            <option value="weapon">weapon</option>
            <option value="armor">armor</option>
            <option value="gear">gear</option>
            <option value="container">container</option>
          </select>
          <select value={entityId} onChange={(event) => setEntityId(event.target.value)}>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </div>
        <div className="reference-grid">
          {filteredItems.map((item) => (
            <article className="reference-card" key={item.id}>
              <header>
                <h3>{item.name}</h3>
                <span>{item.type}</span>
              </header>
              <p>{item.description}</p>
              <footer>
                <span>{item.slotsPerUnit} slots</span>
                <span>{item.gpValue ?? "—"} gp</span>
                <button
                  className="icon-button"
                  onClick={() =>
                    void addCatalogItem({
                      entityId,
                      itemTemplateId: item.id,
                      quantity: item.quantity || 1,
                      location: { kind: "equipped" },
                      handSlot: null
                    })
                  }
                  title="Add item"
                >
                  <Plus size={16} />
                </button>
              </footer>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
