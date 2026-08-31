import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import AppRoutes from "@/app/router/routes";
import CornerRefreshIndicator from "@/shared/components/CornerRefreshIndicator";
import { RefreshIndicatorProvider, useRefreshIndicator } from "@/shared/lib/refreshIndicator";

function RouteChangeRefreshBridge() {
  const location = useLocation();
  const { beginTask, updateTask, finishTask } = useRefreshIndicator();
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    const taskId = beginTask("Loading page", 22);
    const step1 = window.setTimeout(() => updateTask(taskId, 58), 90);
    const step2 = window.setTimeout(() => updateTask(taskId, 86), 190);
    const done = window.setTimeout(() => finishTask(taskId), 320);
    return () => {
      window.clearTimeout(step1);
      window.clearTimeout(step2);
      window.clearTimeout(done);
      finishTask(taskId);
    };
  }, [location.pathname, location.search, beginTask, updateTask, finishTask]);

  return null;
}

export default function App() {
  return (
    <RefreshIndicatorProvider>
      <RouteChangeRefreshBridge />
      <CornerRefreshIndicator />
      <AppRoutes />
    </RefreshIndicatorProvider>
  );
}
