import { ChevronRight, Flame, Package, Trash2 } from "lucide-react";
import type { Entity, InventoryNode } from "../types";
import { useCampaignStore } from "../store/campaignStore";
import { displayName, entrySlots, turnsRemaining } from "../lib/rules";

type InventoryTreeProps = {
  entity: Entity;
  nodes: InventoryNode[];
};

export function InventoryTree({ entity, nodes }: InventoryTreeProps) {
  if (nodes.length === 0) return <p className="empty-row">No inventory</p>;
  return (
    <div className="tree-list">
      {nodes.map((node) => (
        <TreeNode key={node.entry.id} node={node} entity={entity} depth={0} />
      ))}
    </div>
  );
}

function TreeNode({ node, entity, depth }: { node: InventoryNode; entity: Entity; depth: number }) {
  const catalogs = useCampaignStore((state) => state.catalogs);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const entities = useCampaignStore((state) => state.entities);
  const transferEntry = useCampaignStore((state) => state.transferEntry);
  const splitEntry = useCampaignStore((state) => state.splitEntry);
  const toggleLight = useCampaignStore((state) => state.toggleLight);
  const deleteEntry = useCampaignStore((state) => state.deleteEntry);
  const item = node.item;
  const remaining = turnsRemaining(node.entry, item);
  const canSplit = node.entry.quantity > 1;
  const canHold = item.type === "container";

  return (
    <div className="tree-node" style={{ "--depth": depth } as React.CSSProperties}>
      <div className="tree-row">
        <ChevronRight size={14} className={node.children.length ? "chevron visible" : "chevron"} />
        <Package size={16} />
        <div className="tree-name">
          <strong>{displayName(node.entry, catalogs, viewMode)}</strong>
          <span>
            {node.entry.quantity} x {item.type} · {entrySlots(node.entry, catalogs)} slots · {node.entry.location}
          </span>
        </div>
        {canHold && (
          <span className={node.overCapacity ? "capacity over" : "capacity"}>
            {node.usedSlots}/{node.capacitySlots} slots
          </span>
        )}
        {item.emitsLight && (
          <button className={node.entry.state?.isLit ? "icon-button lit" : "icon-button"} onClick={() => void toggleLight(node.entry.id)} title="Toggle light">
            <Flame size={16} />
            {remaining === null ? "Lit" : remaining}
          </button>
        )}
        {canSplit && (
          <button className="small-button" onClick={() => void splitEntry(node.entry.id, Math.ceil(node.entry.quantity / 2))}>
            Split
          </button>
        )}
        <select
          value={node.entry.entityId}
          onChange={(event) => void transferEntry(node.entry.id, event.target.value, null)}
          title="Transfer to entity"
        >
          {entities.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
        <button className="icon-button danger" onClick={() => void deleteEntry(node.entry.id)} title="Delete item">
          <Trash2 size={15} />
        </button>
      </div>
      {node.children.map((child) => (
        <TreeNode key={child.entry.id} node={child} entity={entity} depth={depth + 1} />
      ))}
    </div>
  );
}
