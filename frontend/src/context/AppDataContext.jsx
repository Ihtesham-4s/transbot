/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  assignTask,
  completeTask,
  createTask,
  createTasksBulk,
  deleteTask,
  getRobot,
  getZones,
  listTasks,
  setRobotAutoMode,
  getSystemLogs,
  robotTransition
} from "../lib/api";
import { getErrorMessage } from "../lib/formatters";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";

const AppDataContext = createContext(null);

function setPendingFlag(setter, key, value) {
  setter((current) => ({ ...current, [key]: value }));
}

export function AppDataProvider({ children }) {
  const { token, logout } = useAuth();
  const toast = useToast();

  const [zones, setZones] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [robot, setRobot] = useState(null);
  const [logs, setLogs] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingActions, setPendingActions] = useState({});
  const [loadError, setLoadError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const handleUnauthorized = useCallback(
    (error) => {
      if (error?.status === 401) {
        toast.error("Session expired. Please sign in again.");
        logout();
        return true;
      }
      return false;
    },
    [logout, toast]
  );

  const refreshData = useCallback(async ({ silent = false } = {}) => {
    if (!token) return;

    if (silent) setRefreshing(true);
    else setInitialLoading(true);

    const requests = await Promise.allSettled([
      getZones(token),
      listTasks(token),
      getRobot(token),
      getSystemLogs(token, { limit: 20, page: 1 })
    ]);

    const [zoneResult, taskResult, robotResult, logResult] = requests;
    const errors = [];

    if (zoneResult.status === "fulfilled") setZones(zoneResult.value?.zones || []);
    else errors.push(zoneResult.reason);

    if (taskResult.status === "fulfilled") setTasks(taskResult.value?.tasks || []);
    else errors.push(taskResult.reason);

    if (robotResult.status === "fulfilled") setRobot(robotResult.value || null);
    else errors.push(robotResult.reason);

    if (logResult.status === "fulfilled") setLogs(logResult.value?.logs || []);
    else errors.push(logResult.reason);

    if (errors.length === requests.length) {
      if (errors.some(handleUnauthorized)) {
        setInitialLoading(false);
        setRefreshing(false);
        return;
      }
      setLoadError(getErrorMessage(errors[0], "Failed to load live data."));
    } else {
      errors.forEach(handleUnauthorized);
      setLoadError("");
      setLastUpdated(new Date().toISOString());
    }

    setInitialLoading(false);
    setRefreshing(false);
  }, [handleUnauthorized, token]);

  useEffect(() => {
    if (!token) {
      setZones([]);
      setTasks([]);
      setRobot(null);
      setLogs([]);
      setInitialLoading(false);
      setRefreshing(false);
      setPendingActions({});
      setLoadError("");
      setLastUpdated(null);
      return;
    }

    refreshData();
  }, [token, refreshData]);

  const runAction = useCallback(async (key, action, successMessage) => {
    setPendingFlag(setPendingActions, key, true);
    try {
      const result = await action();
      if (successMessage) toast.success(successMessage);
      await refreshData({ silent: true });
      return result;
    } catch (error) {
      if (handleUnauthorized(error)) return null;
      toast.error(getErrorMessage(error));
      throw error;
    } finally {
      setPendingFlag(setPendingActions, key, false);
    }
  }, [handleUnauthorized, refreshData, toast]);

  const value = useMemo(
    () => ({
      zones,
      pickupZones: zones.filter((zone) => zone.type === "PICKUP"),
      dropZones: zones.filter((zone) => zone.type === "DROPOFF"),
      tasks,
      robot,
      logs,
      initialLoading,
      refreshing,
      pendingActions,
      loadError,
      lastUpdated,
      refreshData,
      createTaskAction: (payload) =>
        runAction("create-task", () => createTask(token, payload), "Task created successfully."),
      createBulkTasksAction: (payload) =>
        runAction("create-bulk-task", () => createTasksBulk(token, payload)),
      assignTaskAction: (taskId) =>
        runAction(`assign-${taskId}`, () => assignTask(token, taskId), "Task assigned to robot."),
      completeTaskAction: (taskId) =>
        runAction(`complete-${taskId}`, () => completeTask(token, taskId), "Task completed."),
      deleteTaskAction: (taskId) =>
        runAction(`delete-${taskId}`, () => deleteTask(token, taskId), "Task deleted successfully."),
      transitionRobotAction: (nextState, successMessage) =>
        runAction(`robot-${nextState}`, () => robotTransition(token, nextState), successMessage),
      setAutoModeAction: (enabled) =>
        runAction("robot-auto-mode", () => setRobotAutoMode(token, enabled), enabled ? "Auto mode enabled." : "Auto mode disabled.")
    }),
    [initialLoading, lastUpdated, loadError, logs, pendingActions, refreshData, refreshing, robot, runAction, tasks, token, zones]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) throw new Error("useAppData must be used within AppDataProvider");
  return context;
}
