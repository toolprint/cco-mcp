import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppFinal from "./AppFinal";
import { Configuration } from "./pages/Configuration";
import { SSEProvider } from "./contexts/SSEContext";

function AppRouter() {
  return (
    <BrowserRouter>
      <SSEProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<AppFinal />} />
          <Route path="/config" element={<Configuration />} />
        </Routes>
      </SSEProvider>
    </BrowserRouter>
  );
}

export default AppRouter;