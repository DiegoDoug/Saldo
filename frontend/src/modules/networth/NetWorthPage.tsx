/**
 * Net Worth screen: the headline figure with monthly growth, an allocation
 * breakdown, a historical trend chart, and manual asset/liability management.
 * Offline-first: everything computes from local Dexie data; a daily snapshot is
 * recorded on visit so the trend fills in over time.
 */

import { Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { type AssetKind, type LiabilityKind } from "../../db/db";
import { formatMoney, parseAmount } from "../../shared/format";
import { useAuthStore } from "../identity/authStore";
import { useAssets, useLiabilities, useNetWorth, useSnapshots } from "./hooks";
import {
  addAsset,
  addLiability,
  deleteAsset,
  deleteLiability,
  recordSnapshot,
} from "./localRepo";

const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  cash: "Efectivo",
  property: "Inmueble",
  vehicle: "Vehículo",
  investment: "Inversión",
  crypto: "Cripto",
  other: "Otro",
};

const LIABILITY_KIND_LABELS: Record<LiabilityKind, string> = {
  mortgage: "Hipoteca",
  loan: "Préstamo",
  credit_card: "Tarjeta de crédito",
  student: "Estudios",
  other: "Otro",
};

const BUCKET_LABELS: Record<string, string> = {
  checking: "Cuenta corriente",
  savings: "Ahorro",
  cash: "Efectivo",
  credit_card: "Tarjeta",
  investment: "Inversión",
  crypto: "Cripto",
  property: "Inmueble",
  vehicle: "Vehículo",
  other: "Otro",
};

