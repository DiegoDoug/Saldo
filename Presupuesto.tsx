import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Wallet, PiggyBank, TrendingUp, TrendingDown, Plus, Trash2, ChevronLeft,
  ChevronRight, Target, Receipt, Repeat, Home, Calendar, BarChart3,
  ArrowLeft, Check, Pencil, Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  LineChart, Line, CartesianGrid, PieChart, Pie, Legend,
} from "recharts";

/* ============================================================
   BUSINESS LOGIC  (pure, no UI) — reverse-engineered from sheet
   ============================================================
   Per month:
     income.total      = nomina + otros + extras
     savingsGoal       = "cuanto quiero ahorrar" (user set)
     canSpend          = income.total - savingsGoal           ("puedo gastar")
     expenses.total    = Σ fijos + Σ variables
     endOfMonthSavings = income.total - expenses.total        ("ahorro a fin de mes")
     overspend         = expenses.total > canSpend
   Year = aggregation of every month.
============================================================ */

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const FIXED_CATS = [
  { key: "alquiler", label: "Alquiler / Hipoteca" },
  { key: "facturas", label: "Facturas" },
  { key: "suscripciones", label: "Suscripciones" },
  { key: "transporte", label: "Transporte" },
];
const VARIABLE_CATS = [
  { key: "supermercado", label: "Supermercado" },
  { key: "comidas", label: "Cafés, comidas…" },
  { key: "impulsivas", label: "Compras impulsivas" },
  { key: "ocio", label: "Ocio" },
];
const ALL_CATS = [...FIXED_CATS, ...VARIABLE_CATS];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function makeMonth() {
  return {
    income: { nomina: 0, otros: 0, extras: [] }, // extras: {id,label,amount}
    savingsGoal: 0,
    fixed: { alquiler: 0, facturas: 0, suscripciones: 0, transporte: 0 },
    variable: { supermercado: 0, comidas: 0, impulsivas: 0, ocio: 0 },
  };
}

function makeYear(year) {
  return { year, months: Array.from({ length: 12 }, makeMonth) };
}

function computeMonth(m) {
  const extrasTotal = m.income.extras.reduce((s, e) => s + (+e.amount || 0), 0);
  const incomeTotal = round2((+m.income.nomina || 0) + (+m.income.otros || 0) + extrasTotal);
  const fixedTotal = round2(Object.values(m.fixed).reduce((s, v) => s + (+v || 0), 0));
  const variableTotal = round2(Object.values(m.variable).reduce((s, v) => s + (+v || 0), 0));
  const expensesTotal = round2(fixedTotal + variableTotal);
  const goal = +m.savingsGoal || 0;
  const canSpend = round2(incomeTotal - goal);
  const endOfMonthSavings = round2(incomeTotal - expensesTotal);
  const remainingToSpend = round2(canSpend - expensesTotal);
  return {
    incomeTotal, extrasTotal, fixedTotal, variableTotal, expensesTotal,
    goal, canSpend, endOfMonthSavings, remainingToSpend,
    metGoal: endOfMonthSavings >= goal,
    overspend: expensesTotal > canSpend && incomeTotal > 0,
  };
}

function computeYear(yearData) {
  const perMonth = yearData.months.map(computeMonth);
  const sum = (sel) => round2(perMonth.reduce((s, c) => s + sel(c), 0));
  return {
    perMonth,
    incomeTotal: sum((c) => c.incomeTotal),
    goalTotal: sum((c) => c.goal),
    canSpendTotal: sum((c) => c.canSpend),
    expensesTotal: sum((c) => c.expensesTotal),
    fixedTotal: sum((c) => c.fixedTotal),
    variableTotal: sum((c) => c.variableTotal),
    savingsTotal: sum((c) => c.endOfMonthSavings),
    nominaTotal: round2(yearData.months.reduce((s, m) => s + (+m.income.nomina || 0), 0)),
    otrosTotal: round2(yearData.months.reduce(
      (s, m) => s + (+m.income.otros || 0) + m.income.extras.reduce((a, e) => a + (+e.amount || 0), 0), 0)),
    byCategory: ALL_CATS.map((cat) => {
      const group = FIXED_CATS.includes(cat) ? "fixed" : "variable";
      return {
        key: cat.key, label: cat.label, group,
        total: round2(yearData.months.reduce((s, m) => s + (+m[group][cat.key] || 0), 0)),
      };
    }),
  };
}

/* ============================================================
   STORAGE  (offline-first, artifact KV store)
   ============================================================ */
const STORAGE_KEY = "presupuesto:v1";

async function loadState() {
  try {
    const res = await window.storage.get(STORAGE_KEY);
    if (res && res.value) return JSON.parse(res.value);
  } catch (_) { /* first run / empty */ }
  return null;
}
async function saveState(state) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}

/* ============================================================
   FORMATTING / SMALL UTILITIES
   ============================================================ */
