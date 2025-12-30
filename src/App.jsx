import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Trash2, Calculator, PieChart, Calendar, ArrowRight, 
  CheckCircle, Info, TrendingDown 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer, ComposedChart, Area, Line
} from 'recharts';

// --- KONFIGURACJA GOOGLE ANALYTICS ---
const GA_TRACKING_ID = "G-PTJBYECCTB"; 

// --- Helper Functions ---
const formatCurrency = (value) => {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(value);
};

// --- Calculation Logic ---
const calculateLoan = (scenario, globalWibor, globalInflation) => {
  const amount = parseFloat(scenario.amount) || 0;
  const periodMonths = parseInt(scenario.periodMonths) || 1;
  const isOwnFunds = scenario.name.toLowerCase().includes("środków własnych");

  // Logika dla finansowania ze środków własnych (Koszty alternatywne)
  if (isOwnFunds) {
    // Oprocentowanie domyślne to inflacja, chyba że użytkownik wpisał własne w polu fixedRate
    const annualRate = (parseFloat(scenario.fixedRate) || globalInflation) / 100;
    const years = periodMonths / 12;
    // FV = PV * (1 + r)^n -> Utracone korzyści = FV - PV
    const opportunityCost = amount * Math.pow(1 + annualRate, years) - amount;
    
    return {
      ...scenario,
      effectiveRate: 0,
      schedule: [],
      summary: {
        loanAmount: 0,
        ownContribution: amount,
        totalInterest: 0,
        totalStartCosts: amount,
        grantAmount: 0,
        opportunityCost: opportunityCost,
        totalCostProject: amount + opportunityCost,
        npvTotal: amount, // Realny koszt PV = Nominalny, bo wydajemy dzisiaj
        realBenefit: 0
      }
    };
  }

  // Logika dla kredytów i pożyczek
  const graceMonths = parseInt(scenario.graceMonths) || 0;
  const commissionPercent = parseFloat(scenario.commissionPercent) || 0;
  const otherCosts = (scenario.otherCosts || []).reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
  
  let interestRate = scenario.rateType === 'fixed' 
    ? (parseFloat(scenario.fixedRate) || 0) 
    : ((parseFloat(scenario.margin) || 0) + globalWibor);

  let grantAmount = scenario.grantType === 'percent' 
    ? amount * ((parseFloat(scenario.grantValue) || 0) / 100) 
    : (parseFloat(scenario.grantValue) || 0);

  const r = interestRate / 100 / 12;
  const effectiveInflation = scenario.ignoreInflation ? 0 : (parseFloat(globalInflation) || 0);
  const inflationRateMonthly = Math.pow(1 + effectiveInflation / 100, 1/12) - 1;

  let schedule = [];
  let currentBalance = amount;
  let totalInterest = 0;
  const repaymentMonths = periodMonths - graceMonths;
  const initialOutflow = (amount * (commissionPercent / 100)) + otherCosts;
  
  let npvSum = initialOutflow - grantAmount; 

  for (let month = 1; month <= periodMonths; month++) {
    let interestPart = currentBalance * r;
    let capitalPart = 0;
    let installment = 0;

    if (month > graceMonths) {
      if (scenario.installmentType === 'equal') {
        const fixedInstallment = r === 0 ? amount / repaymentMonths : amount * (r * Math.pow(1 + r, repaymentMonths)) / (Math.pow(1 + r, repaymentMonths) - 1);
        capitalPart = fixedInstallment - interestPart;
      } else {
        capitalPart = amount / repaymentMonths;
      }
      installment = capitalPart + interestPart;
    } else {
      installment = interestPart;
    }

    if (currentBalance - capitalPart < 0.01 || month === periodMonths) {
        capitalPart = currentBalance;
        installment = capitalPart + interestPart;
    }

    currentBalance -= capitalPart;
    totalInterest += interestPart;
    
    // Dyskontowanie raty do wartości dzisiejszej (PV)
    npvSum += installment * (1 / Math.pow(1 + inflationRateMonthly, month));

    schedule.push({ month, interestPart, capitalPart, installment, remainingBalance: Math.max(0, currentBalance) });
  }

  const totalCost = initialOutflow + totalInterest + amount - grantAmount;

  return {
    ...scenario,
    effectiveRate: interestRate,
    schedule,
    summary: {
      loanAmount: amount,
      totalInterest,
      totalStartCosts: initialOutflow, 
      grantAmount,
      opportunityCost: 0,
      totalCostProject: totalCost,
      npvTotal: npvSum, 
      realBenefit: amount - npvSum 
    }
  };
};

