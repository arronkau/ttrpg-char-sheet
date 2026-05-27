import { describe, expect, it } from "vitest";
import { createRepository } from "./repository";
import { createStarterCampaign } from "./seed";

const runFirestoreSmoke = Boolean(
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.RUN_FIRESTORE_EMULATOR_TESTS
);

const maybeDescribe = runFirestoreSmoke ? describe : describe.skip;

maybeDescribe("firestore emulator smoke", () => {
  it("signs in, creates a campaign, and receives live campaign data", async () => {
    const repository = createRepository();
    expect(repository.kind).toBe("firestore");

    await repository.signIn();
    const snapshot = createStarterCampaign(`emulator-${crypto.randomUUID()}`, "Emulator Smoke");
    await repository.ensureCampaign(snapshot);

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        unsubscribe();
        reject(new Error("Timed out waiting for campaign snapshot."));
      }, 5000);
      const unsubscribe = repository.subscribeCampaign(snapshot.campaign.id, (nextSnapshot) => {
        if (nextSnapshot.campaign.name === "Emulator Smoke" && nextSnapshot.entities.length > 0) {
          window.clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      });
    });
  });
});
