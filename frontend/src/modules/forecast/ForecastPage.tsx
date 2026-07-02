/**
 * Forecast screen: projected balance over a 7 / 30 / 90-day horizon, computed
 * on-device from account balances, recurring events, and trailing spend. Flags
 * a projected shortfall (balance dipping below zero).
 */

import { AlertTriangle, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatMoney } from "../../shared/format";
import { useAuthStore } from "../identity/authStore";
import { useAccountBalances } from "../accounts/hooks";
import { EmptyState } from "../../shared/ui/EmptyState";
import { useForecast } from "./hooks";

const HORIZONS = [7, 30, 90] as const;

export function ForecastPage() {
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]>(30);
  const result = useForecast(horizon);
  const currency = useAuthStore((s) => s.user?.defaultCurrency ?? "EUR");
  const accounts = useAccountBalances(true);

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl font-semibold">Previsión</h1>
        <EmptyState
          icon={<TrendingUp size={24} />}
          title="Sin cuentas que proyectar"
          message="Crea una cuenta y registra movimientos o recibos recurrentes para ver tu previsión de saldo."
        />
      </div>
    );
  }

  const shortfall = result.minBalance < 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold">Previsión</h1>

      <div className="flex gap-2" role="group" aria-label="Horizonte de previsión">
        {HORIZONS.map((h) => (
          <button
            key={h}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
              horizon === h ? "border-mint bg-mint-soft/60 text-mint" : "border-line text-ink-soft"
            }`}
            aria-pressed={horizon === h}
            onClick={() => setHorizon(h)}
          >
            {h} días
          </button>
        ))}
      </div>

      <div className="card-panel flex flex-col gap-1 p-5">
        <span className="text-xs uppercase tracking-wide text-ink-soft">
          Saldo previsto en {horizon} días
        </span>
        <span className="font-display text-3xl font-semibold">
          {formatMoney(result.endBalance, currency)}
        </span>
        <p className="mt-1 text-sm text-ink-soft">
          Saldo mínimo: {formatMoney(result.minBalance, currency)} el {result.minDate}
        </p>
      </div>

      {shortfall && (
        <div className="flex items-center gap-2 rounded-xl border border-coral/40 bg-coral-soft/40 px-4 py-3 text-sm text-coral">
          <AlertTriangle size={18} />
          <span>Tu saldo podría quedar en negativo el {result.minDate}.</span>
        </div>
      )}

      <div className="card-panel p-4">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={result.points.map((p) => ({ date: p.date.slice(5), balance: p.balance }))}>
              <defs>
                <linearGradient id="fc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} width={44} />
              <Tooltip formatter={(v: number) => formatMoney(v, currency)} />
              <Area type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2} fill="url(#fc)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
