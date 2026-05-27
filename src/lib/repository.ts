import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type Firestore,
  type Unsubscribe
} from "firebase/firestore";
import type { Campaign, Entity, InventoryEntry } from "../types";
import { catalogs } from "./catalogs";
import { getFirebaseServices, signInAnonymouslyIfNeeded } from "./firebase";
import { collectInventoryDescendantIds, isCurrentCampaignSnapshot } from "./inventoryIntegrity";
import { createStarterCampaign, nowIso, type CampaignSnapshot } from "./seed";

export type RepositoryKind = "firestore" | "local";

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

export function createRepository(): CampaignRepository {
  return getFirebaseServices() ? createFirestoreRepository() : createLocalRepository();
}

function createFirestoreRepository(): CampaignRepository {
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase services are not configured.");
  const { db } = services;

  return {
    kind: "firestore",
    async signIn() {
      const user = await signInAnonymouslyIfNeeded();
      return user?.uid ?? "anonymous";
    },
    async ensureCampaign(snapshot) {
      const campaignRef = doc(db, "campaigns", snapshot.campaign.id);
      const existing = await getDoc(campaignRef);
      if (!existing.exists()) {
        await replaceFirestoreSnapshot(db, snapshot);
        return;
      }

      const [entityDocs, inventoryDocs] = await Promise.all([
        getDocs(collection(db, "campaigns", snapshot.campaign.id, "entities")),
        getDocs(collection(db, "campaigns", snapshot.campaign.id, "inventoryEntries"))
      ]);
      const existingSnapshot = {
        campaign: { id: existing.id, ...existing.data() },
        entities: entityDocs.docs.map((document) => ({ id: document.id, ...document.data() })),
        inventoryEntries: inventoryDocs.docs.map((document) => ({ id: document.id, ...document.data() }))
      };
      if (!isCurrentCampaignSnapshot(existingSnapshot, catalogs)) {
        await replaceFirestoreSnapshot(db, snapshot, true);
      }
    },
    subscribeCampaign(campaignId, onChange) {
      let campaign: Campaign | null = null;
      let entities: Entity[] = [];
      let inventoryEntries: InventoryEntry[] = [];

      const emit = () => {
        if (campaign) onChange({ campaign, entities, inventoryEntries });
      };

      const unsubCampaign = onSnapshot(doc(db, "campaigns", campaignId), (snapshot) => {
        campaign = snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Campaign) : null;
        emit();
      });
      const unsubEntities = onSnapshot(collection(db, "campaigns", campaignId, "entities"), (snapshot) => {
        entities = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as Entity);
        emit();
      });
      const unsubInventory = onSnapshot(collection(db, "campaigns", campaignId, "inventoryEntries"), (snapshot) => {
        inventoryEntries = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as InventoryEntry);
        emit();
      });

      return () => {
        unsubCampaign();
        unsubEntities();
        unsubInventory();
      };
    },
    async saveCampaign(campaign) {
      await setDoc(doc(db, "campaigns", campaign.id), { ...campaign, updatedAt: nowIso() });
    },
    async saveEntity(campaignId, entity) {
      await setDoc(
        doc(db, "campaigns", campaignId, "entities", entity.id),
        { ...entity, updatedAt: nowIso() }
      );
    },
    async saveInventoryEntry(campaignId, entry) {
      await setDoc(
        doc(db, "campaigns", campaignId, "inventoryEntries", entry.id),
        { ...entry, updatedAt: nowIso() }
      );
    },
    async saveInventoryEntries(campaignId, entries) {
      const batch = writeBatch(db);
      entries.forEach((entry) => {
        batch.set(
          doc(db, "campaigns", campaignId, "inventoryEntries", entry.id),
          { ...entry, updatedAt: nowIso() }
        );
      });
      await batch.commit();
    },
    async deleteInventoryEntry(campaignId, entryId) {
      await deleteDoc(doc(db, "campaigns", campaignId, "inventoryEntries", entryId));
    }
  };
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

async function replaceFirestoreSnapshot(db: Firestore, snapshot: CampaignSnapshot, clearExisting = false): Promise<void> {
  const batch = writeBatch(db);
  if (clearExisting) {
    const [entityDocs, inventoryDocs] = await Promise.all([
      getDocs(collection(db, "campaigns", snapshot.campaign.id, "entities")),
      getDocs(collection(db, "campaigns", snapshot.campaign.id, "inventoryEntries"))
    ]);
    entityDocs.docs.forEach((document) => batch.delete(document.ref));
    inventoryDocs.docs.forEach((document) => batch.delete(document.ref));
  }

  batch.set(doc(db, "campaigns", snapshot.campaign.id), snapshot.campaign);
  snapshot.entities.forEach((entity) => {
    batch.set(doc(db, "campaigns", snapshot.campaign.id, "entities", entity.id), entity);
  });
  snapshot.inventoryEntries.forEach((entry) => {
    batch.set(doc(db, "campaigns", snapshot.campaign.id, "inventoryEntries", entry.id), entry);
  });
  await batch.commit();
}
