import { AlertTriangle, Flame, HeartPulse, Shield } from "lucide-react";
import { useMemo } from "react";
import { summarizeEntity } from "../lib/rules";
import { useCampaignStore } from "../store/campaignStore";

export function PartyPage() {
  const entities = useCampaignStore((state) => state.entities);
  const inventoryEntries = useCampaignStore((state) => state.inventoryEntries);
  const catalogs = useCampaignStore((state) => state.catalogs);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const summaries = useMemo(
    () =>
      entities
        .filter((entity) => entity.active)
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
        <div className="summary-table-wrap">
          <table className="summary-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Class</th>
                <th>AC</th>
                <th>HP</th>
                <th>Move</th>
                <th>Load</th>
                <th>Light</th>
                <th>Warnings</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((summary) => (
                <tr key={summary.entity.id}>
                  <td>
                    <strong>{summary.entity.name}</strong>
                    <span>{summary.entity.type}</span>
                  </td>
                  <td>{summary.entity.classId ? `${summary.entity.classId} ${summary.level ?? ""}` : "—"}</td>
                  <td>
                    <Shield size={15} />
                    {summary.armorClass ?? "—"}
                  </td>
                  <td>
                    <HeartPulse size={15} />
                    {summary.entity.hp ? `${summary.entity.hp.currentHp}/${summary.entity.hp.maxHp}` : "—"}
                  </td>
                  <td>{summary.movementExploration}/{summary.movementEncounter}</td>
                  <td>
                    {summary.carriedSlots}
                    {summary.capacitySlots !== null && summary.capacitySlots !== undefined ? `/${summary.capacitySlots}` : ""} · {summary.encumbranceLabel}
                  </td>
                  <td>
                    {summary.activeLights.length ? (
                      summary.activeLights.map((light) => (
                        <span className="light-chip" key={light.entryId}>
                          <Flame size={13} />
                          {light.name} {light.turnsRemaining ?? "∞"}
                        </span>
                      ))
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {summary.warnings.length ? (
                      <span className="warning-chip">
                        <AlertTriangle size={14} />
                        {summary.warnings.length}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="warning-grid">
        {summaries.flatMap((summary) =>
          summary.warnings.map((warning, index) => (
            <article className={`warning-card ${warning.severity}`} key={`${summary.entity.id}-${index}`}>
              <AlertTriangle size={18} />
              <div>
                <strong>{summary.entity.name}</strong>
                <p>{warning.message}</p>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
