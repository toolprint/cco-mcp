import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppFinal from "./AppFinal";
import { Configuration } from "./pages/Configuration";
import { Events } from "./pages/Events";
import { SSEProvider } from "./contexts/SSEContext";

function AppRouter() {
  return (
    <BrowserRouter>
      <SSEProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<AppFinal />} />
          <Route path="/config" element={<Configuration />} />
          <Route path="/events" element={<Events />} />
        </Routes>
      </SSEProvider>
    </BrowserRouter>
  );
}

export default AppRouter;
