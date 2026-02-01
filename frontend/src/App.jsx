import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AdminDashboard from "./pages/AdminDashboard";
import OperatorDashboard from "./pages/OperatorDashboard";
import RobotStatusPanel from "./pages/RobotStatusPanel";
import TaskManager from "./pages/TaskManager";
import SimulationView from "./pages/SimulationView";
import AdminAnalytics from "./pages/AdminAnalytics";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/ProtectedRoute";
import AppRedirect from "./pages/AppRedirect";
import { useAuth } from "./context/AuthContext";

export default function App() {
  const { isAuthed, user } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route
        path="/login"
        element={isAuthed ? <Navigate to={user?.role === "admin" ? "/admin" : "/operator"} /> : <Login />}
      />
      <Route
        path="/register"
        element={isAuthed ? <Navigate to={user?.role === "admin" ? "/admin" : "/operator"} /> : <Register />}
      />

      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppRedirect />} />
      </Route>

      <Route element={<ProtectedRoute roles={["admin"]} />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/analytics" element={<AdminAnalytics />} />
      </Route>

      <Route element={<ProtectedRoute roles={["operator"]} />}>
        <Route path="/operator" element={<OperatorDashboard />} />
      </Route>

      <Route element={<ProtectedRoute roles={["admin", "operator"]} />}>
        <Route path="/robots" element={<RobotStatusPanel />} />
        <Route path="/tasks" element={<TaskManager />} />
        <Route path="/simulation" element={<SimulationView />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
