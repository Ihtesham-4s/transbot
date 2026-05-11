import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import RobotControl from "./pages/RobotControl";
import Logs from "./pages/Logs";
import PathPlanner from "./pages/PathPlanner";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/ProtectedRoute";
import AppRedirect from "./pages/AppRedirect";
import { useAuth } from "./context/AuthContext";
import AppLayout from "./components/layout/AppLayout";

export default function App() {
  const { isAuthed } = useAuth();

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
          <Route path="/robot" element={<RobotControl />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/planner" element={<PathPlanner />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
