import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Trash2, Calculator, PieChart, Calendar, ArrowRight, CheckCircle, Info, TrendingDown, FileText, PlayCircle, Music, Download, Video, ExternalLink 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';

// --- KONFIGURACJA GOOGLE ANALYTICS ---
// Wklej tutaj swój identyfikator pomiaru (np. G-XXXXXXXXXX)
const GA_TRACKING_ID = "G-PTJBYECCTB"; 

// --- Helper Functions ---

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(value);
};

// --- Calculation Logic ---

const calculateLoan = (scenario, globalWibor, globalInflation) => {
  const amount = parseFloat(scenario.amount) || 0;
  const periodMonths = parseInt(scenario.periodMonths) || 1;
  const graceMonths = parseInt(scenario.graceMonths) || 0;
  const commissionPercent = parseFloat(scenario.commissionPercent) || 0;
  const otherCosts = scenario.otherCosts.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
  
  let interestRate = 0;
  if (scenario.rateType === 'fixed') {
    interestRate = parseFloat(scenario.fixedRate) || 0;
  } else {
    interestRate = (parseFloat(scenario.margin) || 0) + globalWibor;
  }

  let grantAmount = 0;
  if (scenario.grantType === 'percent') {
    grantAmount = amount * ((parseFloat(scenario.grantValue) || 0) / 100);
  } else {
    grantAmount = parseFloat(scenario.grantValue) || 0;
  }

  // Monthly rate
  const r = interestRate / 100 / 12;

  // Monthly inflation rate for NPV calculation
  const effectiveInflation = scenario.ignoreInflation ? 0 : (parseFloat(globalInflation) || 0);
  const inflationRate = effectiveInflation / 100;
  const r_inflation = Math.pow(1 + inflationRate, 1/12) - 1;

  let schedule = [];
  let currentBalance = amount;
  let totalInterest = 0;
  
  const repaymentMonths = periodMonths - graceMonths;

   // Initial costs
  const initialCommission = amount * (commissionPercent / 100);
  const totalStartCosts = initialCommission + otherCosts;
  
   // NPV Calculation
  let npvSum = (totalStartCosts - grantAmount); 

  for (let month = 1; month <= periodMonths; month++) {
    let interestPart = currentBalance * r;
    let capitalPart = 0;
    let installment = 0;

    if (month <= graceMonths) {
      capitalPart = 0;
      installment = interestPart;
    } else {
      if (scenario.installmentType === 'equal') {
        const n = repaymentMonths;
        if (r === 0) {
            capitalPart = currentBalance / (periodMonths - (month - 1));
            installment = capitalPart;
        } else {
             const fixedInstallment = amount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
             installment = fixedInstallment;
             capitalPart = installment - interestPart;
        }
      } else {
        const n = repaymentMonths;
        capitalPart = amount / n;
        installment = capitalPart + interestPart;
      }
    }

    if (currentBalance - capitalPart < 0.01 || month === periodMonths) {
        capitalPart = currentBalance;
        installment = capitalPart + interestPart;
    }

    currentBalance -= capitalPart;
    totalInterest += interestPart;

    const discountFactor = 1 / Math.pow(1 + r_inflation, month);
    const pvInstallment = installment * discountFactor;
    npvSum += pvInstallment;

    schedule.push({
      month, 
      interestPart, 
      capitalPart, 
      installment, 
      remainingBalance: Math.max(0, currentBalance)
    });
  }

  const totalCost = totalStartCosts + totalInterest + amount - grantAmount;
  const totalCostPercentage = (totalCost / amount) * 100;
  const realBenefit = amount - npvSum; 

  return {
    ...scenario,
    effectiveRate: interestRate,
    schedule,
    summary: {
      loanAmount: amount,
      totalInterest,
      totalStartCosts, 
      grantAmount,
      totalRepayed: totalInterest + amount, 
      totalCostProject: totalCost, 
      npvTotal: npvSum, 
      realBenefit: realBenefit 
    }
  };
};

