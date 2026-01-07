import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import {
  Activity, Map, Zap, Database, Upload, Trash2,
  ChevronDown, Mountain, TrendingUp, Search, Wind, Brain, Droplet, ArrowRight,
  BarChart2, X, RefreshCw, FileText, Check, AlertTriangle, Filter, Globe, Calendar, Clock, Edit2, Save
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, Legend
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

// --- JOUW FIREBASE CONFIGURATIE ---
const firebaseConfig = {
  apiKey: "AIzaSyBNWzcEXhzra-iCkHiZj_FdYUf0NcKvHAk",
  authDomain: "climb-performance-lab.firebaseapp.com",
  projectId: "climb-performance-lab",
  storageBucket: "climb-performance-lab.firebasestorage.app",
  messagingSenderId: "97555677694",
  appId: "1:97555677694:web:fa84b31445639e260cc0af",
  measurementId: "G-G4WLCWCXFK"
};

// Initialiseer de verbinding
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const USER_ID = "mijn_wieler_data"; // Jouw persoonlijke kluis ID

// --- UTILITIES & PHYSICS ---
const formatTime = (seconds) => {
  if (!seconds && seconds !== 0) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h > 0 ? h + ':' : ''}${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
};

const calculateWattsForSpeed = (gradient, weight) => {
  return (speedKmh) => {
    const v = speedKmh / 3.6;
    const m = parseFloat(weight) + 8; // +8kg bike
    const g = 9.81;
    const theta = Math.atan(gradient / 100);
    const pGravity = g * Math.sin(theta) * m * v;
    const pRolling = 0.004 * g * Math.cos(theta) * m * v;
    const pAero = 0.5 * 1.225 * 0.32 * Math.pow(v, 3);
    return Math.max(0, Math.round(pGravity + pRolling + pAero));
  };
};

const generateNaturalProfile = (distanceKm, elevationM) => {
  const segments = 30;
  const avgGrade = (elevationM / (distanceKm * 1000)) * 100;
  const distPerSeg = distanceKm / segments;
  let currentElev = 0;
  let profile = [];
  let currentGrade = avgGrade;

  for (let i = 0; i < segments; i++) {
    const change = (Math.random() * 4) - 2;
    let segmentGrade = currentGrade + change;
    segmentGrade = Math.max(0.5, Math.min(20, segmentGrade));
    currentGrade = segmentGrade;
    const segElevGain = (distPerSeg * 1000) * (segmentGrade / 100);
    currentElev += segElevGain;
    profile.push({
      id: i,
      km: parseFloat(((i + 1) * distPerSeg).toFixed(1)),
      gradient: parseFloat(segmentGrade.toFixed(1)),
      elevation: Math.round(currentElev)
    });
  }
  const finalElev = profile[profile.length - 1].elevation;
  const scale = elevationM / finalElev;
  return profile.map(p => ({
    ...p,
    elevation: Math.round(p.elevation * scale),
    gradient: parseFloat((p.gradient * scale).toFixed(1))
  }));
};

const parseDate = (dateStr) => {
  if(!dateStr) return new Date(0);
  const cleanStr = dateStr.split(' ')[0];
  const parts = cleanStr.split(/[\/\-]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
  }
  return new Date(dateStr);
};

// --- DATABASES (STATIC DATA) ---
const ZWIFT_CLIMBS = [
  { id: 'z_adz', name: "Alpe du Zwift", region: "Watopia", country: "Zwift", flag: "🟧", distance: 12.2, elevation: 1036, avgGrade: 8.5 },
  { id: 'z_epic_kom', name: "Epic KOM", region: "Watopia", country: "Zwift", flag: "🟧", distance: 9.4, elevation: 540, avgGrade: 5.9 },
  { id: 'z_ven_top', name: "Ven-Top", region: "France", country: "Zwift", flag: "🟧", distance: 19.0, elevation: 1534, avgGrade: 8.0 },
];

const REAL_WORLD_CLIMBS = [
  { id: 'alpe_huez', name: "Alpe d'Huez", region: "Alpen", country: "FR", flag: "🇫🇷", distance: 13.8, elevation: 1135, avgGrade: 8.1 },
  { id: 'ventoux', name: "Mont Ventoux (Bédoin)", region: "Provence", country: "FR", flag: "🇫🇷", distance: 21.0, elevation: 1610, avgGrade: 7.5 },
  { id: 'stelvio', name: "Passo dello Stelvio", region: "Dolomieten", country: "IT", flag: "🇮🇹", distance: 24.3, elevation: 1808, avgGrade: 7.4 },
];

const FULL_CLIMB_DB = [
  ...REAL_WORLD_CLIMBS.map(c => ({...c, type: 'Real'})),
  ...ZWIFT_CLIMBS.map(c => ({...c, type: 'Zwift'}))
];

const INITIAL_ACTIVITIES = [
  { id: 'a1', date: '01/09/2023', name: 'Start Logboek', duration: 3600, distance: 30, elevation: 200, speed: 30, hr: 140, cadence: 85, power: 180, np: 190, tss: 60, p5: 220, p20: 200, p60: 190 },
];

// --- MAIN APP ---

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [userProfile, setUserProfile] = useState({ height: 1.83, weight: 70, ftp: 280 });
  const [activities, setActivities] = useState(INITIAL_ACTIVITIES);
  const [climbs, setClimbs] = useState(FULL_CLIMB_DB);
  const [activeClimb, setActiveClimb] = useState(FULL_CLIMB_DB[0]);
  
  // Cloud States
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [notification, setNotification] = useState(null);

  // 1. DATA LADEN VANUIT GOOGLE
  useEffect(() => {
    const loadFromCloud = async () => {
      try {
        const docRef = doc(db, "wieler_app", USER_ID);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.profile) setUserProfile(data.profile);
          if (data.activities) setActivities(data.activities);
          if (data.custom_climbs) {
            // Voeg custom climbs toe aan de database
            setClimbs(prev => {
              // Voorkom dubbelen
              const customIds = new Set(data.custom_climbs.map(c => c.id));
              const base = prev.filter(c => !customIds.has(c.id));
              return [...base, ...data.custom_climbs];
            });
          }
          notify("Cloud data succesvol geladen!", "success");
        } else {
          // Eerste keer
          notify("Welkom! Nieuw cloud profiel gestart.", "success");
        }
      } catch (error) {
        console.error(error);
        notify("Kon niet verbinden met cloud: " + error.message, "error");
      } finally {
        setLoading(false);
      }
    };
    loadFromCloud();
  }, []);

  // 2. DATA OPSLAAN (HANDMATIG)
  const saveToCloud = async () => {
    setSyncStatus('syncing');
    try {
      const customOnly = climbs.filter(c => c.type === 'Custom');
      const docRef = doc(db, "wieler_app", USER_ID);
      
      await setDoc(docRef, {
        profile: userProfile,
        activities: activities,
        custom_climbs: customOnly,
        last_updated: new Date().toISOString()
      }, { merge: true });
      
      setSyncStatus('saved');
      notify("Alles veilig opgeslagen in Google Cloud!", "success");
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (error) {
      console.error(error);
      setSyncStatus('error');
      notify("Opslaan mislukt! Check je internet.", "error");
    }
  };

  const saveCustomClimb = (newClimb) => {
    const updatedClimbs = [...climbs, newClimb];
    setClimbs(updatedClimbs);
    notify("Klim toegevoegd (Vergeet niet op OPSLAAN te klikken!)");
  };

  const notify = (msg, type='success') => {
    setNotification({msg, type});
    setTimeout(() => setNotification(null), 4000);
  };

  // --- DASHBOARD LOGICA ---
  const activeProfile = useMemo(() => {
    return activeClimb.profile || generateNaturalProfile(activeClimb.distance, activeClimb.elevation);
  }, [activeClimb]);

  const [ftpTimeRange, setFtpTimeRange] = useState('all');

  const ftpHistory = useMemo(() => {
    const now = new Date();
    let cutoff = new Date(0);
    if(ftpTimeRange === '6m') cutoff.setMonth(now.getMonth() - 6);
    if(ftpTimeRange === '1y') cutoff.setFullYear(now.getFullYear() - 1);

    return activities
      .map(a => ({ date: a.date, ftp: Math.round((a.p20 || 0) * 0.95), sortDate: parseDate(a.date) }))
      .filter(a => a.sortDate >= cutoff && a.ftp > 0)
      .sort((a,b) => a.sortDate - b.sortDate);
  }, [activities, ftpTimeRange]);

  const loadData = useMemo(() => {
    const months = ['Aug', 'Sep', 'Okt', 'Nov', 'Dec', 'Jan'];
    return months.map((m, i) => ({
      month: m,
      tss: Math.floor(Math.random() * 300) + 200 + (i * 20)
    }));
  }, [activities]);

  const getTopPerformances = (metric) => {
    return [...activities]
      .filter(a => a[metric] > 0)
      .sort((a,b) => b[metric] - a[metric])
      .slice(0, 5);
  };

  // --- COMPONENTEN ---

  const Dashboard = () => {
    const [targetTime, setTargetTime] = useState(60);
    const reqSpeed = activeClimb.distance / (targetTime / 60);
    const reqWatts = calculateWattsForSpeed(activeClimb.avgGrade, userProfile.weight)(reqSpeed);
    const gap = reqWatts - userProfile.ftp;
    const [bestPowerTab, setBestPowerTab] = useState('p20');

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-blue-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2"><TrendingUp size={14}/> Goal Tracker</h3>
                <h2 className="text-xl font-bold text-white mt-1">{activeClimb.name}</h2>
                <p className="text-xs text-slate-500">{activeClimb.distance}km @ {activeClimb.avgGrade}% • {activeClimb.elevation}m+</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-white font-mono">{reqWatts}w</div>
                <div className="text-xs text-slate-400">Benodigd</div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Streeftijd (min)</label>
                <div className="flex items-center gap-3">
                  <input type="range" min="20" max="240" step="1" value={targetTime} onChange={e => setTargetTime(parseInt(e.target.value))} className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                  <span className="font-mono text-white w-12 text-right">{targetTime}m</span>
                </div>
              </div>
              <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400">Huidig FTP: {userProfile.ftp}W</span>
                  <span className={gap > 0 ? "text-red-400 font-bold" : "text-green-400 font-bold"}>{gap > 0 ? `Tekort: ${gap}W` : `Buffer: ${Math.abs(gap)}W`}</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex">
                  <div className="bg-slate-500 h-full transition-all duration-500" style={{width: `${Math.min(100, (userProfile.ftp / (Math.max(reqWatts, userProfile.ftp)*1.1))*100)}%`}}></div>
                  {gap > 0 && <div className="bg-red-500 h-full transition-all duration-500" style={{width: `${(gap / (Math.max(reqWatts, userProfile.ftp)*1.1))*100}%`}}></div>}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-900 to-slate-800 rounded-xl border border-indigo-500/30 p-5 shadow-lg relative">
             <Brain className="absolute top-3 right-3 text-indigo-400/20 w-16 h-16"/>
             <h3 className="text-indigo-300 text-xs font-bold uppercase mb-3 flex items-center gap-2"><Zap size={14}/> De Coach Spreekt</h3>
             <div className="bg-indigo-950/30 p-3 rounded-lg border border-indigo-500/20 mb-3">
               <p className="text-slate-200 text-sm italic leading-relaxed">"Je data laat zien dat je sterk bent op korte inspanningen. Voor {activeClimb.name} moeten we focussen op het verhogen van je 'Time to Exhaustion' rond je FTP."</p>
             </div>
             <button onClick={() => setActiveTab('coach')} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded transition flex items-center gap-1 w-fit">Open AI Coach <ArrowRight size={12}/></button>
          </div>

          <div className="grid grid-rows-3 gap-3">
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-3 flex justify-between items-center px-5">
              <span className="text-slate-400 text-sm">Gewicht (kg)</span>
              <input 
                type="number" 
                value={userProfile.weight} 
                onChange={(e) => setUserProfile({...userProfile, weight: parseFloat(e.target.value) || 0})}
                className="bg-slate-900/50 border border-slate-600 rounded px-2 py-1 text-right text-white font-bold w-20 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-3 flex justify-between items-center px-5">
              <span className="text-slate-400 text-sm">FTP (W)</span>
              <input 
                type="number" 
                value={userProfile.ftp} 
                onChange={(e) => setUserProfile({...userProfile, ftp: parseFloat(e.target.value) || 0})}
                className="bg-slate-900/50 border border-slate-600 rounded px-2 py-1 text-right text-green-400 font-bold w-20 focus:outline-none focus:border-green-500"
              />
            </div>
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-3 flex justify-between items-center px-5">
              <span className="text-slate-400 text-sm">W/kg</span>
              <span className="text-blue-400 font-bold text-lg">{(userProfile.ftp/userProfile.weight).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-80">
          <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-slate-300 text-sm font-bold">FTP Progressie</h4>
              <div className="flex gap-1 bg-slate-900 p-1 rounded-lg">
                {['6m', '1y', 'all'].map(range => (
                  <button 
                    key={range} 
                    onClick={() => setFtpTimeRange(range)}
                    className={`px-2 py-0.5 text-[10px] rounded uppercase ${ftpTimeRange === range ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    {range === '6m' ? '6 Mnd' : range === '1y' ? '1 Jaar' : 'Alles'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ftpHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                  <YAxis domain={['dataMin - 10', 'dataMax + 10']} stroke="#94a3b8" fontSize={10} />
                  <RechartsTooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155'}} />
                  <Line type="monotone" dataKey="ftp" stroke="#22c55e" strokeWidth={3} dot={{r:3}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 flex flex-col">
            <h4 className="text-slate-300 text-sm font-bold mb-4">Training Load (TSS)</h4>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={loadData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} />
                  <YAxis stroke="#94a3b8" fontSize={10} />
                  <RechartsTooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155'}} />
                  <Bar dataKey="tss" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
            <div>
              <h4 className="text-white font-bold text-sm">Beste Prestaties</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Automatisch uit logboek</p>
            </div>
            <div className="flex gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
              {['p5', 'p20', 'p60'].map(t => (
                <button 
                  key={t} onClick={() => setBestPowerTab(t)}
                  className={`px-3 py-1 text-xs font-bold rounded transition ${bestPowerTab === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  {t === 'p5' ? '5 Min' : t === 'p20' ? '20 Min' : '60 Min'}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-900 text-slate-500 uppercase text-xs">
                <tr><th className="p-3">Rang</th><th className="p-3">Datum</th><th className="p-3">Activiteit</th><th className="p-3 text-right">Wattage</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {getTopPerformances(bestPowerTab).map((act, i) => (
                  <tr key={act.id} className="hover:bg-slate-700/50">
                    <td className="p-3 text-slate-500 font-mono w-12">#{i+1}</td>
                    <td className="p-3 text-slate-300 font-mono w-32">{act.date}</td>
                    <td className="p-3 text-white font-medium">{act.name}</td>
                    <td className={`p-3 text-right font-bold text-lg ${bestPowerTab === 'p5' ? 'text-yellow-400' : bestPowerTab === 'p20' ? 'text-orange-400' : 'text-red-400'}`}>
                      {act[bestPowerTab]}w
                    </td>
                  </tr>
                ))}
                {getTopPerformances(bestPowerTab).length === 0 && (
                  <tr><td colSpan="4" className="p-4 text-center text-slate-500 italic">Nog geen data in logboek.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const ClimbManager = () => {
    const [mainFilter, setMainFilter] = useState('All');
    const [countryFilter, setCountryFilter] = useState('All');
    const [regionFilter, setRegionFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('2d');
    const [isCreating, setIsCreating] = useState(false);
    const [newClimb, setNewClimb] = useState({ name: '', distance: '', elevation: '', country: 'FR', flag: '🇫🇷' });

    const availableCountries = useMemo(() => {
      const relevant = mainFilter === 'All' ? climbs : climbs.filter(c => c.type === mainFilter);
      return [...new Set(relevant.map(c => c.country))].sort();
    }, [mainFilter, climbs]);

    const availableRegions = useMemo(() => {
      let relevant = mainFilter === 'All' ? climbs : climbs.filter(c => c.type === mainFilter);
      if(countryFilter !== 'All') relevant = relevant.filter(c => c.country === countryFilter);
      return [...new Set(relevant.map(c => c.region))].sort();
    }, [mainFilter, countryFilter, climbs]);

    const filteredClimbs = climbs.filter(c => {
      const matchMain = mainFilter === 'All' || c.type === mainFilter;
      const matchCountry = countryFilter === 'All' || c.country === countryFilter;
      const matchRegion = regionFilter === 'All' || c.region === regionFilter;
      const matchSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchMain && matchCountry && matchRegion && matchSearch;
    });

    const handleCreate = () => {
      if(!newClimb.name || !newClimb.distance || !newClimb.elevation) return;
      const dist = parseFloat(newClimb.distance);
      const elev = parseFloat(newClimb.elevation);
      const profile = generateNaturalProfile(dist, elev);
      
      const created = { 
        id: `custom_${Date.now()}`,
        ...newClimb, 
        distance: dist, 
        elevation: elev,
        avgGrade: ((elev / (dist * 1000)) * 100).toFixed(1),
        type: 'Custom',
        region: 'Custom',
        profile: profile
      };
      saveCustomClimb(created);
      setActiveClimb(created);
      setIsCreating(false);
    };

    const deleteClimb = (id) => {
      setClimbs(prev => prev.filter(c => c.id !== id));
      if(activeClimb.id === id) setActiveClimb(climbs[0]);
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)] min-h-[600px]">
        <div className="lg:col-span-4 bg-slate-800 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
          <div className="p-4 bg-slate-900 border-b border-slate-700 space-y-3">
             <div className="flex justify-between items-center">
                <h3 className="font-bold text-white flex items-center gap-2"><Database size={16}/> Database ({filteredClimbs.length})</h3>
                <button onClick={() => setIsCreating(!isCreating)} className="text-green-400 hover:bg-slate-800 p-1 rounded transition">
                  {isCreating ? <X/> : <div className="flex items-center gap-1 text-xs font-bold border border-green-500 px-2 py-1 rounded"><Zap size={12}/> NIEUW</div>}
                </button>
             </div>

             {isCreating ? (
               <div className="bg-slate-800 border border-slate-600 p-3 rounded space-y-2 animate-in fade-in">
                 <div className="text-xs text-slate-400 mb-2 font-bold uppercase">Custom Climb Creator</div>
                 <input className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-xs text-white" placeholder="Naam" value={newClimb.name} onChange={e => setNewClimb({...newClimb, name: e.target.value})}/>
                 <div className="flex gap-2">
                   <select className="bg-slate-900 border border-slate-700 p-2 rounded text-xs text-white" value={newClimb.country} onChange={e => {
                     const val = e.target.value;
                     const flag = val === 'FR' ? '🇫🇷' : val === 'IT' ? '🇮🇹' : val === 'ES' ? '🇪🇸' : '🏳️';
                     setNewClimb({...newClimb, country: val, flag: flag});
                   }}>
                     <option value="FR">🇫🇷 Frankrijk</option>
                     <option value="IT">🇮🇹 Italië</option>
                     <option value="ES">🇪🇸 Spanje</option>
                     <option value="NL">🇳🇱 NL</option>
                     <option value="BE">🇧🇪 BE</option>
                     <option value="OTHER">🏳️ Overig</option>
                   </select>
                 </div>
                 <div className="flex gap-2">
                   <input type="number" className="w-1/2 bg-slate-900 border border-slate-700 p-2 rounded text-xs text-white" placeholder="Afstand (km)" value={newClimb.distance} onChange={e => setNewClimb({...newClimb, distance: e.target.value})}/>
                   <input type="number" className="w-1/2 bg-slate-900 border border-slate-700 p-2 rounded text-xs text-white" placeholder="Hoogtemeters (m)" value={newClimb.elevation} onChange={e => setNewClimb({...newClimb, elevation: e.target.value})}/>
                 </div>
                 <button onClick={handleCreate} className="w-full bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-2 rounded">Genereer Natuurlijk Profiel</button>
               </div>
             ) : (
               <div className="space-y-2">
                 <div className="flex gap-2">
                   <select className="bg-slate-800 text-xs text-white border border-slate-700 rounded p-2 flex-1 outline-none" value={mainFilter} onChange={e => {setMainFilter(e.target.value); setCountryFilter('All'); setRegionFilter('All');}}>
                     <option value="All">Alle Types</option>
                     <option value="Real">Real World</option>
                     <option value="Zwift">Zwift</option>
                     <option value="Custom">Custom</option>
                   </select>
                   <select className="bg-slate-800 text-xs text-white border border-slate-700 rounded p-2 flex-1 outline-none" value={countryFilter} onChange={e => {setCountryFilter(e.target.value); setRegionFilter('All');}}>
                     <option value="All">Alle Landen</option>
                     {availableCountries.map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                 </div>
                 <div className="relative">
                   <Search className="absolute left-2 top-2 text-slate-500" size={14}/>
                   <input className="w-full bg-slate-800 border border-slate-700 rounded pl-8 p-2 text-xs text-white outline-none" placeholder="Zoek op naam..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                 </div>
               </div>
             )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {filteredClimbs.map(c => (
              <div key={c.id} onClick={() => setActiveClimb(c)} className={`p-3 rounded cursor-pointer border transition flex justify-between items-center group ${activeClimb.id === c.id ? 'bg-blue-900/30 border-blue-500' : 'border-transparent hover:bg-slate-700/50'}`}>
                <div className="flex-1">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="text-base">{c.flag}</span> {c.name}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-2">
                    {c.region}
                    {c.type === 'Real' && <span className="text-blue-400 bg-blue-900/30 px-1 rounded">CF</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono text-white bg-slate-700 px-1 rounded mb-0.5">{c.distance}km</div>
                  <div className="text-xs font-mono text-slate-400">{c.elevation}hm</div>
                  <div className={`text-[10px] font-bold mt-1 ${c.avgGrade > 9 ? 'text-red-400' : 'text-yellow-500'}`}>{c.avgGrade}%</div>
                </div>
                {c.type === 'Custom' && (
                  <button onClick={(e) => {e.stopPropagation(); deleteClimb(c.id)}} className="opacity-0 group-hover:opacity-100 ml-2 text-slate-500 hover:text-red-500"><Trash2 size={12}/></button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-6 overflow-y-auto">
          <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 min-h-[300px] flex flex-col shadow-lg">
             <div className="flex justify-between mb-4">
               <h2 className="text-xl font-bold text-white flex items-center gap-2">{activeClimb.flag} {activeClimb.name}</h2>
               <div className="flex bg-slate-900 rounded p-1">
                 <button onClick={() => setViewMode('2d')} className={`px-3 py-1 text-xs rounded ${viewMode==='2d' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>Map</button>
                 <button onClick={() => setViewMode('3d')} className={`px-3 py-1 text-xs rounded ${viewMode==='3d' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>Profiel</button>
               </div>
             </div>

             <div className="flex-1 bg-slate-900/50 rounded border border-slate-800 relative overflow-hidden flex items-center justify-center p-4">
                {viewMode === '3d' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activeProfile}>
                      <defs>
                        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                      <XAxis dataKey="km" stroke="#94a3b8" unit="km" fontSize={10}/>
                      <YAxis stroke="#94a3b8" unit="m" domain={['auto', 'auto']} fontSize={10}/>
                      <RechartsTooltip contentStyle={{backgroundColor: '#0f172a', border: '1px solid #334155'}}/>
                      <Area type="monotone" dataKey="elevation" stroke="#818cf8" fill="url(#grad)" strokeWidth={2}/>
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center text-slate-500">
                    <Map size={48} className="mx-auto mb-2 opacity-50"/>
                    <p>2D Map Integratie (Google Maps API Placeholder)</p>
                    <p className="text-xs mt-2">{activeClimb.country} - {activeClimb.region}</p>
                  </div>
                )}
             </div>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 flex-1 overflow-hidden shadow-lg">
            <div className="p-3 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
               <h3 className="font-bold text-white text-sm">Koersplan (Sectie Analyse)</h3>
               <span className="text-xs text-slate-500">Gegenereerd o.b.v. profiel</span>
            </div>
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900 text-slate-400 sticky top-0 z-10 shadow">
                   <tr>
                     <th className="p-3">Km</th>
                     <th className="p-3">Stijging</th>
                     <th className="p-3">Target Watt</th>
                     <th className="p-3">Cadans</th>
                     <th className="p-3">Weer</th>
                     <th className="p-3">Focus</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {activeProfile.map((seg, i) => {
                    const isSteep = seg.gradient > 9;
                    const isFlat = seg.gradient < 4;
                    const targetW = Math.round(userProfile.ftp * (isSteep ? 1.05 : isFlat ? 0.85 : 0.95));
                    const wind = (i % 3 === 0) ? 'Tegen' : 'Mee';

                    return (
                      <tr key={i} className="hover:bg-slate-700/30">
                        <td className="p-3 font-mono text-slate-300">{seg.km.toFixed(1)}</td>
                        <td className="p-3"><span className={`px-1.5 py-0.5 rounded font-bold ${isSteep ? 'bg-red-500/20 text-red-400' : isFlat ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{seg.gradient.toFixed(1)}%</span></td>
                        <td className="p-3 font-bold text-white">{targetW}w</td>
                        <td className="p-3 text-slate-400">{isSteep ? '70-75' : isFlat ? '90-100' : '80-90'}</td>
                        <td className="p-3 flex items-center gap-1 text-slate-400"><Wind size={10}/> {wind}</td>
                        <td className="p-3 italic text-slate-500">{isSteep ? 'Power & Torque' : isFlat ? 'Aero & Speed' : 'Rhythm'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const AICoach = () => {
    const [loading, setLoading] = useState(false);
    const [response, setResponse] = useState(null);

    const callGemini = (type) => {
      setLoading(true);
      setTimeout(() => {
        if(type === 'workout') {
          setResponse({
            title: `Klim Specifiek: ${activeClimb.name}`,
            core: "Deze klim bevat lange secties van >8%. We moeten je spieruithoudingsvermogen (Muscular Endurance) bij lage cadans trainen.",
            blocks: [
              { t: '15 min', d: 'Warming up Z1-Z2 met 3x1 min 110rpm.' },
              { t: '3 x 10 min', d: 'Z3 (Tempo) op 55-60 RPM. Focus op torque vanuit de heup. 5 min rust.' },
              { t: '15 min', d: 'Cooling down Z1.' }
            ]
          });
        } else {
          setResponse({
            title: "SWOT Analyse",
            core: "Je power curve laat een klassiek 'Puncheur' profiel zien. Sterk op kort werk, maar uithouding is een aandachtspunt.",
            blocks: [
              { t: 'Sterkte', d: 'Anaerobe capaciteit (5m power is hoog).' },
              { t: 'Zwakte', d: 'Aerobe drempel (Verval na 40 min is groot).' },
              { t: 'Kans', d: 'Winst te behalen door pacing te vlakken op lange klimmen.' }
            ]
          });
        }
        setLoading(false);
      }, 1000);
    };

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 text-center shadow-lg">
          <Brain size={48} className="mx-auto text-purple-400 mb-4"/>
          <h2 className="text-2xl font-bold text-white mb-2">AI Performance Coach</h2>
          <p className="text-slate-400 mb-6">Context-aware training advies voor <span className="text-white font-bold">{activeClimb.name}</span>.</p>
          <div className="flex justify-center gap-4">
             <button disabled={loading} onClick={() => callGemini('workout')} className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition disabled:opacity-50">
               {loading ? <RefreshCw className="animate-spin"/> : <Zap/>} Genereer Workout
             </button>
             <button disabled={loading} onClick={() => callGemini('swot')} className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition disabled:opacity-50">
               {loading ? <RefreshCw className="animate-spin"/> : <Activity/>} SWOT Analyse
             </button>
          </div>
        </div>
        <AnimatePresence>
          {response && (
            <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-xl">
               <div className="flex justify-between items-start border-b border-slate-800 pb-4 mb-4">
                 <h3 className="text-lg font-bold text-white flex items-center gap-2"><Brain size={18} className="text-purple-400"/> {response.title}</h3>
                 <button onClick={() => setResponse(null)} className="text-slate-500 hover:text-white"><X size={18}/></button>
               </div>
               <div className="bg-purple-500/10 border border-purple-500/30 p-4 rounded-lg mb-4">
                 <p className="text-purple-200 font-medium italic">"{response.core}"</p>
               </div>
               <div className="space-y-2">
                 {response.blocks.map((b, i) => (
                   <div key={i} className="flex gap-4 p-3 bg-slate-800 rounded border border-slate-700/50">
                      <span className="font-mono text-blue-400 w-24 shrink-0 text-sm font-bold">{b.t}</span>
                      <span className="text-slate-300 text-sm">{b.d}</span>
                   </div>
                 ))}
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const FuelingLab = () => {
    const [duration, setDuration] = useState(60);
    const [intensity, setIntensity] = useState(0.85);
    const carbs = Math.round((userProfile.weight > 75 ? 90 : 60) * (duration/60));
    const fluid = Math.round((500 + userProfile.weight * 5) * (duration/60));

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto items-center">
         <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-lg">
            <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2"><Droplet className="text-cyan-400"/> Fueling Calculator</h3>
            <div className="space-y-6">
               <div>
                  <label className="text-slate-400 text-sm mb-2 block">Verwachte Duur: <span className="text-white font-mono">{duration} min</span></label>
                  <input type="range" min="30" max="300" step="10" value={duration} onChange={e => setDuration(e.target.value)} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"/>
               </div>
               <div>
                  <label className="text-slate-400 text-sm mb-2 block">Intensiteit (IF): <span className="text-white font-mono">{(intensity*100).toFixed(0)}%</span></label>
                  <input type="range" min="0.6" max="1.1" step="0.05" value={intensity} onChange={e => setIntensity(e.target.value)} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"/>
               </div>
               <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-slate-400 text-xs">Carbs Nodig</div>
                    <div className="text-2xl font-bold text-green-400">{carbs}g</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-xs">Vocht Nodig</div>
                    <div className="text-2xl font-bold text-cyan-400">{fluid}ml</div>
                  </div>
               </div>
            </div>
         </div>
         <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
            <h4 className="text-white font-bold mb-2">AI Nutrition Tip</h4>
            <p className="text-slate-400 italic text-sm">"Bij {intensity*100}% intensiteit werkt je maag langzamer. Gebruik isotone gels en vermijd vaste voeding na het eerste uur. Start met 500ml vocht loading 2 uur voor de start."</p>
         </div>
      </div>
    );
  };

  const DataHub = () => {
    const [csvText, setCsvText] = useState('');
    const [parsedData, setParsedData] = useState([]);
    const fileInputRef = useRef(null);

    const parseData = (text) => {
      const lines = text.trim().split('\n');
      const results = [];
      const parseNum = (val) => {
        if (!val) return 0;
        return parseFloat(val.replace(',', '.').replace(/[^\d.-]/g, ''));
      };
      const parseTime = (val) => {
        if (!val) return 0;
        const parts = val.split(':').map(Number);
        if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2]; 
        if (parts.length === 2) return parts[0]*60 + parts[1]; 
        return 0;
      };

      for(let i=0; i<lines.length; i++) {
        const cols = lines[i].split(/;/);
        if(cols.length < 5) continue; 
        const date = cols[0]?.trim(); 
        if(date.toLowerCase().includes('date')) continue;

        const name = cols[1];
        const duration = parseTime(cols[3]);
        const isDup = activities.some(a => a.date === date && Math.abs(a.duration - duration) < 60);

        if(duration > 0) {
          results.push({
            id: `imp_${Date.now()}_${i}`,
            date, name, duration,
            distance: parseNum(cols[5]), 
            elevation: parseNum(cols[6]), 
            speed: parseNum(cols[17]), 
            hr: parseNum(cols[18]), 
            cadence: parseNum(cols[16]), 
            power: parseNum(cols[19]), 
            np: parseNum(cols[8]), 
            tss: parseNum(cols[11]), 
            p5: parseNum(cols[24]), 
            p20: parseNum(cols[25]), 
            p60: parseNum(cols[26]), 
            selected: !isDup,
            isDup
          });
        }
      }
      setParsedData(results);
    };

    const handleFileUpload = (e) => {
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => parseData(evt.target.result);
      reader.readAsText(file);
    };

    const commitImport = () => {
      const toAdd = parsedData.filter(d => d.selected).map(({selected, isDup, ...rest}) => rest);
      setActivities(prev => [...prev, ...toAdd]);
      setParsedData([]);
      setCsvText('');
      notify(`${toAdd.length} ritten geïmporteerd!`);
    };

    const toggleAll = (state) => setParsedData(parsedData.map(p => ({...p, selected: state})));

    const sortedActivities = useMemo(() => {
      return [...activities].sort((a, b) => parseDate(b.date) - parseDate(a.date));
    }, [activities]);

    return (
      <div className="space-y-6">
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <div className="flex justify-between items-center mb-4">
             <h3 className="text-white font-bold flex items-center gap-2"><Upload size={18}/> CSV Import Engine</h3>
             <div className="flex gap-2">
               <button onClick={() => fileInputRef.current.click()} className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2">
                 <FileText size={14}/> Upload Bestand
               </button>
               <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv,.txt"/>
             </div>
          </div>
          <textarea 
            value={csvText} onChange={e => setCsvText(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-xs font-mono text-slate-300 h-24 mb-3 focus:outline-none focus:border-blue-500"
            placeholder="Of plak ruwe CSV data hier..."
          />
          <div className="flex justify-between">
            <button onClick={() => parseData(csvText)} className="text-blue-400 text-xs font-bold hover:text-blue-300">Preview Data</button>
            {parsedData.length > 0 && (
              <button onClick={commitImport} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm font-bold flex items-center gap-2">
                <Check size={16}/> Importeer ({parsedData.filter(d => d.selected).length})
              </button>
            )}
          </div>

          {parsedData.length > 0 && (
            <div className="mt-4 border border-slate-700 rounded overflow-hidden overflow-x-auto">
              <div className="bg-slate-900 p-2 flex gap-2 border-b border-slate-700 sticky left-0">
                <button onClick={() => toggleAll(true)} className="text-[10px] text-slate-400 hover:text-white uppercase">Select All</button>
                <button onClick={() => toggleAll(false)} className="text-[10px] text-slate-400 hover:text-white uppercase">Select None</button>
              </div>
              <table className="w-full text-xs text-left min-w-[800px]">
                <thead className="bg-slate-900 text-slate-400 uppercase">
                  <tr><th className="p-3">Sel</th><th className="p-3">Datum</th><th className="p-3">Naam</th><th className="p-3 text-green-400">Watt</th><th className="p-3">Status</th></tr>
                </thead>
                <tbody>
                  {parsedData.map(d => (
                    <tr key={d.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                      <td className="p-3"><input type="checkbox" checked={d.selected} onChange={() => setParsedData(parsedData.map(p => p.id === d.id ? {...p, selected: !p.selected} : p))}/></td>
                      <td className="p-3 text-slate-300 font-mono">{d.date}</td>
                      <td className="p-3 text-white max-w-[150px] truncate" title={d.name}>{d.name}</td>
                      <td className="p-3 text-green-300 font-bold font-mono">{d.power}</td>
                      <td className="p-3">{d.isDup ? <span className="text-red-400 bg-red-900/20 px-1 rounded border border-red-500/30 text-[10px]">DUPLICAAT</span> : <span className="text-green-400 text-[10px]">NIEUW</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
           <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Database size={18}/> Logboek</h3>
           <div className="overflow-x-auto">
             <table className="w-full text-xs text-left min-w-[800px]">
               <thead className="bg-slate-900 text-slate-400 uppercase">
                 <tr><th className="p-3">Datum</th><th className="p-3">Naam</th><th className="p-3">Duur</th><th className="p-3 text-green-400">Watt</th><th className="p-3 text-right">Actie</th></tr>
               </thead>
               <tbody className="divide-y divide-slate-700">
                 {sortedActivities.map(a => (
                   <tr key={a.id} className="hover:bg-slate-700/30">
                     <td className="p-3 font-mono text-slate-300">{a.date}</td>
                     <td className="p-3 font-bold text-white max-w-[150px] truncate" title={a.name}>{a.name}</td>
                     <td className="p-3 text-slate-400">{formatTime(a.duration)}</td>
                     <td className="p-3 text-green-300 font-bold font-mono">{a.power || a.np || '-'}</td>
                     <td className="p-3 text-right">
                       <button onClick={() => {setActivities(current => current.filter(x => x.id !== a.id)); notify("Activiteit verwijderd");}} className="text-slate-600 hover:text-red-500">
                         <Trash2 size={14}/>
                       </button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      </div>
    );
  };

  // --- APP SHELL ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      <AnimatePresence>
        {notification && (
          <motion.div initial={{y:-50, opacity:0}} animate={{y:0, opacity:1}} exit={{opacity:0}} className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-2 rounded-full font-bold shadow-2xl flex items-center gap-2 ${notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
            {notification.type === 'error' ? <AlertTriangle size={16}/> : <Check size={16}/>} {notification.msg}
          </motion.div>
        )}
      </AnimatePresence>
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2 rounded shadow-lg shadow-blue-500/20"><Mountain className="text-white" size={20}/></div>
             <h1 className="text-lg font-bold text-white tracking-tight">Climb Performance Lab <span className="text-xs text-blue-500 ml-1">CLOUD SYNC</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs font-mono text-slate-500 hidden md:block">
              FTP: <span className="text-green-400">{userProfile.ftp}W</span> • W/kg: <span className="text-blue-400">{(userProfile.ftp/userProfile.weight).toFixed(2)}</span>
            </div>
            {/* DE NIEUWE OPSLAAN KNOP */}
            <button 
              onClick={saveToCloud}
              disabled={syncStatus === 'syncing'}
              className={`flex items-center gap-2 px-4 py-2 rounded font-bold text-sm transition ${syncStatus === 'syncing' ? 'bg-yellow-600 text-white cursor-wait' : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/40'}`}
            >
              {syncStatus === 'syncing' ? <RefreshCw className="animate-spin" size={16}/> : <Save size={16}/>}
              {syncStatus === 'syncing' ? 'Opslaan...' : 'Opslaan in Cloud'}
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 sticky md:top-24 h-fit">
          {[
            {id: 'dashboard', icon: Activity, l: 'Dashboard'},
            {id: 'strategy', icon: Map, l: 'Climb Manager'},
            {id: 'coach', icon: Brain, l: 'AI Coach'},
            {id: 'fuel', icon: Droplet, l: 'Fueling'},
            {id: 'data', icon: Database, l: 'Data Hub'},
          ].map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition whitespace-nowrap border ${activeTab === item.id ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/40' : 'border-transparent text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
              <item.icon size={18}/> {item.l}
            </button>
          ))}
        </nav>
        <div className="min-h-[80vh]">
          {activeTab === 'dashboard' && <Dashboard/>}
          {activeTab === 'strategy' && <ClimbManager/>}
          {activeTab === 'coach' && <AICoach/>}
          {activeTab === 'fuel' && <FuelingLab/>}
          {activeTab === 'data' && <DataHub/>}
        </div>
      </main>
    </div>
  );
}