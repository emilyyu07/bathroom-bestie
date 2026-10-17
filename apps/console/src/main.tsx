import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Replay } from "./Replay";
import { Sweep } from "./Sweep";

function App() {
  const [page, setPage] = useState<"replay" | "sweep">("replay");
  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <h1>Tether console</h1>
      <nav style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button onClick={() => setPage("replay")} disabled={page === "replay"}>Replay</button>
        <button onClick={() => setPage("sweep")} disabled={page === "sweep"}>Sweep</button>
      </nav>
      {page === "replay" ? <Replay /> : <Sweep />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