const eur = (n) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(+n || 0);

const parseAmount = (raw) => {
  if (raw === "" || raw == null) return 0;
  const cleaned = String(raw).replace(/\s|€/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/* ============================================================
   PALETTE  — "Cuaderno": warm paper, ink, mint + coral accents
   ============================================================ */
const C = {
  paper: "#FBF7F0", card: "#FFFFFF", ink: "#1C2826", inkSoft: "#5C6A66",
  line: "#E7E0D4", mint: "#2F8F6F", mintSoft: "#E4F2EB",
  coral: "#E06B52", coralSoft: "#FBE7E1", gold: "#C9A227",
  blue: "#3E6E8E", lilac: "#7C6CA8",
};
const CAT_COLORS = ["#2F8F6F", "#3E6E8E", "#7C6CA8", "#C9A227", "#E06B52", "#D98C5F", "#5BA4A0", "#A86C9E"];

/* ============================================================
   PRIMITIVES
   ============================================================ */
function MoneyInput({ value, onCommit, placeholder = "0,00", ariaLabel, accent = C.ink }) {
  const [local, setLocal] = useState("");
  const [editing, setEditing] = useState(false);
  const display = editing ? local : (value ? eur(value) : "");
  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      className="money-input"
      style={{ color: value ? accent : C.inkSoft }}
      value={display}
      placeholder={placeholder}
      onFocus={(e) => { setEditing(true); setLocal(value ? String(value).replace(".", ",") : ""); requestAnimationFrame(() => e.target.select()); }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { setEditing(false); onCommit(parseAmount(local)); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

function Stat({ icon: Icon, label, value, tone = "ink", hint }) {
  const tones = {
    ink: { c: C.ink, bg: "transparent" },
    mint: { c: C.mint, bg: C.mintSoft },
    coral: { c: C.coral, bg: C.coralSoft },
  };
  const t = tones[tone];
  return (
    <div className="stat">
      <div className="stat-ico" style={{ background: t.bg, color: t.c }}><Icon size={18} /></div>
      <div className="stat-body">
        <div className="stat-label">{label}</div>
        <div className="stat-value" style={{ color: t.c }}>{value}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

/* ============================================================
   APP
   ============================================================ */
export default function App() {
  const [data, setData] = useState(null);              // { years: {2025: makeYear} , currentYear, currentMonth }
  const [route, setRoute] = useState({ name: "dashboard" }); // dashboard | month | year
  const [ready, setReady] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const saveTimer = useRef(null);

  // --- load once ---
  useEffect(() => {
    (async () => {
      const stored = await loadState();
      if (stored && stored.years) {
        setData(stored);
        setRoute({ name: "dashboard" });
      } else {
        const y = new Date().getFullYear();
        setData({ years: { [y]: seedYear(y) }, currentYear: y });
      }
      setReady(true);
    })();
  }, []);

  // --- autosave (debounced) ---
  useEffect(() => {
    if (!ready || !data) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await saveState(data);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1400);
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [data, ready]);

  const year = data?.currentYear;
  const yearData = data?.years?.[year];
  const yearCalc = useMemo(() => (yearData ? computeYear(yearData) : null), [yearData]);

  const updateMonth = useCallback((monthIdx, updater) => {
    setData((prev) => {
      const next = structuredClone(prev);
      const m = next.years[next.currentYear].months[monthIdx];
      updater(m);
      return next;
    });
  }, []);

  const switchYear = useCallback((delta) => {
    setData((prev) => {
      const next = structuredClone(prev);
      const target = next.currentYear + delta;
      if (!next.years[target]) next.years[target] = makeYear(target);
      next.currentYear = target;
      return next;
    });
  }, []);

  if (!ready || !data) {
    return <div style={{ minHeight: "100vh", background: C.paper, display: "grid", placeItems: "center", fontFamily: "Georgia, serif", color: C.inkSoft }}>Cargando…</div>;
  }

  return (
    <div className="app">
      <Style />
      <Header
        year={year}
        onYear={switchYear}
        saved={savedFlash}
        route={route}
        onHome={() => setRoute({ name: "dashboard" })}
      />

      <main className="main">
        {route.name === "dashboard" && (
          <Dashboard
            yearData={yearData} yearCalc={yearCalc} year={year}
            onOpenMonth={(i) => setRoute({ name: "month", month: i })}
            onOpenYear={() => setRoute({ name: "year" })}
          />
        )}
        {route.name === "month" && (
          <MonthView
            monthIdx={route.month}
            month={yearData.months[route.month]}
            calc={yearCalc.perMonth[route.month]}
            year={year}
            onUpdate={(u) => updateMonth(route.month, u)}
            onNav={(d) => {
              const ni = (route.month + d + 12) % 12;
              setRoute({ name: "month", month: ni });
            }}
            onBack={() => setRoute({ name: "dashboard" })}
          />
        )}
        {route.name === "year" && (
          <YearView yearCalc={yearCalc} year={year} onBack={() => setRoute({ name: "dashboard" })} />
        )}
      </main>

      <BottomNav route={route} setRoute={setRoute} />
    </div>
  );
}

/* ---------- seed: encode the example month from the sheet ---------- */
function seedYear(year) {
  const y = makeYear(year);
  y.months = y.months.map((m, i) => {
    m.income.nomina = 1500;
    m.income.otros = 50;
    m.savingsGoal = i >= 10 ? 1000 : 200; // Nov/Dec showed 1000 in the sheet
    return m;
  });
  return y;
}

/* ============================================================
   HEADER
   ============================================================ */
function Header({ year, onYear, saved, route, onHome }) {
  return (
    <header className="header">
      <div className="header-inner">
        <button className="brand" onClick={onHome} aria-label="Inicio">
          <span className="brand-mark"><PiggyBank size={20} /></span>
          <span className="brand-text">Cuentas<span className="brand-dot">.</span></span>
        </button>

        <div className="year-switch" role="group" aria-label="Cambiar año">
          <button onClick={() => onYear(-1)} aria-label="Año anterior"><ChevronLeft size={18} /></button>
          <span className="year-label">{year}</span>
          <button onClick={() => onYear(1)} aria-label="Año siguiente"><ChevronRight size={18} /></button>
        </div>

        <span className={`save-pill ${saved ? "on" : ""}`} aria-live="polite">
          <Check size={13} /> Guardado
        </span>
      </div>
    </header>
  );
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function Dashboard({ yearData, yearCalc, year, onOpenMonth, onOpenYear }) {
  const now = new Date();
  const currentMonthIdx = now.getFullYear() === year ? now.getMonth() : 0;
  const savingsRate = yearCalc.incomeTotal > 0
    ? Math.round((yearCalc.savingsTotal / yearCalc.incomeTotal) * 100) : 0;

  const trend = yearCalc.perMonth.map((c, i) => ({
    name: MONTHS[i].slice(0, 3), Ingresos: c.incomeTotal, Gastos: c.expensesTotal, Ahorro: c.endOfMonthSavings,
  }));

  return (
    <div className="view fade">
      <section className="hero">
        <div className="hero-eyebrow">Resumen del año · {year}</div>
        <h1 className="hero-figure">{eur(yearCalc.savingsTotal)}</h1>
        <p className="hero-sub">ahorrado en lo que va de año · tasa de ahorro {savingsRate}%</p>
        <div className="hero-bars">
          <HeroBar label="Ingresos" value={yearCalc.incomeTotal} max={yearCalc.incomeTotal} color={C.mint} />
          <HeroBar label="Gastos" value={yearCalc.expensesTotal} max={yearCalc.incomeTotal} color={C.coral} />
        </div>
      </section>

      <section className="quick-stats">
        <Stat icon={TrendingUp} tone="mint" label="Ingresos del año" value={eur(yearCalc.incomeTotal)} />
        <Stat icon={TrendingDown} tone="coral" label="Gastos del año" value={eur(yearCalc.expensesTotal)} />
        <Stat icon={Target} label="Meta de ahorro" value={eur(yearCalc.goalTotal)} hint={`Cumplida: ${eur(yearCalc.savingsTotal)}`} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2><BarChart3 size={16} /> Evolución mensual</h2>
          <button className="link" onClick={onOpenYear}>Ver año completo →</button>
        </div>
        <div className="chart">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v} />
              <Tooltip formatter={(v) => eur(v)} contentStyle={{ borderRadius: 12, border: `1px solid ${C.line}`, fontSize: 12 }} />
              <Line type="monotone" dataKey="Ingresos" stroke={C.mint} strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="Gastos" stroke={C.coral} strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="Ahorro" stroke={C.blue} strokeWidth={2} strokeDasharray="4 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2><Calendar size={16} /> Meses</h2></div>
        <div className="month-grid">
          {yearCalc.perMonth.map((c, i) => (
            <button
              key={i}
              className={`month-card ${i === currentMonthIdx ? "is-current" : ""} ${c.overspend ? "is-over" : ""}`}
              onClick={() => onOpenMonth(i)}
            >
              <div className="month-card-top">
                <span className="month-name">{MONTHS[i]}</span>
                {i === currentMonthIdx && <span className="badge-now">Actual</span>}
              </div>
              <div className="month-card-fig">{eur(c.endOfMonthSavings)}</div>
              <div className="month-card-sub">
                <span style={{ color: C.mint }}>{eur(c.incomeTotal)}</span>
                <span className="dot-sep">·</span>
                <span style={{ color: C.coral }}>{eur(c.expensesTotal)}</span>
              </div>
              <MiniMeter calc={c} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function HeroBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="hero-bar">
      <div className="hero-bar-row">
        <span>{label}</span><span style={{ color }}>{eur(value)}</span>
      </div>
      <div className="hero-bar-track"><div className="hero-bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}

function MiniMeter({ calc }) {
  if (calc.canSpend <= 0) return <div className="mini-meter empty" />;
  const pct = Math.min(100, (calc.expensesTotal / calc.canSpend) * 100);
  const over = calc.expensesTotal > calc.canSpend;
  return (
    <div className="mini-meter">
      <div className="mini-meter-fill" style={{ width: `${pct}%`, background: over ? C.coral : C.mint }} />
    </div>
  );
}

/* ============================================================
   MONTH VIEW
   ============================================================ */
function MonthView({ monthIdx, month, calc, year, onUpdate, onNav, onBack }) {
  const setIncome = (k, v) => onUpdate((m) => { m.income[k] = v; });
  const setGoal = (v) => onUpdate((m) => { m.savingsGoal = v; });
  const setFixed = (k, v) => onUpdate((m) => { m.fixed[k] = v; });
  const setVariable = (k, v) => onUpdate((m) => { m.variable[k] = v; });
  const addExtra = () => onUpdate((m) => { m.income.extras.push({ id: crypto.randomUUID(), label: "Extra", amount: 0 }); });
  const updExtra = (id, patch) => onUpdate((m) => {
    const e = m.income.extras.find((x) => x.id === id); if (e) Object.assign(e, patch);
  });
  const delExtra = (id) => onUpdate((m) => { m.income.extras = m.income.extras.filter((x) => x.id !== id); });

  const breakdown = ALL_CATS
    .map((cat, idx) => {
      const group = FIXED_CATS.includes(cat) ? "fixed" : "variable";
      return { ...cat, value: +month[group][cat.key] || 0, color: CAT_COLORS[idx % CAT_COLORS.length] };
    })
    .filter((c) => c.value > 0);

  return (
    <div className="view fade">
      <div className="month-head">
        <button className="icon-btn" onClick={onBack} aria-label="Volver"><ArrowLeft size={18} /></button>
        <div className="month-nav">
          <button className="icon-btn" onClick={() => onNav(-1)} aria-label="Mes anterior"><ChevronLeft size={18} /></button>
          <h1>{MONTHS[monthIdx]} <span className="muted">{year}</span></h1>
          <button className="icon-btn" onClick={() => onNav(1)} aria-label="Mes siguiente"><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* SUMMARY CARD — financial info prioritized */}
      <section className="summary-card">
        <div className="summary-main">
          <div className="summary-label">Ahorro a fin de mes</div>
          <div className="summary-figure" style={{ color: calc.endOfMonthSavings >= 0 ? C.mint : C.coral }}>
            {eur(calc.endOfMonthSavings)}
          </div>
          <div className={`summary-tag ${calc.metGoal ? "ok" : "warn"}`}>
            {calc.metGoal
              ? <><Check size={13} /> Meta cumplida</>
              : <><Target size={13} /> Faltan {eur(Math.max(0, calc.goal - calc.endOfMonthSavings))}</>}
          </div>
        </div>
        <div className="summary-side">
          <SummaryRow label="Ingresos" value={calc.incomeTotal} color={C.mint} />
          <SummaryRow label="Puedo gastar" value={calc.canSpend} color={C.ink} />
          <SummaryRow label="Gastado" value={calc.expensesTotal} color={C.coral} />
          <div className="summary-divider" />
          <SummaryRow
            label={calc.remainingToSpend >= 0 ? "Disponible" : "Excedido"}
            value={Math.abs(calc.remainingToSpend)}
            color={calc.remainingToSpend >= 0 ? C.mint : C.coral}
            strong
          />
        </div>
      </section>

      {/* spend meter */}
      <div className="spend-meter-wrap">
        <div className="spend-meter">
          <div
            className="spend-meter-fill"
            style={{
              width: `${calc.canSpend > 0 ? Math.min(100, (calc.expensesTotal / calc.canSpend) * 100) : 0}%`,
              background: calc.overspend ? C.coral : C.mint,
            }}
          />
        </div>
        <div className="spend-meter-cap">
          <span>{eur(calc.expensesTotal)} gastado</span>
          <span>de {eur(calc.canSpend)} disponible</span>
        </div>
      </div>

      {/* INCOME */}
      <Section title="Ingresos" icon={Wallet} accent={C.mint} total={calc.incomeTotal}>
        <Row label="Nómina"><MoneyInput ariaLabel="Nómina" value={month.income.nomina} accent={C.mint} onCommit={(v) => setIncome("nomina", v)} /></Row>
        <Row label="Otros"><MoneyInput ariaLabel="Otros ingresos" value={month.income.otros} accent={C.mint} onCommit={(v) => setIncome("otros", v)} /></Row>
        {month.income.extras.map((e) => (
          <Row
            key={e.id}
            label={<input className="label-edit" value={e.label} aria-label="Nombre del ingreso extra"
              onChange={(ev) => updExtra(e.id, { label: ev.target.value })} />}
            onDelete={() => delExtra(e.id)}
          >
            <MoneyInput ariaLabel={`Importe ${e.label}`} value={e.amount} accent={C.mint} onCommit={(v) => updExtra(e.id, { amount: v })} />
          </Row>
        ))}
        <button className="add-row" onClick={addExtra}><Plus size={15} /> Añadir ingreso</button>
      </Section>

      {/* GOAL */}
      <Section title="Cuánto quiero ahorrar" icon={Target} accent={C.gold} total={calc.goal}>
        <Row label="Meta de ahorro"><MoneyInput ariaLabel="Meta de ahorro" value={month.savingsGoal} accent={C.gold} onCommit={setGoal} /></Row>
        <div className="goal-note">
          Puedes gastar <strong>{eur(calc.canSpend)}</strong> este mes manteniendo tu meta.
        </div>
      </Section>

      {/* FIXED */}
      <Section title="Gastos fijos" icon={Repeat} accent={C.blue} total={calc.fixedTotal}>
        {FIXED_CATS.map((c) => (
          <Row key={c.key} label={c.label}>
            <MoneyInput ariaLabel={c.label} value={month.fixed[c.key]} accent={C.coral} onCommit={(v) => setFixed(c.key, v)} />
          </Row>
        ))}
      </Section>

      {/* VARIABLE */}
      <Section title="Gastos variables" icon={Receipt} accent={C.lilac} total={calc.variableTotal}>
        {VARIABLE_CATS.map((c) => (
          <Row key={c.key} label={c.label}>
            <MoneyInput ariaLabel={c.label} value={month.variable[c.key]} accent={C.coral} onCommit={(v) => setVariable(c.key, v)} />
          </Row>
        ))}
      </Section>

      {/* BREAKDOWN */}
      {breakdown.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2><BarChart3 size={16} /> Reparto de gastos</h2></div>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={breakdown} dataKey="value" nameKey="label" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none">
                  {breakdown.map((d) => <Cell key={d.key} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v) => eur(v)} contentStyle={{ borderRadius: 12, border: `1px solid ${C.line}`, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryRow({ label, value, color, strong }) {
  return (
    <div className={`sum-row ${strong ? "strong" : ""}`}>
      <span>{label}</span><span style={{ color }}>{eur(value)}</span>
    </div>
  );
}

function Section({ title, icon: Icon, accent, total, children }) {
  return (
    <section className="section">
      <div className="section-head">
        <div className="section-title"><span className="section-ico" style={{ background: accent }}><Icon size={15} /></span>{title}</div>
        <div className="section-total">{eur(total)}</div>
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}

function Row({ label, children, onDelete }) {
  return (
    <div className="row">
      <div className="row-label">{label}</div>
      <div className="row-control">
        {children}
        {onDelete && <button className="row-del" onClick={onDelete} aria-label="Eliminar"><Trash2 size={15} /></button>}
      </div>
    </div>
  );
}

/* ============================================================
   YEAR VIEW
   ============================================================ */
function YearView({ yearCalc, year, onBack }) {
  const monthly = yearCalc.perMonth.map((c, i) => ({
    name: MONTHS[i].slice(0, 3), Ingresos: c.incomeTotal, Gastos: c.expensesTotal, Ahorro: c.endOfMonthSavings,
  }));
  const rate = yearCalc.incomeTotal > 0 ? Math.round((yearCalc.savingsTotal / yearCalc.incomeTotal) * 100) : 0;
  const cats = yearCalc.byCategory.filter((c) => c.total > 0);

  return (
    <div className="view fade">
      <div className="month-head">
        <button className="icon-btn" onClick={onBack} aria-label="Volver"><ArrowLeft size={18} /></button>
        <div className="month-nav"><h1>Total {year}</h1></div>
      </div>

      <section className="summary-card">
        <div className="summary-main">
          <div className="summary-label">Ahorro total del año</div>
          <div className="summary-figure" style={{ color: C.mint }}>{eur(yearCalc.savingsTotal)}</div>
          <div className="summary-tag ok"><Sparkles size={13} /> Tasa de ahorro {rate}%</div>
        </div>
        <div className="summary-side">
          <SummaryRow label="Ingresos" value={yearCalc.incomeTotal} color={C.mint} />
          <SummaryRow label="Gastos" value={yearCalc.expensesTotal} color={C.coral} />
          <SummaryRow label="Meta marcada" value={yearCalc.goalTotal} color={C.ink} />
          <div className="summary-divider" />
          <SummaryRow label="Fijos" value={yearCalc.fixedTotal} color={C.blue} />
          <SummaryRow label="Variables" value={yearCalc.variableTotal} color={C.lilac} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2><BarChart3 size={16} /> Ingresos vs Gastos</h2></div>
        <div className="chart">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v} />
              <Tooltip formatter={(v) => eur(v)} contentStyle={{ borderRadius: 12, border: `1px solid ${C.line}`, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Ingresos" fill={C.mint} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Gastos" fill={C.coral} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {cats.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2><Receipt size={16} /> Gastos por categoría</h2></div>
          <div className="cat-list">
            {cats.sort((a, b) => b.total - a.total).map((c, i) => {
              const pct = yearCalc.expensesTotal > 0 ? (c.total / yearCalc.expensesTotal) * 100 : 0;
              return (
                <div key={c.key} className="cat-row">
                  <div className="cat-row-top">
                    <span className="cat-name"><span className="cat-dot" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />{c.label}</span>
                    <span className="cat-val">{eur(c.total)}</span>
                  </div>
                  <div className="cat-track"><div className="cat-fill" style={{ width: `${pct}%`, background: CAT_COLORS[i % CAT_COLORS.length] }} /></div>
                  <div className="cat-pct">{pct.toFixed(0)}% · {c.group === "fixed" ? "fijo" : "variable"}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/* ============================================================
   BOTTOM NAV
   ============================================================ */
function BottomNav({ route, setRoute }) {
  const items = [
    { name: "dashboard", label: "Inicio", icon: Home },
    { name: "year", label: "Año", icon: BarChart3 },
  ];
  return (
    <nav className="bottom-nav">
      {items.map((it) => (
        <button
          key={it.name}
          className={`nav-item ${route.name === it.name ? "active" : ""}`}
          onClick={() => setRoute({ name: it.name })}
        >
          <it.icon size={20} /><span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

/* ============================================================
   STYLES
   ============================================================ */
function Style() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      .app { min-height: 100vh; background: ${C.paper}; color: ${C.ink};
        font-family: 'Inter', system-ui, sans-serif; padding-bottom: 78px;
        background-image: radial-gradient(${C.line} 0.5px, transparent 0.5px); background-size: 22px 22px; }
      .main { max-width: 760px; margin: 0 auto; padding: 16px; }
      @media (min-width: 760px) { .main { padding: 28px 16px; } }
      .fade { animation: fade .35s ease; }
      @keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

      /* HEADER */
      .header { position: sticky; top: 0; z-index: 20; background: ${C.paper}EE;
        backdrop-filter: blur(8px); border-bottom: 1px solid ${C.line}; }
      .header-inner { max-width: 760px; margin: 0 auto; padding: 12px 16px;
        display: flex; align-items: center; gap: 12px; }
      .brand { display: flex; align-items: center; gap: 9px; background: none; border: none;
        cursor: pointer; padding: 0; color: ${C.ink}; }
      .brand-mark { width: 34px; height: 34px; border-radius: 11px; background: ${C.mint};
        color: #fff; display: grid; place-items: center; }
      .brand-text { font-family: 'Fraunces', serif; font-weight: 600; font-size: 20px; }
      .brand-dot { color: ${C.coral}; }
      .year-switch { margin-left: auto; display: flex; align-items: center; gap: 2px;
        background: ${C.card}; border: 1px solid ${C.line}; border-radius: 12px; padding: 3px; }
      .year-switch button { background: none; border: none; cursor: pointer; padding: 5px;
        color: ${C.inkSoft}; border-radius: 8px; display: grid; place-items: center; }
      .year-switch button:hover { background: ${C.paper}; color: ${C.ink}; }
      .year-label { font-family: 'Fraunces', serif; font-weight: 600; font-size: 15px; padding: 0 6px; min-width: 46px; text-align: center; }
      .save-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600;
        color: ${C.mint}; background: ${C.mintSoft}; padding: 5px 9px; border-radius: 20px;
        opacity: 0; transform: scale(.9); transition: all .3s ease; }
      .save-pill.on { opacity: 1; transform: scale(1); }

      /* HERO */
      .hero { background: linear-gradient(150deg, ${C.ink} 0%, #243531 100%); color: #fff;
        border-radius: 22px; padding: 26px 22px; margin-bottom: 16px; position: relative; overflow: hidden; }
      .hero::after { content: ""; position: absolute; right: -40px; top: -40px; width: 180px; height: 180px;
        background: radial-gradient(${C.mint}55, transparent 70%); border-radius: 50%; }
      .hero-eyebrow { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #ffffff99; font-weight: 600; }
      .hero-figure { font-family: 'Fraunces', serif; font-size: clamp(40px, 11vw, 60px); font-weight: 600;
        line-height: 1; margin: 8px 0 6px; letter-spacing: -.02em; }
      .hero-sub { color: #ffffffcc; font-size: 13.5px; margin: 0 0 18px; }
      .hero-bars { display: flex; flex-direction: column; gap: 11px; position: relative; z-index: 1; }
      .hero-bar-row { display: flex; justify-content: space-between; font-size: 12.5px; color: #ffffffdd; margin-bottom: 5px; font-weight: 500; }
      .hero-bar-track { height: 7px; background: #ffffff22; border-radius: 6px; overflow: hidden; }
      .hero-bar-fill { height: 100%; border-radius: 6px; transition: width .6s cubic-bezier(.2,.8,.2,1); }

      /* STATS */
      .quick-stats { display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 16px; }
      @media (min-width: 560px) { .quick-stats { grid-template-columns: repeat(3, 1fr); } }
      .stat { display: flex; gap: 12px; align-items: center; background: ${C.card};
        border: 1px solid ${C.line}; border-radius: 16px; padding: 14px 15px; }
      .stat-ico { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; }
      .stat-label { font-size: 11.5px; color: ${C.inkSoft}; font-weight: 500; }
      .stat-value { font-family: 'Fraunces', serif; font-size: 19px; font-weight: 600; margin-top: 1px; }
      .stat-hint { font-size: 10.5px; color: ${C.inkSoft}; margin-top: 2px; }

      /* PANELS */
      .panel { background: ${C.card}; border: 1px solid ${C.line}; border-radius: 18px; padding: 16px; margin-bottom: 16px; }
      .panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
      .panel-head h2 { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; margin: 0;
        display: flex; align-items: center; gap: 7px; color: ${C.ink}; }
      .panel-head h2 svg { color: ${C.inkSoft}; }
      .link { background: none; border: none; color: ${C.mint}; font-weight: 600; font-size: 12.5px; cursor: pointer; }
      .chart { margin: 0 -6px; }

      /* MONTH GRID */
      .month-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
      @media (min-width: 560px) { .month-grid { grid-template-columns: repeat(3, 1fr); } }
      .month-card { text-align: left; background: ${C.paper}; border: 1px solid ${C.line};
        border-radius: 14px; padding: 13px; cursor: pointer; transition: all .18s ease; }
      .month-card:hover { transform: translateY(-2px); border-color: ${C.mint}; box-shadow: 0 6px 18px #1c282610; }
      .month-card.is-current { border-color: ${C.mint}; background: ${C.mintSoft}40; }
      .month-card.is-over { border-color: ${C.coral}55; }
      .month-card-top { display: flex; align-items: center; justify-content: space-between; }
      .month-name { font-weight: 600; font-size: 13px; }
      .badge-now { font-size: 9px; font-weight: 700; color: ${C.mint}; background: ${C.mintSoft};
        padding: 2px 6px; border-radius: 10px; text-transform: uppercase; letter-spacing: .04em; }
      .month-card-fig { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; margin: 6px 0 2px; }
      .month-card-sub { font-size: 11px; font-weight: 600; display: flex; gap: 5px; align-items: center; }
      .dot-sep { color: ${C.line}; }
      .mini-meter { height: 4px; background: ${C.line}; border-radius: 4px; margin-top: 9px; overflow: hidden; }
      .mini-meter.empty { opacity: .5; }
      .mini-meter-fill { height: 100%; border-radius: 4px; }

      /* MONTH HEAD */
      .month-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
      .month-nav { display: flex; align-items: center; gap: 8px; flex: 1; justify-content: center; }
      .month-nav h1 { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; margin: 0; }
      .month-nav .muted { color: ${C.inkSoft}; font-weight: 500; }
      .icon-btn { width: 38px; height: 38px; border-radius: 12px; border: 1px solid ${C.line};
        background: ${C.card}; cursor: pointer; display: grid; place-items: center; color: ${C.ink}; flex-shrink: 0; }
      .icon-btn:hover { background: ${C.paper}; }

      /* SUMMARY CARD */
      .summary-card { background: ${C.card}; border: 1px solid ${C.line}; border-radius: 20px;
        padding: 20px; margin-bottom: 14px; display: grid; grid-template-columns: 1fr; gap: 18px; }
      @media (min-width: 560px) { .summary-card { grid-template-columns: 1.1fr 1fr; align-items: center; } }
      .summary-label { font-size: 12px; color: ${C.inkSoft}; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
      .summary-figure { font-family: 'Fraunces', serif; font-size: clamp(34px, 9vw, 46px); font-weight: 600; line-height: 1; margin: 6px 0 12px; letter-spacing: -.02em; }
      .summary-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; padding: 6px 11px; border-radius: 20px; }
      .summary-tag.ok { color: ${C.mint}; background: ${C.mintSoft}; }
      .summary-tag.warn { color: ${C.coral}; background: ${C.coralSoft}; }
      .summary-side { display: flex; flex-direction: column; gap: 9px;
        background: ${C.paper}; border-radius: 14px; padding: 15px; }
      .sum-row { display: flex; justify-content: space-between; font-size: 13.5px; font-weight: 500; color: ${C.inkSoft}; }
      .sum-row span:last-child { font-weight: 600; font-variant-numeric: tabular-nums; }
      .sum-row.strong { font-size: 15px; } .sum-row.strong span { font-weight: 700; }
      .summary-divider { height: 1px; background: ${C.line}; margin: 3px 0; }

      /* SPEND METER */
      .spend-meter-wrap { margin-bottom: 18px; padding: 0 2px; }
      .spend-meter { height: 9px; background: ${C.line}; border-radius: 6px; overflow: hidden; }
      .spend-meter-fill { height: 100%; border-radius: 6px; transition: width .5s cubic-bezier(.2,.8,.2,1); }
      .spend-meter-cap { display: flex; justify-content: space-between; font-size: 11.5px; color: ${C.inkSoft}; margin-top: 6px; font-weight: 500; }

      /* SECTIONS */
      .section { background: ${C.card}; border: 1px solid ${C.line}; border-radius: 18px; margin-bottom: 14px; overflow: hidden; }
      .section-head { display: flex; align-items: center; justify-content: space-between; padding: 15px 16px 11px; }
      .section-title { display: flex; align-items: center; gap: 9px; font-family: 'Fraunces', serif; font-weight: 600; font-size: 16px; }
      .section-ico { width: 28px; height: 28px; border-radius: 9px; color: #fff; display: grid; place-items: center; }
      .section-total { font-family: 'Fraunces', serif; font-weight: 600; font-size: 16px; font-variant-numeric: tabular-nums; }
      .section-body { padding: 0 16px 8px; }
      .row { display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 11px 0; border-top: 1px solid ${C.line}; }
      .row:first-child { border-top: none; }
      .row-label { font-size: 14px; color: ${C.ink}; font-weight: 500; flex: 1; min-width: 0; }
      .row-control { display: flex; align-items: center; gap: 6px; }
      .money-input { width: 120px; text-align: right; border: 1px solid transparent; background: ${C.paper};
        border-radius: 10px; padding: 9px 11px; font-size: 14.5px; font-weight: 600; font-family: 'Inter', sans-serif;
        font-variant-numeric: tabular-nums; outline: none; transition: all .15s ease; }
      .money-input:focus { border-color: ${C.mint}; background: #fff; box-shadow: 0 0 0 3px ${C.mintSoft}; }
      .label-edit { border: none; background: none; font-size: 14px; font-weight: 500; color: ${C.ink};
        font-family: 'Inter', sans-serif; outline: none; border-bottom: 1px dashed ${C.line}; padding: 2px 0; max-width: 150px; }
      .label-edit:focus { border-bottom-color: ${C.mint}; }
      .row-del { background: none; border: none; color: ${C.inkSoft}; cursor: pointer; padding: 6px; border-radius: 8px; display: grid; place-items: center; }
      .row-del:hover { color: ${C.coral}; background: ${C.coralSoft}; }
      .add-row { display: flex; align-items: center; gap: 6px; background: none; border: 1px dashed ${C.line};
        color: ${C.mint}; font-weight: 600; font-size: 13px; cursor: pointer; padding: 10px; width: 100%;
        justify-content: center; border-radius: 11px; margin: 6px 0 10px; }
      .add-row:hover { background: ${C.mintSoft}40; border-color: ${C.mint}; }
      .goal-note { font-size: 12.5px; color: ${C.inkSoft}; padding: 10px 0 12px; line-height: 1.5; }
      .goal-note strong { color: ${C.gold}; }

      .donut-wrap { margin: 0 -6px; }

      /* CAT LIST */
      .cat-list { display: flex; flex-direction: column; gap: 14px; }
      .cat-row-top { display: flex; justify-content: space-between; font-size: 13.5px; font-weight: 500; margin-bottom: 6px; }
      .cat-name { display: flex; align-items: center; gap: 7px; }
      .cat-dot { width: 9px; height: 9px; border-radius: 3px; }
      .cat-val { font-weight: 600; font-variant-numeric: tabular-nums; }
      .cat-track { height: 7px; background: ${C.line}; border-radius: 6px; overflow: hidden; }
      .cat-fill { height: 100%; border-radius: 6px; transition: width .5s ease; }
      .cat-pct { font-size: 10.5px; color: ${C.inkSoft}; margin-top: 4px; font-weight: 500; }

      /* BOTTOM NAV */
      .bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; z-index: 20;
        background: ${C.card}F2; backdrop-filter: blur(10px); border-top: 1px solid ${C.line};
        display: flex; justify-content: center; gap: 8px; padding: 8px 16px calc(8px + env(safe-area-inset-bottom)); }
      .nav-item { display: flex; flex-direction: column; align-items: center; gap: 2px; background: none;
        border: none; cursor: pointer; color: ${C.inkSoft}; font-size: 10.5px; font-weight: 600;
        padding: 6px 22px; border-radius: 12px; transition: all .15s ease; }
      .nav-item.active { color: ${C.mint}; background: ${C.mintSoft}60; }

      input:focus-visible, button:focus-visible { outline: 2px solid ${C.mint}; outline-offset: 2px; }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    `}</style>
  );
}
