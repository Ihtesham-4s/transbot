import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Inventory from "./pages/Inventory";
import Orders from "./pages/Orders";
import PickLists from "./pages/PickLists";
import RobotControl from "./pages/RobotControl";
import Logs from "./pages/Logs";
import Settings from "./pages/Settings";
import Copilot from "./pages/Copilot";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/ProtectedRoute";
import AppRedirect from "./pages/AppRedirect";
import AppLayout from "./components/layout/AppLayout";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppRedirect />} />

        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/picklists" element={<PickLists />} />
          <Route path="/copilot" element={<Copilot />} />
          <Route path="/planner" element={<Navigate to="/tasks" replace />} />
          <Route path="/path-planner" element={<Navigate to="/tasks" replace />} />
          <Route path="/simulation" element={<Navigate to="/tasks" replace />} />
          <Route path="/robot" element={<RobotControl />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
