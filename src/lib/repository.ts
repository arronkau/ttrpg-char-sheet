import type { Campaign, Entity, InventoryEntry } from "../types";
import { catalogs } from "./catalogs";
import { firebaseConfigPresent } from "./firebaseConfig";
import { collectInventoryDescendantIds, isCurrentCampaignSnapshot } from "./inventoryIntegrity";
import { createStarterCampaign, nowIso, type CampaignSnapshot } from "./seed";

export type RepositoryKind = "firestore" | "local";
export type Unsubscribe = () => void;

export type CampaignRepository = {
  kind: RepositoryKind;
  signIn: () => Promise<string>;
  ensureCampaign: (snapshot: CampaignSnapshot) => Promise<void>;
  subscribeCampaign: (campaignId: string, onChange: (snapshot: CampaignSnapshot) => void) => Unsubscribe;
  saveCampaign: (campaign: Campaign) => Promise<void>;
  saveEntity: (campaignId: string, entity: Entity) => Promise<void>;
  saveInventoryEntry: (campaignId: string, entry: InventoryEntry) => Promise<void>;
  saveInventoryEntries: (campaignId: string, entries: InventoryEntry[]) => Promise<void>;
  deleteInventoryEntry: (campaignId: string, entryId: string) => Promise<void>;
};

export async function createRepository(): Promise<CampaignRepository> {
  if (!firebaseConfigPresent()) return createLocalRepository();
  const { createFirestoreRepository } = await import("./repository.firestore");
  return createFirestoreRepository(catalogs);
}

function createLocalRepository(): CampaignRepository {
  const listeners = new Map<string, Set<(snapshot: CampaignSnapshot) => void>>();

  const read = (campaignId: string): CampaignSnapshot => {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(storageKey(campaignId));
    if (!raw) return createStarterCampaign(campaignId);
    try {
      const snapshot = JSON.parse(raw) as unknown;
      return isCurrentCampaignSnapshot(snapshot, catalogs) ? snapshot : createStarterCampaign(campaignId);
    } catch {
      return createStarterCampaign(campaignId);
    }
  };

  const write = (snapshot: CampaignSnapshot) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(storageKey(snapshot.campaign.id), JSON.stringify(snapshot));
    }
    listeners.get(snapshot.campaign.id)?.forEach((listener) => listener(snapshot));
  };

  return {
    kind: "local",
    async signIn() {
      return "local-anonymous";
    },
    async ensureCampaign(snapshot) {
      if (typeof localStorage === "undefined") return;
      const existing = localStorage.getItem(storageKey(snapshot.campaign.id));
      if (!existing) {
        write(snapshot);
        return;
      }
      let existingSnapshot: unknown;
      try {
        existingSnapshot = JSON.parse(existing);
      } catch {
        write(snapshot);
        return;
      }
      if (!isCurrentCampaignSnapshot(existingSnapshot, catalogs)) {
        write(snapshot);
      }
    },
    subscribeCampaign(campaignId, onChange) {
      const set = listeners.get(campaignId) ?? new Set<(snapshot: CampaignSnapshot) => void>();
      set.add(onChange);
      listeners.set(campaignId, set);
      onChange(read(campaignId));

      const storageHandler = (event: StorageEvent) => {
        if (event.key === storageKey(campaignId)) onChange(read(campaignId));
      };
      window.addEventListener("storage", storageHandler);

      return () => {
        set.delete(onChange);
        window.removeEventListener("storage", storageHandler);
      };
    },
    async saveCampaign(campaign) {
      const snapshot = read(campaign.id);
      write({ ...snapshot, campaign: { ...campaign, updatedAt: nowIso() } });
    },
    async saveEntity(campaignId, entity) {
      const snapshot = read(campaignId);
      write({
        ...snapshot,
        campaign: { ...snapshot.campaign, updatedAt: nowIso() },
        entities: upsertById(snapshot.entities, { ...entity, updatedAt: nowIso() })
      });
    },
    async saveInventoryEntry(campaignId, entry) {
      const snapshot = read(campaignId);
      write({
        ...snapshot,
        campaign: { ...snapshot.campaign, updatedAt: nowIso() },
        inventoryEntries: upsertById(snapshot.inventoryEntries, { ...entry, updatedAt: nowIso() })
      });
    },
    async saveInventoryEntries(campaignId, entries) {
      const snapshot = read(campaignId);
      write({
        ...snapshot,
        campaign: { ...snapshot.campaign, updatedAt: nowIso() },
        inventoryEntries: entries.reduce(
          (nextEntries, entry) => upsertById(nextEntries, { ...entry, updatedAt: nowIso() }),
          snapshot.inventoryEntries
        )
      });
    },
    async deleteInventoryEntry(campaignId, entryId) {
      const snapshot = read(campaignId);
      const idsToDelete = collectInventoryDescendantIds(entryId, snapshot.inventoryEntries);
      write({
        ...snapshot,
        campaign: { ...snapshot.campaign, updatedAt: nowIso() },
        inventoryEntries: snapshot.inventoryEntries.filter((entry) => !idsToDelete.has(entry.id))
      });
    }
  };
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) return [...items, item];
  return items.map((candidate) => (candidate.id === item.id ? item : candidate));
}

function storageKey(campaignId: string): string {
  return `ttrpg-character-tracker:${campaignId}`;
}
