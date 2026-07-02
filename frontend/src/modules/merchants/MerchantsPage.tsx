/**
 * Merchants screen: the payee directory with per-merchant spend, plus a
 * quick-add form. Reads live from Dexie (offline-first); stats are derived from
 * the local transaction ledger.
 */

import { Plus, Store, Trash2 } from "lucide-react";
import { useState } from "react";

import { formatMoney } from "../../shared/format";
import { EmptyState } from "../../shared/ui/EmptyState";
import { useMerchants, useMerchantStats } from "./hooks";
import { addMerchant, deleteMerchant } from "./localRepo";

export function MerchantsPage() {
  const merchants = useMerchants();
  const stats = useMerchantStats();
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Comercios</h1>
        <button
          className="flex items-center gap-1 rounded-xl bg-mint px-3 py-2 text-sm font-semibold text-white"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus size={16} /> Nuevo
        </button>
      </header>

      {adding && <AddMerchantForm onDone={() => setAdding(false)} />}

      {merchants.length === 0 && !adding ? (
        <EmptyState
          icon={<Store size={24} />}
          title="Sin comercios todavía"
          message="Crea comercios (Mercadona, Netflix…) para etiquetar tus movimientos y ver cuánto gastas en cada uno."
          action={
            <button
              className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-white"
              onClick={() => setAdding(true)}
            >
              Añadir comercio
            </button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {merchants.map((m) => {
            const s = stats.get(m.id);
            return (
              <li key={m.id} className="card-panel flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-xl text-white"
                    style={{ background: m.color || "var(--color-mint, #10b981)" }}
                  >
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-ink-soft">
                      {s?.transactionCount ?? 0} movimientos
                      {m.recurringProbability > 0 &&
                        ` · ${Math.round(m.recurringProbability * 100)}% recurrente`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-display font-semibold text-coral">
                    {formatMoney(s?.totalSpent ?? 0)}
                  </span>
                  <button
                    className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-soft hover:text-coral"
                    onClick={() => deleteMerchant(m.id)}
                    aria-label={`Eliminar ${m.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AddMerchantForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await addMerchant({ name: name.trim(), website: website.trim() });
    onDone();
  }

  return (
    <form onSubmit={submit} className="card-panel flex flex-col gap-3 p-4">
      <input
        className="field-input"
        placeholder="Nombre del comercio"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Nombre del comercio"
        autoFocus
      />
      <input
        className="field-input"
        placeholder="Web (opcional)"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        aria-label="Web"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="rounded-xl border border-line px-4 py-2 text-sm"
          onClick={onDone}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-white"
        >
          Guardar
        </button>
      </div>
    </form>
  );
}
