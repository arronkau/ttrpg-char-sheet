import { Route, Routes, useNavigate } from "react-router-dom";
import { Sparkles, Users } from "lucide-react";
import { lazy, Suspense, useState } from "react";

const CampaignShell = lazy(() => import("./CampaignShell"));

export function App() {
  return (
    <Routes>
      <Route path="/" element={<StartPage />} />
      <Route
        path="/campaign/:campaignId/*"
        element={
          <Suspense fallback={<AppLoading label="Loading campaign" />}>
            <CampaignShell />
          </Suspense>
        }
      />
    </Routes>
  );
}

function StartPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("Arden Vul Table");
  const [joinId, setJoinId] = useState("demo-table");
  const [busy, setBusy] = useState(false);

  const onCreate = async () => {
    setBusy(true);
    const { useCampaignStore } = await import("./store/campaignStore");
    const campaignId = await useCampaignStore.getState().createCampaign(name);
    navigate(`/campaign/${campaignId}/party`);
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
          <button onClick={() => navigate(`/campaign/${joinId || "demo-table"}/party`)}>
            <Users size={18} />
            Join
          </button>
        </div>
      </section>
    </main>
  );
}

function AppLoading({ label }: { label: string }) {
  return (
    <main className="loading-shell">
      <p>{label}</p>
    </main>
  );
}
