import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Flame, HeartPulse, Shield } from "lucide-react";
import { useMemo, useState } from "react";
import { displayName, entityHandOccupancy, entryItem, isActiveLight, summarizeEntity, turnsRemaining } from "../lib/rules";
import { useCampaignStore } from "../store/campaignStore";
import type { ReactNode } from "react";
import type { Catalogs, EntitySummary, InventoryEntry, ViewMode } from "../types";

export function PartyPage() {
  const { campaignId } = useParams();
  const entities = useCampaignStore((state) => state.entities);
  const inventoryEntries = useCampaignStore((state) => state.inventoryEntries);
  const catalogs = useCampaignStore((state) => state.catalogs);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const summaries = useMemo(
    () =>
      entities
        .filter((entity) => entity.active && entity.type !== "storage")
        .map((entity) => summarizeEntity(entity, inventoryEntries, catalogs, viewMode)),
    [entities, inventoryEntries, catalogs, viewMode]
  );

  return (
    <main className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Party</p>
            <h2>Table Summary</h2>
          </div>
        </div>
        <div className="party-card-grid">
          {summaries.map((summary) => (
            <PartyCard
              key={summary.entity.id}
              campaignId={campaignId || "demo-table"}
              summary={summary}
              inventoryEntries={inventoryEntries}
              catalogs={catalogs}
              viewMode={viewMode}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function PartyCard({
  campaignId,
  summary,
  inventoryEntries,
  catalogs,
  viewMode
}: {
  campaignId: string;
  summary: EntitySummary;
  inventoryEntries: InventoryEntry[];
  catalogs: Catalogs;
  viewMode: ViewMode;
}) {
  const navigate = useNavigate();
  const [warningsOpen, setWarningsOpen] = useState(false);
  const warningPanelId = `warnings-${summary.entity.id}`;
  const classLabel = classLevelLabel(summary, catalogs);
  const languagesLabel = summary.entity.languages?.length ? summary.entity.languages.join(", ") : "No languages";
  const inventoryPath = `/campaign/${campaignId}/inventory`;
  const linksToSheet = ["character", "retainer", "hireling"].includes(summary.entity.type);

  return (
    <article className="party-card">
      <header className="party-card-header">
        <div>
          <div className="party-card-title">
            <h3>
              {linksToSheet ? (
                <Link to={`/campaign/${campaignId}/sheet?entityId=${encodeURIComponent(summary.entity.id)}`}>
                  {summary.entity.name}
                </Link>
              ) : (
                summary.entity.name
              )}
            </h3>
            <span className="entity-type-chip">{titleCase(summary.entity.type)}</span>
          </div>
          <p>{classLabel}</p>
        </div>
        {summary.warnings.length > 0 && (
          <div className="party-warning-wrap">
            <button
              className="warning-chip party-warning-button"
              type="button"
              aria-expanded={warningsOpen}
              aria-controls={warningPanelId}
              onClick={() => setWarningsOpen((open) => !open)}
              title={warningsOpen ? "Hide warnings" : "Show warnings"}
            >
              <AlertTriangle size={14} />
              {summary.warnings.length}
            </button>
            {warningsOpen && (
              <div className="party-warning-panel" id={warningPanelId}>
                {summary.warnings.map((warning, index) => (
                  <div className={`party-warning-detail ${warning.severity}`} key={`${warning.message}-${index}`}>
                    <strong>{titleCase(warning.severity)}</strong>
                    <p>{warning.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      <div className="party-stat-grid">
        <PartyStat label="Move" value={`${summary.movementExploration}/${summary.movementEncounter}`} priority="primary" />
        <PartyStat icon={<Shield size={13} />} label="AC" value={summary.armorClass ?? "—"} />
        <PartyStat icon={<HeartPulse size={13} />} label="HP" value={summary.entity.hp ? `${summary.entity.hp.currentHp}/${summary.entity.hp.maxHp}` : "—"} />
      </div>

      <section className="party-hands">
        <div className="party-hand-grid">
          {handSections(summary.entity.id, inventoryEntries).map((section) => (
            <button
              className={section.entries.length ? "party-hand-slot occupied" : "party-hand-slot"}
              key={section.label}
              type="button"
              onClick={() => navigate(inventoryPath)}
              title="Open inventory"
            >
              <span>{section.label}</span>
              {section.entries.length ? (
                <div className="party-hand-items">
                  {section.entries.map((entry) => (
                    <HandEntryChip entry={entry} catalogs={catalogs} viewMode={viewMode} key={`${section.label}-${entry.id}`} />
                  ))}
                </div>
              ) : (
                <p>Empty</p>
              )}
            </button>
          ))}
        </div>
      </section>

      <div className="party-languages">
        <span>Languages</span>
        <strong>{languagesLabel}</strong>
      </div>
    </article>
  );
}

function PartyStat({
  icon,
  label,
  value,
  detail,
  priority = "normal"
}: {
  icon?: ReactNode;
  label: string;
  value: string | number;
  detail?: string;
  priority?: "normal" | "primary";
}) {
  return (
    <div className={priority === "primary" ? "party-stat primary" : "party-stat"}>
      <span>
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function HandEntryChip({ entry, catalogs, viewMode }: { entry: InventoryEntry; catalogs: Catalogs; viewMode: ViewMode }) {
  const item = entryItem(entry, catalogs);
  const remaining = turnsRemaining(entry, item);
  const activeLight = isActiveLight(entry, catalogs);
  const lightParts = [
    remaining === null ? "lit" : `${remaining} ${remaining === 1 ? "turn" : "turns"}`,
    item.lightRadiusFeet ? `${item.lightRadiusFeet} ft` : null
  ].filter(Boolean);

  return (
    <span className={activeLight ? "party-hand-chip lit" : "party-hand-chip"}>
      {activeLight && <Flame size={13} />}
      <span>{displayName(entry, catalogs, viewMode)}</span>
      {activeLight && lightParts.length > 0 && <small>{lightParts.join(" · ")}</small>}
    </span>
  );
}

function handSections(entityId: string, entries: InventoryEntry[]) {
  const entityEntries = entries.filter((entry) => entry.entityId === entityId);
  const bothHands = entityEntries.filter((entry) => entry.handSlot === "both_hands");
  if (bothHands.length > 0) return [{ label: "Both hands", entries: bothHands }];

  const hands = entityHandOccupancy(entityId, entries);
  return [
    { label: "Left hand", entries: hands.left_hand },
    { label: "Right hand", entries: hands.right_hand }
  ];
}

function classLevelLabel(summary: EntitySummary, catalogs: Catalogs): string {
  if (!summary.entity.classId) return "No class";
  const className = catalogs.classesById[summary.entity.classId]?.class_name ?? titleCase(summary.entity.classId.replace(/[-_]/g, " "));
  return summary.level ? `${className.replace(/-/g, " ")} ${summary.level}` : className.replace(/-/g, " ");
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
