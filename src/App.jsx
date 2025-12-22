import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Calculator, PieChart, Calendar, ArrowRight, CheckCircle, Info, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';

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
      totalCostPercentage,
      npvTotal: npvSum, 
      realBenefit: realBenefit 
    }
  };
};

// --- Components ---

// To jest kluczowy komponent stylów - upewnij się, że te klasy tu są!
const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${className}`}>
    {children}
  </div>
);

const Tooltip = ({ text }) => (
  <div className="group relative inline-block ml-1">
    <Info className="w-4 h-4 text-slate-400 cursor-help" />
    <div className="invisible group-hover:visible absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-slate-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-48 text-center shadow-lg pointer-events-none">
      {text}
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
    </div>
  </div>
);

export default function App() {
  const [globalWibor, setGlobalWibor] = useState(5.85);
  const [globalInflation, setGlobalInflation] = useState(4.5); 
  const [activeTab, setActiveTab] = useState('input'); 
  const [selectedScenarioId, setSelectedScenarioId] = useState(null); 

  const [scenarios, setScenarios] = useState([
    {
      id: 1,
      name: 'Pożyczka unijna z FKIP',
      amount: 500000,
      periodMonths: 120,
      graceMonths: 0,
      rateType: 'fixed', 
      fixedRate: 0.5,
      margin: 0.0,
      commissionPercent: 0.0,
      otherCosts: [{ id: 1, name: 'np. analiza, wycena', value: 0 }],
      installmentType: 'equal', 
      grantType: 'percent',
      grantValue: 20,
      ignoreInflation: false
    },
    {
      id: 2,
      name: 'Kredyt komercyjny',
      amount: 500000,
      periodMonths: 120,
      graceMonths: 0,
      rateType: 'wibor',
      fixedRate: 7.5,
      margin: 2.5,
      commissionPercent: 1,
      otherCosts: [{ id: 1, name: 'np. analiza, wycena', value: 0 }],
      installmentType: 'equal',
      grantType: 'amount',
      grantValue: 0,
      ignoreInflation: false
    }
  ]);

  const addScenario = () => {
    const newId = Math.max(...scenarios.map(s => s.id), 0) + 1;
    setScenarios([...scenarios, {
      id: newId,
      name: `Opcja #${newId}`,
      amount: scenarios[0]?.amount || 500000,
      periodMonths: scenarios[0]?.periodMonths || 120,
      graceMonths: 0,
      rateType: 'wibor',
      fixedRate: 7.5,
      margin: 2.5,
      commissionPercent: 1.0,
      otherCosts: [],
      installmentType: 'equal',
      grantType: 'amount',
      grantValue: 0,
      ignoreInflation: false
    }]);
  };

  const removeScenario = (id) => {
    if (scenarios.length > 1) {
      setScenarios(scenarios.filter(s => s.id !== id));
    }
  };

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

  const fetchWibor = () => {
    alert("Pobrano aktualną stawkę WIBOR 3M z NBP (symulacja).");
    setGlobalWibor(4.02);
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
      
      {/* Header */}
      <header className="bg-blue-900 text-white p-6 shadow-lg sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <Calculator className="w-8 h-8 text-blue-300" />
            <h1 className="text-2xl font-bold tracking-tight">FinansePro: Porównywarka Ofert</h1>
          </div>
          
          <div className="flex gap-4">
            <div className="flex items-center gap-4 bg-blue-800 px-4 py-2 rounded-lg border border-blue-700">
                <span className="text-sm font-medium text-blue-200 whitespace-nowrap">WIBOR 3M:</span>
                <div className="flex items-center">
                    <input 
                    type="number" 
                    value={globalWibor}
                    onChange={(e) => setGlobalWibor(parseFloat(e.target.value))}
                    className="w-16 bg-white text-slate-900 px-2 py-1 rounded-l text-center font-bold focus:outline-none"
                    step="0.01"
                    />
                    <span className="bg-blue-700 px-2 py-1 rounded-r text-sm font-bold">%</span>
                </div>
                <button 
                onClick={fetchWibor}
                className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded transition-colors h-full"
                >
                Aktualizuj
                </button>
            </div>

            <div className="flex items-center gap-4 bg-indigo-800 px-4 py-2 rounded-lg border border-indigo-700">
                <span className="text-sm font-medium text-indigo-200 whitespace-nowrap flex items-center gap-1">
                    Inflacja
                    <Tooltip text="Prognozowana średnioroczna inflacja. Służy do obliczenia realnej wartości pieniądza w czasie (PV)." />
                </span>
                <div className="flex items-center">
                    <input 
                    type="number" 
                    value={globalInflation}
                    onChange={(e) => setGlobalInflation(parseFloat(e.target.value))}
                    className="w-16 bg-white text-slate-900 px-2 py-1 rounded-l text-center font-bold focus:outline-none"
                    step="0.1"
                    />
                    <span className="bg-indigo-700 px-2 py-1 rounded-r text-sm font-bold">%</span>
                </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        
        {/* Left Column: Inputs */}
        <div className="lg:col-span-5 space-y-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-blue-600" />
              Parametry Ofert
            </h2>
            <button 
              onClick={addScenario}
              className="flex items-center gap-2 text-sm bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 transition-all shadow-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Dodaj wariant
            </button>
          </div>

          <div className="space-y-4">
            {scenarios.map((scenario, index) => (
              <Card key={scenario.id} className="border-l-4 border-l-blue-500 relative">
                <div className="p-4">
                  <div className="flex justify-between items-start mb-4">
                    <input 
                      type="text" 
                      value={scenario.name}
                      onChange={(e) => updateScenario(scenario.id, 'name', e.target.value)}
                      className="font-bold text-lg text-blue-900 bg-transparent border-b border-transparent hover:border-blue-200 focus:border-blue-500 focus:outline-none w-full mr-2"
                      placeholder="Nazwa wariantu"
                    />
                    {scenarios.length > 1 && (
                      <button 
                        onClick={() => removeScenario(scenario.id)}
                        className="text-slate-400 hover:text-red-500 transition-colors p-1"
                        title="Usuń wariant"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="text-xs text-slate-500 font-semibold uppercase">Kwota (PLN)</label>
                      <input 
                        type="number" 
                        value={scenario.amount}
                        onChange={(e) => updateScenario(scenario.id, 'amount', parseFloat(e.target.value))}
                        className="w-full p-2 border border-slate-300 rounded mt-1 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="text-xs text-slate-500 font-semibold uppercase">Okres (m-ce)</label>
                      <input 
                        type="number" 
                        value={scenario.periodMonths}
                        onChange={(e) => updateScenario(scenario.id, 'periodMonths', parseInt(e.target.value))}
                        className="w-full p-2 border border-slate-300 rounded mt-1 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    {/* Interest Rate Section */}
                    <div className="col-span-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <div className="flex gap-4 mb-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input 
                            type="radio" 
                            name={`rateType-${scenario.id}`} 
                            checked={scenario.rateType === 'wibor'}
                            onChange={() => updateScenario(scenario.id, 'rateType', 'wibor')}
                            className="text-blue-600"
                          />
                          WIBOR + Marża
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input 
                            type="radio" 
                            name={`rateType-${scenario.id}`} 
                            checked={scenario.rateType === 'fixed'}
                            onChange={() => updateScenario(scenario.id, 'rateType', 'fixed')}
                            className="text-blue-600"
                          />
                          Stałe
                        </label>
                      </div>
                      
                      {scenario.rateType === 'wibor' ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className="text-xs text-slate-500 block">Marża (%)</label>
                            <input 
                              type="number" step="0.01"
                              value={scenario.margin}
                              onChange={(e) => updateScenario(scenario.id, 'margin', parseFloat(e.target.value))}
                              className="w-full p-1.5 border rounded text-sm" 
                            />
                          </div>
                          <div className="text-xs text-slate-400 pt-4 self-center">
                             + {globalWibor}%
                          </div>
                          <div className="flex-1 bg-blue-100 p-1.5 rounded text-center">
                            <label className="text-xs text-blue-600 font-bold block">Razem</label>
                            <span className="text-sm font-bold text-blue-800">
                              {(globalWibor + (scenario.margin || 0)).toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs text-slate-500 block">Oprocentowanie stałe (%)</label>
                          <input 
                            type="number" step="0.01"
                            value={scenario.fixedRate}
                            onChange={(e) => updateScenario(scenario.id, 'fixedRate', parseFloat(e.target.value))}
                            className="w-full p-1.5 border rounded text-sm" 
                          />
                        </div>
                      )}
                    </div>

                    {/* Details Grid */}
                    <div className="col-span-1">
                        <label className="text-xs text-slate-500 font-semibold uppercase block mb-1">Prowizja (%)</label>
                        <input 
                          type="number" step="0.01"
                          value={scenario.commissionPercent}
                          onChange={(e) => updateScenario(scenario.id, 'commissionPercent', parseFloat(e.target.value))}
                          className="w-full p-2 border border-slate-300 rounded text-sm"
                        />
                    </div>
                    <div className="col-span-1">
                        <label className="text-xs text-slate-500 font-semibold uppercase block mb-1">Karencja (m-ce)</label>
                        <input 
                          type="number"
                          value={scenario.graceMonths}
                          onChange={(e) => updateScenario(scenario.id, 'graceMonths', parseInt(e.target.value))}
                          className="w-full p-2 border border-slate-300 rounded text-sm"
                        />
                    </div>

                    <div className="col-span-2 flex gap-4 mt-1">
                       <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer bg-white border px-2 py-1 rounded hover:bg-slate-50 flex-1 justify-center">
                          <input 
                            type="radio" 
                            checked={scenario.installmentType === 'equal'}
                            onChange={() => updateScenario(scenario.id, 'installmentType', 'equal')}
                          /> Raty równe
                       </label>
                       <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer bg-white border px-2 py-1 rounded hover:bg-slate-50 flex-1 justify-center">
                          <input 
                            type="radio" 
                            checked={scenario.installmentType === 'decreasing'}
                            onChange={() => updateScenario(scenario.id, 'installmentType', 'decreasing')}
                          /> Raty malejące
                       </label>
                    </div>

                    {/* Grant Section */}
                    <div className="col-span-2 mt-2 pt-2 border-t border-dashed border-slate-300">
                      <div className="flex justify-between items-center mb-2">
                         <label className="text-xs font-bold text-emerald-600 uppercase">Umorzenie / Dotacja</label>
                         <select 
                            value={scenario.grantType}
                            onChange={(e) => updateScenario(scenario.id, 'grantType', e.target.value)}
                            className="text-xs border rounded p-1"
                         >
                            <option value="amount">Kwota (PLN)</option>
                            <option value="percent">% Kapitału</option>
                         </select>
                      </div>
                      <input 
                        type="number"
                        value={scenario.grantValue}
                        onChange={(e) => updateScenario(scenario.id, 'grantValue', parseFloat(e.target.value))}
                        className="w-full p-2 border border-emerald-200 bg-emerald-50 rounded text-sm focus:ring-emerald-500 focus:border-emerald-500"
                        placeholder={scenario.grantType === 'percent' ? 'np. 20%' : 'np. 50000'}
                      />
                    </div>

                    {/* Other Costs Dynamic List */}
                    <div className="col-span-2 mt-2">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Inne koszty startowe</label>
                        <button 
                          onClick={() => addOtherCost(scenario.id)}
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Dodaj koszt
                        </button>
                      </div>
                      {scenario.otherCosts.map(cost => (
                        <div key={cost.id} className="flex gap-2 mb-2">
                          <input 
                            type="text" 
                            value={cost.name}
                            onChange={(e) => updateOtherCost(scenario.id, cost.id, 'name', e.target.value)}
                            className="flex-1 p-1.5 text-xs border rounded"
                            placeholder="Nazwa kosztu"
                          />
                          <input 
                            type="number" 
                            value={cost.value}
                            onChange={(e) => updateOtherCost(scenario.id, cost.id, 'value', parseFloat(e.target.value))}
                            className="w-24 p-1.5 text-xs border rounded"
                            placeholder="PLN"
                          />
                          <button 
                            onClick={() => removeOtherCost(scenario.id, cost.id)}
                            className="text-slate-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    
                    {/* Ignore Inflation Toggle */}
                    <div className="col-span-2 mt-4 pt-2 border-t border-slate-100">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input 
                                type="checkbox" 
                                checked={scenario.ignoreInflation}
                                onChange={(e) => updateScenario(scenario.id, 'ignoreInflation', e.target.checked)}
                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                            />
                            <span className="text-xs text-slate-500 group-hover:text-indigo-700 transition-colors">
                                Pomiń inflację w obliczeniach tego wariantu (PV = Nominal)
                            </span>
                        </label>
                    </div>

                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Right Column: Results & Charts */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Main Tabs */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-1">
             <div className="grid grid-cols-2 gap-1">
                <button 
                  onClick={() => setActiveTab('compare')}
                  className={`py-3 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'compare' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <PieChart className="w-4 h-4" />
                  Porównanie Ofert
                </button>
                <button 
                  onClick={() => {
                    setActiveTab('schedule');
                    if (!selectedScenarioId) setSelectedScenarioId(scenarios[0].id);
                  }}
                  className={`py-3 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'schedule' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <Calendar className="w-4 h-4" />
                  Harmonogram Spłat
                </button>
             </div>
          </div>

          {activeTab === 'compare' && (
            <>
              {/* Winner Card */}
              <Card className="bg-gradient-to-br from-emerald-600 to-emerald-800 text-white border-none overflow-visible">
                 <div className="p-6 flex flex-col gap-6 relative">
                    {/* Glow effect */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -mr-16 -mt-16"></div>
                    
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <div className="flex items-center gap-2 text-emerald-200 text-xs font-bold uppercase tracking-widest mb-2">
                                <CheckCircle className="w-4 h-4" /> Rekomendowany Wybór
                            </div>
                            <h3 className="text-4xl font-bold text-white">{bestOption.name}</h3>
                        </div>
                        {scenarios.length > 1 && savingsAmount > 0 && (
                            <div className="bg-emerald-500/30 backdrop-blur-md border border-emerald-400/30 rounded-xl p-4 text-right">
                                <div className="text-xs text-emerald-100 mb-1">Twoja oszczędność względem najdroższej opcji</div>
                                <div className="text-3xl font-bold text-white">{formatCurrency(savingsAmount)}</div>
                                <div className="text-xs text-emerald-200 mt-1">Zostaje w kieszeni!</div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-emerald-500/30">
                        <div>
                            <div className="text-xs text-emerald-200 uppercase mb-1 opacity-80">Całkowita kwota do zapłaty</div>
                            <div className="text-2xl font-bold">{formatCurrency(bestOption.summary.totalCostProject)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-emerald-200 uppercase mb-1 opacity-80 flex items-center gap-1">
                                Realny koszt (PV)
                                <Tooltip text="Wartość pieniędzy skorygowana o inflację (NPV). To tyle dzisiejszych złotówek 'wart' jest ten kredyt." />
                            </div>
                            <div className="text-2xl font-bold flex items-center gap-2">
                                {formatCurrency(bestOption.summary.npvTotal)}
                                {bestOption.summary.realBenefit > 0 && (
                                    <span className="text-xs bg-white/20 px-2 py-1 rounded-full text-emerald-50">
                                        Realny zysk: {formatCurrency(bestOption.summary.realBenefit)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                 </div>
              </Card>

              {/* Summary Table */}
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                      <tr>
                        <th className="p-4 min-w-[140px]">Wariant</th>
                        <th className="p-4">Rata (start)</th>
                        <th className="p-4 text-blue-600">Odsetki</th>
                        <th className="p-4 text-amber-600">Prowizja/Inne</th>
                        <th className="p-4">
                            <div className="flex items-center gap-1">
                                Realny (PV)
                                <Tooltip text="Koszt z uwzględnieniem utraty wartości pieniądza w czasie." />
                            </div>
                        </th>
                        <th className="p-4 text-right font-bold text-slate-900">
                            Całkowita kwota
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {results.map(r => {
                          const isWinner = r.id === bestOption.id;
                          const isRealGain = r.summary.realBenefit > 0;
                          return (
                            <tr key={r.id} className={isWinner ? "bg-emerald-50/50" : "hover:bg-slate-50"}>
                            <td className="p-4">
                                <div className="font-bold text-slate-900">{r.name}</div>
                                <div className="text-xs text-slate-500 mt-1">RRSO (upr.): {r.effectiveRate.toFixed(2)}%</div>
                            </td>
                            <td className="p-4 text-slate-600">
                                {r.schedule[0] ? formatCurrency(r.schedule[r.graceMonths].installment) : '-'}
                            </td>
                            <td className="p-4 text-blue-700">
                                {formatCurrency(r.summary.totalInterest)}
                            </td>
                             <td className="p-4 text-amber-700">
                                {formatCurrency(r.summary.totalStartCosts)}
                            </td>
                            <td className="p-4">
                                <div className={`font-medium ${isRealGain ? 'text-emerald-600' : 'text-slate-600'}`}>
                                    {formatCurrency(r.summary.npvTotal)}
                                </div>
                                {r.ignoreInflation ? (
                                     <div className="text-[10px] text-slate-400 italic">
                                        Bez inflacji
                                     </div>
                                ) : isRealGain && (
                                    <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                                        <TrendingDown className="w-3 h-3" /> Inflacja pomaga
                                    </div>
                                )}
                            </td>
                            <td className="p-4 text-right">
                                <div className="font-bold text-blue-900 text-base">{formatCurrency(r.summary.totalCostProject)}</div>
                                <div className="text-xs text-slate-400">
                                    ({((r.summary.totalCostProject / r.summary.loanAmount) * 100).toFixed(0)}% kapitału)
                                </div>
                            </td>
                            </tr>
                          );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Chart */}
              <Card className="p-6 h-96">
                 <h3 className="text-lg font-bold text-slate-800 mb-4">Struktura spłaty (Nominalna)</h3>
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{fontSize: 12}} />
                      <YAxis hide />
                      <RechartsTooltip 
                        formatter={(value) => formatCurrency(value)}
                        cursor={{fill: '#f1f5f9'}}
                      />
                      <Legend />
                      <Bar dataKey="Kapitał (netto)" stackId="a" fill="#94a3b8" />
                      <Bar dataKey="Odsetki" stackId="a" fill="#3b82f6" />
                      <Bar dataKey="Koszty startowe" stackId="a" fill="#f59e0b" />
                    </BarChart>
                 </ResponsiveContainer>
              </Card>
            </>
          )}

          {activeTab === 'schedule' && (
            <Card className="flex-1 flex flex-col h-[800px]">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                 <h3 className="font-bold text-slate-700">Harmonogram spłat</h3>
                 <select 
                   value={selectedScenarioId || ''}
                   onChange={(e) => setSelectedScenarioId(parseInt(e.target.value))}
                   className="p-2 border rounded text-sm bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                 >
                    {scenarios.map(s => (
                       <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                 </select>
              </div>
              <div className="overflow-auto flex-1 p-0">
                 {selectedScenarioId && (
                   <table className="w-full text-sm text-right">
                      <thead className="bg-slate-100 text-slate-600 text-xs uppercase sticky top-0 z-10 shadow-sm">
                        <tr>
                           <th className="p-3 text-left">Miesiąc</th>
                           <th className="p-3">Rata całkowita</th>
                           <th className="p-3 text-blue-600">Odsetki</th>
                           <th className="p-3 text-emerald-600">Kapitał</th>
                           <th className="p-3 text-slate-500">Pozostało</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {results.find(r => r.id === selectedScenarioId)?.schedule.map((row) => (
                           <tr key={row.month} className="hover:bg-slate-50">
                              <td className="p-3 text-left font-medium text-slate-700">{row.month}</td>
                              <td className="p-3 font-bold text-slate-900">{formatCurrency(row.installment)}</td>
                              <td className="p-3 text-blue-600">{formatCurrency(row.interestPart)}</td>
                              <td className="p-3 text-emerald-600">{formatCurrency(row.capitalPart)}</td>
                              <td className="p-3 text-slate-400">{formatCurrency(row.remainingBalance)}</td>
                           </tr>
                        ))}
                      </tbody>
                   </table>
                 )}
              </div>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}