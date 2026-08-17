import { Navigate, Route, Routes } from "react-router-dom";
import { EditorPage } from "./pages/EditorPage";
import { HomePage } from "./pages/HomePage";
import { PenDebugPage } from "./pages/PenDebugPage";
import { BenchmarkPage } from "./pages/BenchmarkPage";
import { ProfilePage } from "./pages/ProfilePage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/notebook/:id" element={<EditorPage />} />
      <Route path="/debug/pen" element={<PenDebugPage />} />
      <Route path="/debug/benchmark" element={<BenchmarkPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
