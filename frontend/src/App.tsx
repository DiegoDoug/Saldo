import { Navigate, Route, Routes } from "react-router-dom";

import { AccountsPage } from "./modules/accounts/AccountsPage";
import { BillsPage } from "./modules/bills/BillsPage";
import { BudgetingLayout } from "./modules/budgeting/BudgetingLayout";
import { MonthView } from "./modules/budgeting/MonthView";
import { YearView } from "./modules/budgeting/YearView";
import { DashboardPage } from "./modules/dashboard/DashboardPage";
import { MerchantsPage } from "./modules/merchants/MerchantsPage";
import { TransactionsPage } from "./modules/transactions/TransactionsPage";
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
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/merchants" element={<MerchantsPage />} />
        <Route path="/bills" element={<BillsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