// --- Komponenty UI ---

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible ${className}`}>
    {children}
  </div>
);

const Tooltip = ({ text }) => (
  <div className="group relative inline-block ml-1 align-middle z-50">
    <Info className="w-3 h-3 text-slate-400 cursor-help" />
    <div className="invisible group-hover:visible absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-slate-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-64 text-center shadow-lg pointer-events-none font-normal normal-case leading-normal z-50">
      {text}
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
    </div>
  </div>
);

// --- MAIN APP ---

export default function App() {
  // Google Analytics - Wstrzykiwanie skryptu
  useEffect(() => {
    if (GA_TRACKING_ID) {
      const script1 = document.createElement("script");
      script1.async = true;
      script1.src = `https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`;
      document.head.appendChild(script1);

      const script2 = document.createElement("script");
      script2.innerHTML = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${GA_TRACKING_ID}');
      `;
      document.head.appendChild(script2);
    }
  }, []);

  const [globalWibor, setGlobalWibor] = useState(4.02);
  const [globalInflation, setGlobalInflation] = useState(3.0); 
  const [activeTab, setActiveTab] = useState('compare');
  const [selectedScenarioId, setSelectedScenarioId] = useState(null);

  const [scenarios, setScenarios] = useState([
    { id: 1, name: 'Pożyczka unijna z FKIP', amount: 1000000, periodMonths: 120, graceMonths: 0, rateType: 'fixed', fixedRate: 1.0, margin: 0, commissionPercent: 0, otherCosts: [], installmentType: 'decreasing', grantType: 'percent', grantValue: 20, ignoreInflation: false },
    { id: 2, name: 'Kredyt komercyjny', amount: 1000000, periodMonths: 120, graceMonths: 0, rateType: 'wibor', fixedRate: 7.5, margin: 2.5, commissionPercent: 1, otherCosts: [], installmentType: 'decreasing', grantType: 'amount', grantValue: 0, ignoreInflation: false },
    { id: 3, name: 'Finansowanie inwestycji ze środków własnych', amount: 1000000, periodMonths: 120, graceMonths: 0, rateType: 'fixed', fixedRate: 3.0, margin: 0, commissionPercent: 0, otherCosts: [], installmentType: 'decreasing', grantType: 'amount', grantValue: 0, ignoreInflation: false }
  ]);

  const updateScenario = (id, field, value) => {
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const addScenario = () => {
    const newId = Math.max(...scenarios.map(s => s.id), 0) + 1;
    setScenarios([...scenarios, { 
      id: newId, 
      name: `Opcja #${newId}`,
      amount: 1000000,
      periodMonths: 120,
      graceMonths: 0,
      rateType: 'wibor',
      fixedRate: 7.5,
      margin: 2.5,
      commissionPercent: 1.0,
      otherCosts: [],
      installmentType: 'decreasing',
      grantType: 'amount',
      grantValue: 0,
      ignoreInflation: false
    }]);
  };

  const removeScenario = (id) => scenarios.length > 1 && setScenarios(scenarios.filter(s => s.id !== id));

  const results = useMemo(() => scenarios.map(s => calculateLoan(s, globalWibor, globalInflation)), [scenarios, globalWibor, globalInflation]);
  const bestOption = useMemo(() => results.reduce((prev, curr) => (prev.summary.totalCostProject < curr.summary.totalCostProject ? prev : curr)), [results]);
  const worstOption = useMemo(() => results.reduce((prev, curr) => (prev.summary.totalCostProject > curr.summary.totalCostProject ? prev : curr)), [results]);
  const savingsAmount = worstOption.summary.totalCostProject - bestOption.summary.totalCostProject;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      <header className="bg-blue-900 text-white p-6 shadow-lg sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <Calculator className="w-8 h-8 text-blue-300" />
            <h1 className="text-2xl font-bold">FinansePro: Analiza FKIP</h1>
          </div>
          <div className="flex gap-4 items-center">
            <div className="bg-blue-800 px-4 py-2 rounded-lg border border-blue-700 text-xs">
                <span>WIBOR 3M:</span>
                <input type="number" step="0.01" value={globalWibor} onChange={(e) => setGlobalWibor(parseFloat(e.target.value) || 0)} className="w-16 bg-white text-slate-900 rounded mx-1 font-bold text-center" /> %
            </div>
            <div className="bg-indigo-800 px-4 py-2 rounded-lg border border-indigo-700 text-xs">
                <span>Inflacja:</span>
                <input type="number" step="0.1" value={globalInflation} onChange={(e) => setGlobalInflation(parseFloat(e.target.value) || 0)} className="w-16 bg-white text-slate-900 rounded mx-1 font-bold text-center" /> %
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        
        {/* LEWA: Formularz */}
        <div className="lg:col-span-5 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><ArrowRight className="w-5 h-5 text-blue-600" /> Parametry Ofert</h2>
            <button onClick={addScenario} className="text-xs bg-emerald-600 text-white px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-sm font-medium">
              <Plus className="w-3 h-3" /> Dodaj wariant
            </button>
          </div>
          <div className="space-y-4">
            {scenarios.map((s) => {
              const isOwnFunds = s.name.toLowerCase().includes("środków własnych");
              return (
                <Card key={s.id} className={`border-l-4 p-4 ${isOwnFunds ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
                <div className="flex justify-between items-start mb-4">
                    <input type="text" value={s.name} onChange={(e) => updateScenario(s.id, 'name', e.target.value)} className="font-bold text-blue-900 bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none w-full mr-2" />
                    {scenarios.length > 1 && <button onClick={() => removeScenario(s.id)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Kwota</label>
                        <input type="number" value={s.amount} onChange={(e) => updateScenario(s.id, 'amount', parseFloat(e.target.value) || 0)} className="w-full p-2 border border-slate-300 rounded mt-1 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm" />
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Czas trwania (m-ce)</label>
                        <input type="number" value={s.periodMonths} onChange={(e) => updateScenario(s.id, 'periodMonths', parseInt(e.target.value) || 1)} className="w-full p-2 border border-slate-300 rounded mt-1 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm" />
                    </div>

                    {isOwnFunds ? (
                      <div className="col-span-2 bg-amber-50 p-3 rounded-lg border border-amber-200">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-amber-800 uppercase flex items-center gap-1">
                            Oprocentowanie lokaty / Inflacja
                            <Tooltip text="Stopa zysku, którą Twoje pieniądze wypracowałyby na bezpiecznej lokacie lub obligacjach, gdyby nie sfinansowały tej inwestycji." />
                          </label>
                          <div className="flex items-center gap-1">
                            <input type="number" step="0.1" value={s.fixedRate} onChange={(e) => updateScenario(s.id, 'fixedRate', parseFloat(e.target.value) || 0)} className="w-16 p-1 border border-amber-300 rounded text-sm text-center font-bold" /> %
                          </div>
                        </div>
                        <p className="text-[10px] text-amber-700 mt-2 italic">Koszt utraconych korzyści jest doliczany do całkowitego kosztu nominalnego.</p>
                      </div>
                    ) : (
                      <>
                        <div className="col-span-2 bg-slate-50 p-2 rounded border text-[11px]">
                            <div className="flex gap-4 mb-1">
                                <label className="flex items-center gap-1 cursor-pointer"><input type="radio" checked={s.rateType === 'wibor'} onChange={() => updateScenario(s.id, 'rateType', 'wibor')} /> WIBOR + Marża</label>
                                <label className="flex items-center gap-1 cursor-pointer"><input type="radio" checked={s.rateType === 'fixed'} onChange={() => updateScenario(s.id, 'rateType', 'fixed')} /> Stałe</label>
                            </div>
                            {s.rateType === 'wibor' ? (
                                <div className="flex items-center gap-2">
                                    <input type="number" step="0.01" value={s.margin} onChange={(e) => updateScenario(s.id, 'margin', parseFloat(e.target.value) || 0)} className="w-16 p-0.5 border rounded" />
                                    <span>% marży + {globalWibor}% WIBOR</span>
                                </div>
                            ) : (
                                <input type="number" step="0.01" value={s.fixedRate} onChange={(e) => updateScenario(s.id, 'fixedRate', parseFloat(e.target.value) || 0)} className="w-16 p-0.5 border rounded" />
                            )}
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase">Prowizja (%)</label>
                            <input type="number" step="0.01" value={s.commissionPercent} onChange={(e) => updateScenario(s.id, 'commissionPercent', parseFloat(e.target.value) || 0)} className="w-full p-1.5 border border-slate-300 rounded text-sm" />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase">Karencja (m-ce)</label>
                            <input type="number" value={s.graceMonths} onChange={(e) => updateScenario(s.id, 'graceMonths', parseInt(e.target.value) || 0)} className="w-full p-1.5 border border-slate-300 rounded text-sm" />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Typ rat</label>
                            <div className="flex gap-4">
                              <label className="flex items-center gap-1 cursor-pointer text-xs"><input type="radio" checked={s.installmentType === 'equal'} onChange={() => updateScenario(s.id, 'installmentType', 'equal')} /> Równe</label>
                              <label className="flex items-center gap-1 cursor-pointer text-xs"><input type="radio" checked={s.installmentType === 'decreasing'} onChange={() => updateScenario(s.id, 'installmentType', 'decreasing')} /> Malejące</label>
                            </div>
                        </div>
                        <div className="col-span-2 border-t pt-2 mt-1">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-[10px] text-emerald-600 font-bold uppercase">Umorzenie / Dotacja</label>
                                <select value={s.grantType} onChange={(e) => updateScenario(s.id, 'grantType', e.target.value)} className="text-[9px] border rounded bg-white">
                                    <option value="amount">Kwota PLN</option>
                                    <option value="percent">% Kapitału</option>
                                </select>
                            </div>
                            <input type="number" value={s.grantValue} onChange={(e) => updateScenario(s.id, 'grantValue', parseFloat(e.target.value) || 0)} className="w-full p-1.5 border border-emerald-200 bg-emerald-50 rounded font-bold text-emerald-700" />
                        </div>
                      </>
                    )}
                    <div className="col-span-2 pt-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={s.ignoreInflation} onChange={(e) => updateScenario(s.id, 'ignoreInflation', e.target.checked)} />
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Ignoruj wpływ inflacji przy NPV</span>
                        </label>
                    </div>
                </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* PRAWA: Wyniki */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-1 flex">
                <button onClick={() => setActiveTab('compare')} className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all ${activeTab === 'compare' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>Porównanie Ofert</button>
                <button onClick={() => setActiveTab('schedule')} className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all ${activeTab === 'schedule' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>Harmonogram</button>
          </div>

          {activeTab === 'compare' && (
            <div className="space-y-6">
                <Card className="bg-gradient-to-br from-emerald-600 to-emerald-800 text-white p-6 relative overflow-visible">
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <div className="flex items-center gap-2 text-emerald-100 text-xs font-bold uppercase mb-2"><CheckCircle className="w-4 h-4" /> Najkorzystniejszy wariant</div>
                            <h3 className="text-3xl font-bold leading-tight text-white">{bestOption.name}</h3>
                        </div>
                        {savingsAmount > 1 && (
                            <div className="bg-emerald-500/30 backdrop-blur-md border border-emerald-400/30 p-4 rounded-xl text-right shadow-lg">
                                <div className="text-[10px] text-emerald-100 uppercase font-bold mb-1">Zyskujesz względem najdroższej opcji</div>
                                <div className="text-3xl font-black text-white">{formatCurrency(savingsAmount)}</div>
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-emerald-500/30 relative z-10">
                        <div>
                            <div className="text-xs text-emerald-200 uppercase font-bold opacity-80 mb-1">Łączny koszt finansowy</div>
                            <div className="text-2xl font-bold text-white">{formatCurrency(bestOption.summary.totalCostProject)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-emerald-200 uppercase font-bold flex items-center gap-1 opacity-80 mb-1">
                                Realny koszt (PV) 
                                <Tooltip text="Wartość dzisiejsza wszystkich przyszłych płatności skorygowana o inflację. Dla środków własnych PV = Nominalny, bo wydatek jest dzisiaj." />
                            </div>
                            <div className="text-2xl font-bold text-white">{formatCurrency(bestOption.summary.npvTotal)}</div>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 text-slate-500 uppercase border-b">
                                <tr>
                                    <th className="p-4">Wariant</th>
                                    <th className="p-4 text-emerald-600 font-bold">Umorzenie / Dotacja</th>
                                    <th className="p-4">Odsetki / Utracony zysk</th>
                                    <th className="p-4">Koszt Całkowity</th>
                                    <th className="p-4 text-right">Realny (PV)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {results.map(r => (
                                    <tr key={r.id} className={r.id === bestOption.id ? "bg-emerald-50" : "hover:bg-slate-50 transition-colors"}>
                                        <td className="p-4">
                                            <div className="font-bold text-slate-700">{r.name}</div>
                                            <div className="text-[10px] text-slate-400">{r.summary.loanAmount > 0 ? `RRSO: ${r.effectiveRate.toFixed(2)}%` : 'Gotówka'}</div>
                                        </td>
                                        <td className="p-4 font-bold text-emerald-600">
                                          {r.summary.grantAmount > 0 ? `-${formatCurrency(r.summary.grantAmount)}` : "-"}
                                        </td>
                                        <td className="p-4">
                                          {r.summary.opportunityCost > 0 ? (
                                            <div className="flex flex-col">
                                              <span className="text-amber-600 font-bold">{formatCurrency(r.summary.opportunityCost)}</span>
                                              <span className="text-[9px] text-slate-400 italic">utracony zysk z lokaty *</span>
                                            </div>
                                          ) : (
                                            formatCurrency(r.summary.totalInterest)
                                          )}
                                        </td>
                                        <td className="p-4 font-bold text-slate-900">{formatCurrency(r.summary.totalCostProject)}</td>
                                        <td className="p-4 text-right text-slate-500 font-medium">
                                          {formatCurrency(r.summary.npvTotal)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-4 text-[10px] text-slate-500 bg-slate-50 border-t">
                        <strong>* Utracony zysk z lokaty:</strong> Dla środków własnych kosztem jest zysk, który te pieniądze mogłyby wypracować na bezpiecznej lokacie (oprocentowanej wg stopy inflacji) przez czas trwania inwestycji. Realny koszt (PV) gotówki jest równy kwocie nominalnej, gdyż pieniądze wydawane są w całości na początku (nie tracą na wartości w czasie w odniesieniu do harmonogramu spłat).
                    </div>
                </Card>

                {/* Wykres Composed */}
                <Card className="p-6 h-80">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Struktura Kosztów Projektu</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={results.map(r => ({
                          name: r.name,
                          'Kapitał / Wkład': r.summary.loanAmount > 0 ? r.summary.loanAmount : r.summary.totalStartCosts,
                          'Dodatkowe Koszty (Odsetki/Zysk)': r.summary.totalInterest + r.summary.opportunityCost,
                          'Prowizje': r.summary.loanAmount > 0 ? r.summary.totalStartCosts : 0
                        }))}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" tick={{fontSize: 9}} interval={0} />
                            <YAxis tickFormatter={(val) => `${val/1000}k`} tick={{fontSize: 10}} />
                            <RechartsTooltip formatter={(v) => formatCurrency(v)} />
                            <Legend iconType="circle" wrapperStyle={{fontSize: '10px'}} />
                            <Bar dataKey="Kapitał / Wkład" stackId="a" fill="#94a3b8" />
                            <Bar dataKey="Dodatkowe Koszty (Odsetki/Zysk)" stackId="a" fill="#3b82f6" />
                            <Bar dataKey="Prowizje" stackId="a" fill="#f59e0b" />
                        </ComposedChart>
                    </ResponsiveContainer>
                </Card>
            </div>
          )}

          {activeTab === 'schedule' && (
            <Card className="h-[600px] flex flex-col">
              <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                 <h3 className="font-bold text-slate-700 text-sm">Harmonogram spłat</h3>
                 <select value={selectedScenarioId || scenarios[0].id} onChange={(e) => setSelectedScenarioId(parseInt(e.target.value))} className="p-1 text-xs border rounded bg-white outline-none">
                    {scenarios.filter(s => !s.name.toLowerCase().includes("własne")).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                 </select>
              </div>
              <div className="overflow-auto flex-1">
                 {results.find(r => r.id === (selectedScenarioId || scenarios[0].id))?.schedule?.length > 0 ? (
                   <table className="w-full text-[11px] text-right">
                      <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                        <tr>
                          <th className="p-2 text-left">M-ce</th>
                          <th className="p-2">Rata całkowita</th>
                          <th className="p-2 text-blue-600">Odsetki</th>
                          <th className="p-2 text-emerald-600">Kapitał</th>
                          <th className="p-2">Pozostało</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {results.find(r => r.id === (selectedScenarioId || scenarios[0].id))?.schedule?.map((row) => (
                          <tr key={row.month} className="hover:bg-slate-50">
                            <td className="p-2 text-left font-medium">{row.month}</td>
                            <td className="p-2 font-bold">{formatCurrency(row.installment)}</td>
                            <td className="p-2 text-blue-600">{formatCurrency(row.interestPart)}</td>
                            <td className="p-2 text-emerald-600">{formatCurrency(row.capitalPart)}</td>
                            <td className="p-2 text-slate-400">{formatCurrency(row.remainingBalance)}</td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                 ) : (
                   <div className="p-12 text-center text-slate-500 italic">
                     Dla finansowania ze środków własnych nie generuje się harmonogramu spłat długu.
                   </div>
                 )}
              </div>
            </Card>
          )}
        </div>
      </main>
      <footer className="max-w-7xl mx-auto p-6 text-[10px] text-slate-400 italic text-center border-t mt-12">
          Zastrzeżenie: Wszystkie obliczone wartości mają charakter szacunkowy. Analiza uwzględnia inflację oraz koszt alternatywny kapitału. Wyniki nie stanowią oferty handlowej.
      </footer>
    </div>
  );
}