import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type Firestore
} from "firebase/firestore";
import type { Campaign, Catalogs, Entity, InventoryEntry } from "../types";
import { getFirebaseServices, signInAnonymouslyIfNeeded } from "./firebase";
import { isCurrentCampaignSnapshot } from "./inventoryIntegrity";
import { nowIso, type CampaignSnapshot } from "./seed";
import type { CampaignRepository } from "./repository";

export function createFirestoreRepository(catalogs: Catalogs): CampaignRepository {
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
      await setDoc(doc(db, "campaigns", campaignId, "entities", entity.id), { ...entity, updatedAt: nowIso() });
    },
    async saveInventoryEntry(campaignId, entry) {
      await setDoc(doc(db, "campaigns", campaignId, "inventoryEntries", entry.id), { ...entry, updatedAt: nowIso() });
    },
    async saveInventoryEntries(campaignId, entries) {
      const batch = writeBatch(db);
      entries.forEach((entry) => {
        batch.set(doc(db, "campaigns", campaignId, "inventoryEntries", entry.id), { ...entry, updatedAt: nowIso() });
      });
      await batch.commit();
    },
    async deleteInventoryEntry(campaignId, entryId) {
      await deleteDoc(doc(db, "campaigns", campaignId, "inventoryEntries", entryId));
    }
  };
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
