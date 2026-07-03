import { Navigate, Route, Routes } from "react-router-dom";

import { AccountsPage } from "./modules/accounts/AccountsPage";
import { BillsPage } from "./modules/bills/BillsPage";
import { BudgetingLayout } from "./modules/budgeting/BudgetingLayout";
import { MonthView } from "./modules/budgeting/MonthView";
import { YearView } from "./modules/budgeting/YearView";
import { DashboardPage } from "./modules/dashboard/DashboardPage";
import { GoalsPage } from "./modules/goals/GoalsPage";
import { MerchantsPage } from "./modules/merchants/MerchantsPage";
import { ForecastPage } from "./modules/forecast/ForecastPage";
import { NetWorthPage } from "./modules/networth/NetWorthPage";
import { ReportsPage } from "./modules/reports/ReportsPage";
import { TransactionsPage } from "./modules/transactions/TransactionsPage";
import { LoginPage } from "./modules/identity/LoginPage";
import { RegisterPage } from "./modules/identity/RegisterPage";
import { ResetPasswordPage } from "./modules/identity/ResetPasswordPage";
import { SyncProvider } from "./modules/sync/SyncProvider";
import { ProtectedRoute } from "./routes/ProtectedRoute";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
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
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/merchants" element={<MerchantsPage />} />
        <Route path="/bills" element={<BillsPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/net-worth" element={<NetWorthPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/forecast" element={<ForecastPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
