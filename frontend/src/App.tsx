import { Navigate, Route, Routes } from "react-router-dom";

import { BudgetingLayout } from "./modules/budgeting/BudgetingLayout";
import { DashboardPage } from "./modules/budgeting/DashboardPage";
import { MonthView } from "./modules/budgeting/MonthView";
import { YearView } from "./modules/budgeting/YearView";
import { LoginPage } from "./modules/identity/LoginPage";
import { RegisterPage } from "./modules/identity/RegisterPage";
import { SyncProvider } from "./modules/sync/SyncProvider";
import { ProtectedRoute } from "./routes/ProtectedRoute";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <ProtectedRoute>
            <SyncProvider>
              <BudgetingLayout />
            </SyncProvider>
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/month/:month" element={<MonthView />} />
        <Route path="/year" element={<YearView />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