// --- Components ---

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible ${className}`}>
    {children}
  </div>
);

const Tooltip = ({ text }) => (
  <div className="group relative inline-block ml-1">
    <Info className="w-4 h-4 text-slate-400 cursor-help" />
    <div className="invisible group-hover:visible absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-slate-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-64 text-center shadow-lg pointer-events-none">
      {text}
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
    </div>
  </div>
);

// --- MAIN APP ---

export default function App() {
  // Google Analytics Injection
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

  // Auto-fetch WIBOR
  useEffect(() => {
    const fetchWibor = async () => {
      try {
        // Using corsproxy.io to bypass CORS for stooq.pl CSV
        const response = await fetch('https://corsproxy.io/?https://stooq.pl/q/l/?s=plopln3m&f=sd2t2olc&h&e=csv');
        const text = await response.text();
        // CSV format: Symbol,Date,Time,Open,Low,Close (Close is the value we want, or Open/Low since it's an index usually same)
        // Example: PLOPLN3M,2025-12-23,12:00:00,4,4,4
        const lines = text.trim().split('\n');
        if (lines.length >= 2) {
          const values = lines[1].split(',');
          const wiborValue = parseFloat(values[values.length - 1]); // Last column is Close
          if (!isNaN(wiborValue)) {
             setGlobalWibor(wiborValue);
             console.log("WIBOR updated:", wiborValue);
          }
        }
      } catch (error) {
        console.warn("Failed to auto-fetch WIBOR:", error);
      }
    };
    fetchWibor();
  }, []);
  const [globalInflation, setGlobalInflation] = useState(3.0); 
  const [activeTab, setActiveTab] = useState('input'); 
  const [selectedScenarioId, setSelectedScenarioId] = useState(null); 

  const [scenarios, setScenarios] = useState([
    { id: 1, 
      name: 'Pożyczka unijna z FKIP', 
      amount: 500000, 
      periodMonths: 120, 
      graceMonths: 0, 
      rateType: 'fixed', 
      fixedRate: 0.5, 
      margin: 0.0, 
      commissionPercent: 0.0, 
      otherCosts: [], 
      installmentType: 'equal', 
      grantType: 'percent', 
      grantValue: 20, 
      ignoreInflation: false },

    { id: 2, 
      name: 'Kredyt komercyjny', 
      amount: 500000, 
      periodMonths: 120, 
      graceMonths: 0, 
      rateType: 'wibor', 
      fixedRate: 7.5, 
      margin: 2.5, 
      commissionPercent: 1, 
      otherCosts: [], 
      installmentType: 'equal', 
      grantType: 'amount', 
      grantValue: 0, 
      ignoreInflation: false }
  ]);

  const addScenario = () => {
    const newId = Math.max(...scenarios.map(s => s.id), 0) + 1;
    setScenarios([...scenarios, { ...scenarios[0], id: newId, name: `Opcja #${newId}` }]);
  };

  const removeScenario = (id) => scenarios.length > 1 && setScenarios(scenarios.filter(s => s.id !== id));

   const updateScenario = (id, field, value) => {
    setScenarios(scenarios.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const addOtherCost = (scenarioId) => {
    setScenarios(scenarios.map(s => {
      if (s.id === scenarioId) {
        return {
          ...s,
          otherCosts: [...s.otherCosts, { id: Date.now(), name: 'Inny koszt', value: 0 }]
        };
      }
      return s;
    }));
  };

  const updateOtherCost = (scenarioId, costId, field, value) => {
    setScenarios(scenarios.map(s => {
      if (s.id === scenarioId) {
        const newCosts = s.otherCosts.map(c => c.id === costId ? { ...c, [field]: value } : c);
        return { ...s, otherCosts: newCosts };
      }
      return s;
    }));
  };

  const removeOtherCost = (scenarioId, costId) => {
    setScenarios(scenarios.map(s => {
      if (s.id === scenarioId) {
        return { ...s, otherCosts: s.otherCosts.filter(c => c.id !== costId) };
      }
      return s;
    }));
  };

  const results = useMemo(() => {
    return scenarios.map(s => calculateLoan(s, globalWibor, globalInflation));
  }, [scenarios, globalWibor, globalInflation]);

  const bestOption = useMemo(() => {
    return results.reduce((prev, curr) => 
      (prev.summary.totalCostProject < curr.summary.totalCostProject) ? prev : curr
    );
  }, [results]);
  
  const worstOption = useMemo(() => {
    return results.reduce((prev, curr) => 
      (prev.summary.totalCostProject > curr.summary.totalCostProject) ? prev : curr
    );
  }, [results]);

  const savingsAmount = worstOption.summary.totalCostProject - bestOption.summary.totalCostProject;

  const chartData = results.map(r => ({
    name: r.name,
    'Odsetki': parseFloat(r.summary.totalInterest.toFixed(2)),
    'Koszty startowe': parseFloat(r.summary.totalStartCosts.toFixed(2)),
    'Kapitał (netto)': parseFloat((r.summary.loanAmount - r.summary.grantAmount).toFixed(2)),
    totalPayable: r.summary.totalCostProject
  }));
  
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      <header className="bg-blue-900 text-white p-6 shadow-lg sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <Calculator className="w-8 h-8 text-blue-300" />
            <h1 className="text-2xl font-bold tracking-tight">FinansePro: Porównywarka Ofert</h1>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-4 bg-blue-800 px-4 py-2 rounded-lg border border-blue-700">
                <span className="text-xs text-blue-200">WIBOR 3M:</span>
                <input type="number" value={globalWibor} onChange={(e) => setGlobalWibor(parseFloat(e.target.value))} className="w-12 bg-white text-slate-900 rounded text-center text-sm font-bold" />
                <span className="text-xs">%</span>
            </div>
            <div className="flex items-center gap-4 bg-indigo-800 px-4 py-2 rounded-lg border border-indigo-700">
                <span className="text-xs text-indigo-200">Inflacja:</span>
                <input type="number" value={globalInflation} onChange={(e) => setGlobalInflation(parseFloat(e.target.value))} className="w-12 bg-white text-slate-900 rounded text-center text-sm font-bold" />
                <span className="text-xs">%</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        
        {/* Left: Inputs */}
        <div className="lg:col-span-5 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-800">Parametry Ofert</h2>
            <button onClick={addScenario} className="text-xs bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 transition-all shadow-sm font-medium flex items-center gap-2">
              <Plus className="w-3 h-3" /> Dodaj wariant
            </button>
          </div>

          <div className="space-y-4">
            {scenarios.map((scenario) => (
              <Card key={scenario.id} className="border-l-4 border-l-blue-500 p-4">
                <div className="flex justify-between items-start mb-4">
                  <input type="text" value={scenario.name} onChange={(e) => updateScenario(scenario.id, 'name', e.target.value)} className="font-bold text-blue-900 bg-transparent border-b border-transparent hover:border-blue-200 focus:border-blue-500 focus:outline-none w-full mr-2" />
                  {scenarios.length > 1 && <button onClick={() => removeScenario(scenario.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase">Kwota (PLN)</label>
                    <input type="number" value={scenario.amount} onChange={(e) => updateScenario(scenario.id, 'amount', parseFloat(e.target.value))} className="w-full p-2 border border-slate-300 rounded text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase">Okres (m-ce)</label>
                    <input type="number" value={scenario.periodMonths} onChange={(e) => updateScenario(scenario.id, 'periodMonths', parseInt(e.target.value))} className="w-full p-2 border border-slate-300 rounded text-sm" />
                  </div>
                  <div className="col-span-2">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Umorzenie / Dotacja</label>
                      <select value={scenario.grantType} onChange={(e) => updateScenario(scenario.id, 'grantType', e.target.value)} className="text-[10px] border rounded p-0.5">
                        <option value="amount">PLN</option>
                        <option value="percent">%</option>
                      </select>
                    </div>
                    <input type="number" value={scenario.grantValue} onChange={(e) => updateScenario(scenario.id, 'grantValue', parseFloat(e.target.value))} className="w-full p-2 border border-emerald-200 bg-emerald-50 rounded text-sm font-bold text-emerald-700" />
                  </div>

                  {/* Restored Financial Parameters */}
                  <div className="col-span-2 border-t pt-2 mt-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Oprocentowanie</label>
                    <div className="flex gap-2 mb-2">
                        <button
                            onClick={() => updateScenario(scenario.id, 'rateType', 'wibor')}
                            className={`flex-1 text-xs py-1 rounded border transition-colors ${scenario.rateType === 'wibor' ? 'bg-blue-100 border-blue-500 text-blue-700 font-bold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                            Zmienne (WIBOR)
                        </button>
                        <button
                            onClick={() => updateScenario(scenario.id, 'rateType', 'fixed')}
                            className={`flex-1 text-xs py-1 rounded border transition-colors ${scenario.rateType === 'fixed' ? 'bg-blue-100 border-blue-500 text-blue-700 font-bold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                            Stałe
                        </button>
                    </div>

                    {scenario.rateType === 'fixed' ? (
                         <div>
                            <div className="flex justify-between">
                                <label className="text-[10px] text-slate-400">Stawka stała (%)</label>
                            </div>
                            <input type="number" value={scenario.fixedRate} onChange={(e) => updateScenario(scenario.id, 'fixedRate', parseFloat(e.target.value))} className="w-full p-2 border border-slate-300 rounded text-sm" />
                         </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                             <div>
                                <label className="text-[10px] text-slate-400">WIBOR 3M</label>
                                <div className="p-2 bg-slate-100 border border-slate-200 rounded text-sm text-slate-500 text-center font-mono">{globalWibor}%</div>
                             </div>
                             <div>
                                <label className="text-[10px] text-slate-400">Marża (%)</label>
                                <input type="number" value={scenario.margin} onChange={(e) => updateScenario(scenario.id, 'margin', parseFloat(e.target.value))} className="w-full p-2 border border-slate-300 rounded text-sm" />
                             </div>
                             <div className="col-span-2 text-[10px] text-right text-slate-400">
                                Razem: <span className="font-bold text-slate-700">{(globalWibor + (parseFloat(scenario.margin)||0)).toFixed(2)}%</span>
                             </div>
                        </div>
                    )}
                  </div>

                  <div className="col-span-2 border-t pt-2">
                      <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase">Prowizja (%)</label>
                            <input type="number" value={scenario.commissionPercent} onChange={(e) => updateScenario(scenario.id, 'commissionPercent', parseFloat(e.target.value))} className="w-full p-2 border border-slate-300 rounded text-sm" />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase">Inne koszty</label>
                            <input
                                type="number"
                                value={scenario.otherCosts.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0)}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    updateScenario(scenario.id, 'otherCosts', [{ name: 'Koszty dodatkowe', value: val }]);
                                }}
                                className="w-full p-2 border border-slate-300 rounded text-sm"
                            />
                          </div>
                      </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Right: Results and Tabs */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-1 flex">
                <button onClick={() => setActiveTab('compare')} className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'compare' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <PieChart className="w-3 h-3" /> Porównanie Ofert
                </button>
                <button onClick={() => setActiveTab('schedule')} className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'schedule' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <Calendar className="w-3 h-3" /> Harmonogram Spłat
                </button>
                <button onClick={() => setActiveTab('materials')} className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'materials' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <FileText className="w-3 h-3" /> Instrukcje i Media
                </button>
          </div>

          {activeTab === 'compare' && (
            <div className="space-y-6">
              {/* Winner Card (REPAIRED) */}
              <Card className="bg-gradient-to-br from-emerald-600 to-emerald-800 text-white border-none overflow-visible relative">
                 <div className="p-6 flex flex-col gap-6 relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -mr-16 -mt-16"></div>
                    
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <div className="flex items-center gap-2 text-emerald-100 text-xs font-bold uppercase tracking-widest mb-2">
                                <CheckCircle className="w-4 h-4" /> Najkorzystniejszy wariant
                            </div>
                            <h3 className="text-4xl font-bold text-white leading-tight">{bestOption.name}</h3>
                        </div>
                        {scenarios.length > 1 && savingsAmount > 0 && (
                            <div className="bg-emerald-500/30 backdrop-blur-md border border-emerald-400/20 rounded-xl p-4 text-right shadow-lg">
                                <div className="text-[10px] text-emerald-100 uppercase font-bold mb-1 opacity-90">Twoja oszczędność</div>
                                <div className="text-3xl font-black text-white">{formatCurrency(savingsAmount)}</div>
                                <div className="text-[10px] text-emerald-200 mt-1 italic">Zostaje w kieszeni!</div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-emerald-500/30 relative z-10">
                        <div>
                            <div className="text-xs text-emerald-200 uppercase mb-1 font-bold opacity-80">Całkowita kwota do zapłaty</div>
                            <div className="text-2xl font-bold text-white">{formatCurrency(bestOption.summary.totalCostProject)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-emerald-200 uppercase mb-1 font-bold opacity-80 flex items-center gap-1">
                                Realny koszt (PV)
                                <Tooltip text="Wartość pieniędzy skorygowana o inflację (NPV). Pokazuje dzisiejszą wartość przyszłych wydatków." />
                            </div>
                            <div className="text-2xl font-bold text-white flex items-center gap-2">
                                {formatCurrency(bestOption.summary.npvTotal)}
                            </div>
                        </div>
                    </div>
                 </div>
              </Card>

              {/* Summary Table (WITH GRANT COLUMN) */}
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase border-b">
                      <tr>
                        <th className="p-4">Wariant</th>
                        <th className="p-4 text-emerald-600 font-bold">Umorzenie / Dotacja</th>
                        <th className="p-4">Odsetki</th>
                        <th className="p-4">Koszt całk.</th>
                        <th className="p-4 text-right">Realny (PV)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {results.map(r => (
                        <tr key={r.id} className={r.id === bestOption.id ? "bg-emerald-50/50" : "hover:bg-slate-50 transition-colors"}>
                          <td className="p-4">
                              <div className="font-bold text-slate-900">{r.name}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5">RRSO (upr.): {r.effectiveRate.toFixed(2)}%</div>
                          </td>
                          <td className="p-4 font-bold text-emerald-600">{formatCurrency(r.summary.grantAmount)}</td>
                          <td className="p-4 text-blue-700">{formatCurrency(r.summary.totalInterest)}</td>
                          <td className="p-4 font-bold text-slate-900">{formatCurrency(r.summary.totalCostProject)}</td>
                          <td className="p-4 text-right">
                              <div className="font-medium text-slate-600">{formatCurrency(r.summary.npvTotal)}</div>
                              {r.summary.realBenefit > 0 && <div className="text-[9px] text-emerald-600 font-bold">Inflacja pomaga</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'schedule' && (
            <Card className="h-[600px] flex flex-col">
              <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                 <h3 className="font-bold text-slate-700">Harmonogram spłat</h3>
                 <select value={selectedScenarioId || scenarios[0].id} onChange={(e) => setSelectedScenarioId(parseInt(e.target.value))} className="p-1.5 text-xs border rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                 </select>
              </div>
              <div className="overflow-auto flex-1">
                 <table className="w-full text-[11px] text-right">
                    <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="p-3 text-left">M-ce</th>
                        <th className="p-3">Rata całkowita</th>
                        <th className="p-3 text-blue-600">Odsetki</th>
                        <th className="p-3 text-emerald-600">Kapitał</th>
                        <th className="p-3">Pozostało</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {results.find(r => r.id === (selectedScenarioId || scenarios[0].id))?.schedule.map((row) => (
                        <tr key={row.month} className="hover:bg-slate-50">
                          <td className="p-3 text-left font-medium">{row.month}</td>
                          <td className="p-3 font-bold text-slate-900">{formatCurrency(row.installment)}</td>
                          <td className="p-3 text-blue-600">{formatCurrency(row.interestPart)}</td>
                          <td className="p-3 text-emerald-600">{formatCurrency(row.capitalPart)}</td>
                          <td className="p-3 text-slate-400">{formatCurrency(row.remainingBalance)}</td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
              </div>
            </Card>
          )}

          {activeTab === 'materials' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-blue-500" /> Dokumenty i Pliki</h3>
                    <div className="space-y-3">
                        {INSTRUCTION_MATERIALS.documents.map((doc, i) => (
                            <a key={i} href={doc.url} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:bg-blue-50 hover:border-blue-200 transition-all group shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600 font-black text-[10px]">{doc.type}</div>
                                    <span className="text-sm font-semibold text-slate-700">{doc.title}</span>
                                </div>
                                <Download className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
                            </a>
                        ))}
                    </div>
                </Card>
                <Card className="p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><PlayCircle className="w-5 h-5 text-emerald-500" /> Multimedia</h3>
                    <div className="space-y-6">
                        {INSTRUCTION_MATERIALS.media.map((med, i) => (
                            <div key={i} className="space-y-3">
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                                    {med.type === 'VIDEO' ? <Video className="w-4 h-4 text-red-500" /> : <Music className="w-4 h-4 text-emerald-500" />}
                                    {med.title}
                                </div>
                                {med.type === 'VIDEO' ? (
                                    <div className="aspect-video rounded-xl overflow-hidden border border-slate-200 shadow-inner">
                                        <iframe src={med.url} className="w-full h-full" allowFullScreen></iframe>
                                    </div>
                                ) : (
                                    <audio controls className="w-full h-10 shadow-sm rounded-lg overflow-hidden border"><source src={med.url} type="audio/mpeg" /></audio>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}