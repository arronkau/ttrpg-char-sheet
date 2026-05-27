import { NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { BookOpen, Boxes, ClipboardList, Database, FileText, Shield, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCampaignStore } from "./store/campaignStore";
import { InventoryPage } from "./pages/InventoryPage";
import { PartyPage } from "./pages/PartyPage";
import { CharacterPage } from "./pages/CharacterPage";
import { ItemsPage } from "./pages/ItemsPage";
import { SpellsPage } from "./pages/SpellsPage";
import { summarizeEntity } from "./lib/rules";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<StartPage />} />
      <Route path="/campaign/:campaignId/*" element={<CampaignShell />} />
    </Routes>
  );
}

function StartPage() {
  const navigate = useNavigate();
  const createCampaign = useCampaignStore((state) => state.createCampaign);
  const [name, setName] = useState("Arden Vul Table");
  const [joinId, setJoinId] = useState("demo-table");
  const [busy, setBusy] = useState(false);

  const onCreate = async () => {
    setBusy(true);
    const campaignId = await createCampaign(name);
    navigate(`/campaign/${campaignId}/inventory`);
  };

  return (
    <main className="start-screen">
      <section className="start-panel">
        <div>
          <p className="eyebrow">Table Kit</p>
          <h1>Inventory and character tracking for the table</h1>
        </div>
        <div className="start-actions">
          <label>
            Campaign name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <button className="primary-action" onClick={onCreate} disabled={busy}>
            <Sparkles size={18} />
            Create
          </button>
        </div>
        <div className="start-actions">
          <label>
            Campaign id
            <input value={joinId} onChange={(event) => setJoinId(event.target.value.trim())} />
          </label>
          <button onClick={() => navigate(`/campaign/${joinId || "demo-table"}/inventory`)}>
            <Users size={18} />
            Join
          </button>
        </div>
      </section>
    </main>
  );
}

function CampaignShell() {
  const { campaignId } = useParams();
  const initialize = useCampaignStore((state) => state.initialize);
  const loading = useCampaignStore((state) => state.loading);
  const error = useCampaignStore((state) => state.error);
  const campaign = useCampaignStore((state) => state.campaign);
  const entities = useCampaignStore((state) => state.entities);
  const inventoryEntries = useCampaignStore((state) => state.inventoryEntries);
  const catalogs = useCampaignStore((state) => state.catalogs);
  const repositoryKind = useCampaignStore((state) => state.repositoryKind);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const setViewMode = useCampaignStore((state) => state.setViewMode);
  const warningCount = useMemo(
    () =>
      entities
        .filter((entity) => entity.active)
        .map((entity) => summarizeEntity(entity, inventoryEntries, catalogs, viewMode))
        .reduce((total, summary) => total + summary.warnings.length, 0),
    [entities, inventoryEntries, catalogs, viewMode]
  );

  useEffect(() => {
    void initialize(campaignId || "demo-table");
  }, [campaignId, initialize]);

  if (loading && !campaign) {
    return (
      <main className="loading-shell">
        <Shield size={26} />
        <p>Loading campaign</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="loading-shell">
        <p>{error}</p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{repositoryKind === "firestore" ? "Firestore sync" : "Local demo"}</p>
          <h1>{campaign?.name ?? "Table Kit"}</h1>
        </div>
        <div className="topbar-actions">
          <button
            className={viewMode === "gm" ? "toggle active" : "toggle"}
            onClick={() => void setViewMode(viewMode === "gm" ? "player" : "gm")}
            title="Switch GM/player view"
          >
            <Database size={17} />
            {viewMode.toUpperCase()}
          </button>
          <span className={warningCount > 0 ? "warning-pill" : "quiet-pill"}>{warningCount} warnings</span>
        </div>
      </header>
      <nav className="main-nav">
        <NavLink to={`/campaign/${campaignId}/inventory`}>
          <Boxes size={18} />
          Inventory
        </NavLink>
        <NavLink to={`/campaign/${campaignId}/party`}>
          <ClipboardList size={18} />
          Party
        </NavLink>
        <NavLink to={`/campaign/${campaignId}/sheet`}>
          <FileText size={18} />
          Sheet
        </NavLink>
        <NavLink to={`/campaign/${campaignId}/items`}>
          <BookOpen size={18} />
          Items
        </NavLink>
        <NavLink to={`/campaign/${campaignId}/spells`}>
          <Sparkles size={18} />
          Spells
        </NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<InventoryPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="party" element={<PartyPage />} />
        <Route path="sheet" element={<CharacterPage />} />
        <Route path="items" element={<ItemsPage />} />
        <Route path="spells" element={<SpellsPage />} />
      </Routes>
    </div>
  );
}