export function NetWorthPage() {
  const summary = useNetWorth();
  const snapshots = useSnapshots();
  const currency = useAuthStore((s) => s.user?.defaultCurrency ?? "EUR");

  // Record today's snapshot once the figures are known, so the trend grows over
  // time. Keyed on the rounded net worth so a real change re-records same-day.
  useEffect(() => {
    recordSnapshot(summary.assetsTotal, summary.liabilitiesTotal, summary.netWorth, currency);
  }, [summary.assetsTotal, summary.liabilitiesTotal, summary.netWorth, currency]);

  const allocationRows = Object.entries(summary.allocation)
    .filter(([, share]) => share > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold">Patrimonio</h1>

      <div className="card-panel flex flex-col gap-1 p-5">
        <span className="text-xs uppercase tracking-wide text-ink-soft">Patrimonio neto</span>
        <div className="flex items-center gap-3">
          <span className="font-display text-3xl font-semibold">
            {formatMoney(summary.netWorth, currency)}
          </span>
          {summary.growth !== null && <GrowthBadge growth={summary.growth} />}
        </div>
        <div className="mt-2 flex gap-6 text-sm">
          <span>
            <span className="text-ink-soft">Activos </span>
            <span className="font-semibold text-mint">
              {formatMoney(summary.assetsTotal, currency)}
            </span>
          </span>
          <span>
            <span className="text-ink-soft">Pasivos </span>
            <span className="font-semibold text-coral">
              {formatMoney(summary.liabilitiesTotal, currency)}
            </span>
          </span>
        </div>
      </div>

      {snapshots.length >= 2 && (
        <div className="card-panel p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink-soft">Evolución</h2>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={snapshots.map((s) => ({ date: s.date.slice(5), value: s.netWorth }))}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <Tooltip formatter={(v: number) => formatMoney(v, currency)} />
                <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {allocationRows.length > 0 && (
        <div className="card-panel flex flex-col gap-2 p-4">
          <h2 className="text-sm font-semibold text-ink-soft">Distribución de activos</h2>
          {allocationRows.map(([bucket, share]) => (
            <div key={bucket}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{BUCKET_LABELS[bucket] ?? bucket}</span>
                <span className="text-ink-soft">{Math.round(share * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-mint" style={{ width: `${share * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <AssetsSection />
      <LiabilitiesSection />
    </div>
  );
}

function GrowthBadge({ growth }: { growth: number }) {
  const up = growth >= 0;
  return (
    <span
      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${
        up ? "bg-mint-soft/60 text-mint" : "bg-coral-soft/60 text-coral"
      }`}
    >
      {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
      {Math.abs(Math.round(growth * 100))}%
    </span>
  );
}

function AssetsSection() {
  const assets = useAssets();
  const currency = useAuthStore((s) => s.user?.defaultCurrency ?? "EUR");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AssetKind>("property");
  const [value, setValue] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || parseAmount(value) <= 0) return;
    await addAsset({ name: name.trim(), kind, value: parseAmount(value), currency });
    setName("");
    setValue("");
    setAdding(false);
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-soft">Activos</h2>
        <button
          className="flex items-center gap-1 text-sm font-semibold text-mint"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus size={15} /> Añadir
        </button>
      </div>
      {adding && (
        <form onSubmit={submit} className="card-panel flex flex-col gap-2 p-3">
          <input
            className="field-input"
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nombre del activo"
            autoFocus
          />
          <div className="flex gap-2">
            <select
              className="field-input"
              value={kind}
              onChange={(e) => setKind(e.target.value as AssetKind)}
              aria-label="Tipo de activo"
            >
              {(Object.keys(ASSET_KIND_LABELS) as AssetKind[]).map((k) => (
                <option key={k} value={k}>
                  {ASSET_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              className="field-input"
              placeholder="Valor"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              aria-label="Valor"
            />
          </div>
          <button className="self-end rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-white">
            Guardar
          </button>
        </form>
      )}
      {assets.length === 0 && !adding ? (
        <p className="card-panel p-3 text-sm text-ink-soft">Sin activos añadidos.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {assets.map((a) => (
            <li key={a.id} className="card-panel flex items-center justify-between p-3">
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-xs text-ink-soft">{ASSET_KIND_LABELS[a.kind]}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display font-semibold text-mint">
                  {formatMoney(a.value, a.currency)}
                </span>
                <button
                  className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-soft hover:text-coral"
                  onClick={() => deleteAsset(a.id)}
                  aria-label={`Eliminar ${a.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LiabilitiesSection() {
  const liabilities = useLiabilities();
  const currency = useAuthStore((s) => s.user?.defaultCurrency ?? "EUR");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LiabilityKind>("loan");
  const [balance, setBalance] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || parseAmount(balance) <= 0) return;
    await addLiability({ name: name.trim(), kind, balance: parseAmount(balance), currency });
    setName("");
    setBalance("");
    setAdding(false);
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-soft">Pasivos</h2>
        <button
          className="flex items-center gap-1 text-sm font-semibold text-mint"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus size={15} /> Añadir
        </button>
      </div>
      {adding && (
        <form onSubmit={submit} className="card-panel flex flex-col gap-2 p-3">
          <input
            className="field-input"
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nombre del pasivo"
            autoFocus
          />
          <div className="flex gap-2">
            <select
              className="field-input"
              value={kind}
              onChange={(e) => setKind(e.target.value as LiabilityKind)}
              aria-label="Tipo de pasivo"
            >
              {(Object.keys(LIABILITY_KIND_LABELS) as LiabilityKind[]).map((k) => (
                <option key={k} value={k}>
                  {LIABILITY_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              className="field-input"
              placeholder="Saldo pendiente"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              inputMode="decimal"
              aria-label="Saldo pendiente"
            />
          </div>
          <button className="self-end rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-white">
            Guardar
          </button>
        </form>
      )}
      {liabilities.length === 0 && !adding ? (
        <p className="card-panel p-3 text-sm text-ink-soft">Sin pasivos añadidos.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {liabilities.map((l) => (
            <li key={l.id} className="card-panel flex items-center justify-between p-3">
              <div>
                <p className="font-medium">{l.name}</p>
                <p className="text-xs text-ink-soft">{LIABILITY_KIND_LABELS[l.kind]}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display font-semibold text-coral">
                  {formatMoney(l.balance, l.currency)}
                </span>
                <button
                  className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-soft hover:text-coral"
                  onClick={() => deleteLiability(l.id)}
                  aria-label={`Eliminar ${l.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
