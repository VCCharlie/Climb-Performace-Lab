import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { 
  Activity, Map, Zap, Database, Upload, Trash2, 
  ChevronDown, Mountain, TrendingUp, Search, Wind, Brain, Droplet, ArrowRight,
  BarChart2, X, RefreshCw, FileText, Check, AlertTriangle, Filter, Globe, Calendar, Clock, Edit2, Save, Download, Link as LinkIcon, Settings, HelpCircle
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, Legend
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

// --- FIREBASE CONFIGURATIE ---
const firebaseConfig = {
  apiKey: "AIzaSyBNWzcEXhzra-iCkHiZj_FdYUf0NcKvHAk",
  authDomain: "climb-performance-lab.firebaseapp.com",
  projectId: "climb-performance-lab",
  storageBucket: "climb-performance-lab.firebasestorage.app",
  messagingSenderId: "97555677694",
  appId: "1:97555677694:web:fa84b31445639e260cc0af",
  measurementId: "G-G4WLCWCXFK"
};

// Initialiseer Firebase veilig
let app;
let db;
try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
} catch (e) {
    // Firebase already initialized
}

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
  if (!distanceKm || distanceKm <= 0) return []; 
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

  if(profile.length > 0 && elevationM > 0) {
      const finalElev = profile[profile.length - 1].elevation;
      const scale = finalElev > 0 ? elevationM / finalElev : 1;
      return profile.map(p => ({
          ...p,
          elevation: Math.round(p.elevation * scale),
          gradient: parseFloat((p.gradient * scale).toFixed(1))
      }));
  }
  return profile;
};

const parseDate = (dateStr) => {
    if(!dateStr) return new Date(0);
    if (dateStr.includes('T')) return new Date(dateStr);
    const cleanStr = dateStr.split(' ')[0];
    const parts = cleanStr.split(/[\/\-]/);
    if (parts.length === 3) {
        if (parts[2].length === 4) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    return new Date(dateStr);
};

// --- MASSIVE DATABASE RESTORED ---

const ZWIFT_CLIMBS = [
  // Watopia
  { id: 'z_adz', name: "Alpe du Zwift", region: "Watopia", country: "Zwift", flag: "🟧", distance: 12.2, elevation: 1036, avgGrade: 8.5 },
  { id: 'z_epic_kom', name: "Epic KOM", region: "Watopia", country: "Zwift", flag: "🟧", distance: 9.4, elevation: 540, avgGrade: 5.9 },
  { id: 'z_epic_rev', name: "Epic KOM Reverse", region: "Watopia", country: "Zwift", flag: "🟧", distance: 6.2, elevation: 337, avgGrade: 5.9 },
  { id: 'z_radio', name: "Radio Tower", region: "Watopia", country: "Zwift", flag: "🟧", distance: 1.1, elevation: 150, avgGrade: 13.7 },
  { id: 'z_volcano', name: "Volcano KOM", region: "Watopia", country: "Zwift", flag: "🟧", distance: 3.7, elevation: 125, avgGrade: 3.2 },
  { id: 'z_hilly', name: "Hilly KOM", region: "Watopia", country: "Zwift", flag: "🟧", distance: 0.9, elevation: 50, avgGrade: 5.5 },
  // France
  { id: 'z_ven_top', name: "Ven-Top", region: "France", country: "Zwift", flag: "🟧", distance: 19.0, elevation: 1534, avgGrade: 8.0 },
  { id: 'z_petit', name: "Petit KOM", region: "France", country: "Zwift", flag: "🟧", distance: 2.7, elevation: 110, avgGrade: 4.0 },
  // Innsbruck
  { id: 'z_innsbruck', name: "Innsbruck KOM", region: "Innsbruck", country: "Zwift", flag: "🟧", distance: 7.4, elevation: 400, avgGrade: 5.4 },
  { id: 'z_igls', name: "Igls (Reverse)", region: "Innsbruck", country: "Zwift", flag: "🟧", distance: 5.6, elevation: 230, avgGrade: 4.1 },
  // London
  { id: 'z_leith', name: "Leith Hill", region: "London", country: "Zwift", flag: "🟧", distance: 1.9, elevation: 134, avgGrade: 6.8 },
  { id: 'z_keith', name: "Keith Hill", region: "London", country: "Zwift", flag: "🟧", distance: 4.2, elevation: 228, avgGrade: 5.2 },
  { id: 'z_box', name: "Box Hill", region: "London", country: "Zwift", flag: "🟧", distance: 3.0, elevation: 137, avgGrade: 4.3 },
  // Yorkshire
  { id: 'z_yorkshire', name: "Yorkshire KOM", region: "Yorkshire", country: "Zwift", flag: "🟧", distance: 1.2, elevation: 55, avgGrade: 4.6 },
  // Makuri
  { id: 'z_temple', name: "Temple KOM", region: "Makuri", country: "Zwift", flag: "🟧", distance: 2.5, elevation: 99, avgGrade: 3.9 },
  { id: 'z_rooftop', name: "Rooftop KOM", region: "Makuri", country: "Zwift", flag: "🟧", distance: 1.9, elevation: 54, avgGrade: 2.7 },
  // Scotland
  { id: 'z_sgurr', name: "Sgurr Summit South", region: "Scotland", country: "Zwift", flag: "🟧", distance: 1.0, elevation: 33, avgGrade: 3.3 },
  // New York
  { id: 'z_nyc', name: "NYC KOM", region: "New York", country: "Zwift", flag: "🟧", distance: 1.4, elevation: 89, avgGrade: 6.4 },
  // Bologna
  { id: 'z_bologna', name: "Bologna TT", region: "Italy", country: "Zwift", flag: "🟧", distance: 2.1, elevation: 200, avgGrade: 9.6 },
  // CLIMB PORTAL ROTATIONS
  { id: 'zp_cote_pike', name: "Côte de Pike", region: "Portal", country: "Zwift", flag: "🌀", distance: 2.0, elevation: 200, avgGrade: 10.0 },
  { id: 'zp_aravis', name: "Col des Aravis", region: "Portal", country: "Zwift", flag: "🌀", distance: 4.5, elevation: 250, avgGrade: 5.5 },
  { id: 'zp_aspin', name: "Col d'Aspin", region: "Portal", country: "Zwift", flag: "🌀", distance: 12.0, elevation: 779, avgGrade: 6.5 },
  { id: 'zp_rocacorba', name: "Rocacorba", region: "Portal", country: "Zwift", flag: "🌀", distance: 13.3, elevation: 800, avgGrade: 6.0 },
  { id: 'zp_crow_road', name: "Crow Road", region: "Portal", country: "Zwift", flag: "🌀", distance: 5.5, elevation: 250, avgGrade: 4.5 },
  { id: 'zp_ezaro', name: "Mirador de Ézaro", region: "Portal", country: "Zwift", flag: "🌀", distance: 1.8, elevation: 270, avgGrade: 14.8 },
  { id: 'zp_platzer', name: "Col du Platzerwasel", region: "Portal", country: "Zwift", flag: "🌀", distance: 7.1, elevation: 590, avgGrade: 8.3 },
  { id: 'zp_tourmalet', name: "Col du Tourmalet", region: "Portal", country: "Zwift", flag: "🌀", distance: 17.1, elevation: 1268, avgGrade: 7.4 },
  { id: 'zp_superbag', name: "Superbagnères", region: "Portal", country: "Zwift", flag: "🌀", distance: 18.5, elevation: 1100, avgGrade: 6.0 },
  { id: 'zp_luit', name: "Col de Luitel", region: "Portal", country: "Zwift", flag: "🌀", distance: 9.8, elevation: 800, avgGrade: 8.0 },
];

const BENELUX_CLIMBS = [
  // NEDERLAND
  { id: 'nl_camerig', name: "Camerig", region: "Zuid-Limburg", country: "NL", flag: "🇳🇱", distance: 4.6, elevation: 175, avgGrade: 3.8 },
  { id: 'nl_vaals', name: "Vaalserberg", region: "Zuid-Limburg", country: "NL", flag: "🇳🇱", distance: 2.6, elevation: 110, avgGrade: 4.2 },
  { id: 'nl_keuten', name: "Keutenberg", region: "Zuid-Limburg", country: "NL", flag: "🇳🇱", distance: 1.2, elevation: 68, avgGrade: 5.9 },
  { id: 'nl_cauberg', name: "Cauberg", region: "Zuid-Limburg", country: "NL", flag: "🇳🇱", distance: 0.8, elevation: 48, avgGrade: 6.5 },
  { id: 'nl_eyser', name: "Eyserbosweg", region: "Zuid-Limburg", country: "NL", flag: "🇳🇱", distance: 1.1, elevation: 90, avgGrade: 8.1 },
  { id: 'nl_gulper', name: "Gulperberg", region: "Zuid-Limburg", country: "NL", flag: "🇳🇱", distance: 0.6, elevation: 55, avgGrade: 9.8 },
  { id: 'nl_loor', name: "Loorberg", region: "Zuid-Limburg", country: "NL", flag: "🇳🇱", distance: 1.5, elevation: 80, avgGrade: 5.3 },
  { id: 'nl_from', name: "Fromberg", region: "Zuid-Limburg", country: "NL", flag: "🇳🇱", distance: 1.6, elevation: 65, avgGrade: 4.0 },
  { id: 'nl_posbank', name: "Posbank", region: "Veluwe", country: "NL", flag: "🇳🇱", distance: 2.2, elevation: 85, avgGrade: 3.9 },
  { id: 'nl_amerong', name: "Amerongse Berg", region: "Utrechtse Heuvelrug", country: "NL", flag: "🇳🇱", distance: 1.8, elevation: 65, avgGrade: 3.6 },
  { id: 'nl_italia', name: "Italiaanseweg", region: "Veluwe", country: "NL", flag: "🇳🇱", distance: 1.2, elevation: 55, avgGrade: 4.5 },
  { id: 'nl_grebbe', name: "Grebbeberg", region: "Utrechtse Heuvelrug", country: "NL", flag: "🇳🇱", distance: 0.7, elevation: 40, avgGrade: 5.5 },
  { id: 'nl_holter', name: "Holterberg", region: "Overijssel", country: "NL", flag: "🇳🇱", distance: 2.5, elevation: 50, avgGrade: 2.0 },
  { id: 'nl_vam', name: "VAM-Berg", region: "Drenthe", country: "NL", flag: "🇳🇱", distance: 0.5, elevation: 40, avgGrade: 9.6 },
  // BELGIË
  { id: 'be_redoute', name: "La Redoute", region: "Ardennen", country: "BE", flag: "🇧🇪", distance: 1.6, elevation: 156, avgGrade: 9.5 },
  { id: 'be_stockeu', name: "Côte de Stockeu", region: "Ardennen", country: "BE", flag: "🇧🇪", distance: 2.3, elevation: 227, avgGrade: 9.9 },
  { id: 'be_rosier', name: "Col du Rosier", region: "Ardennen", country: "BE", flag: "🇧🇪", distance: 4.4, elevation: 255, avgGrade: 5.8 },
  { id: 'be_huy', name: "Mur de Huy", region: "Ardennen", country: "BE", flag: "🇧🇪", distance: 1.3, elevation: 125, avgGrade: 9.6 },
  { id: 'be_thier', name: "Thier de Coo", region: "Ardennen", country: "BE", flag: "🇧🇪", distance: 2.6, elevation: 220, avgGrade: 8.5 },
  { id: 'be_baraque', name: "Baraque de Fraiture", region: "Ardennen", country: "BE", flag: "🇧🇪", distance: 6.0, elevation: 280, avgGrade: 4.6 },
  { id: 'be_haussire', name: "Col de Haussire", region: "Ardennen", country: "BE", flag: "🇧🇪", distance: 3.8, elevation: 250, avgGrade: 6.5 },
  { id: 'be_wanne', name: "Côte de Wanne", region: "Ardennen", country: "BE", flag: "🇧🇪", distance: 2.2, elevation: 165, avgGrade: 7.5 },
  { id: 'be_roche', name: "La Roche-aux-Faucons", region: "Ardennen", country: "BE", flag: "🇧🇪", distance: 1.3, elevation: 145, avgGrade: 11.0 },
  { id: 'be_kwaremont', name: "Oude Kwaremont", region: "Vlaanderen", country: "BE", flag: "🇧🇪", distance: 2.2, elevation: 93, avgGrade: 4.2 },
  { id: 'be_pater', name: "Paterberg", region: "Vlaanderen", country: "BE", flag: "🇧🇪", distance: 0.4, elevation: 48, avgGrade: 12.9 },
  { id: 'be_koppen', name: "Koppenberg", region: "Vlaanderen", country: "BE", flag: "🇧🇪", distance: 0.6, elevation: 64, avgGrade: 11.6 },
  { id: 'be_kemmel', name: "Kemmelberg", region: "Vlaanderen", country: "BE", flag: "🇧🇪", distance: 1.4, elevation: 109, avgGrade: 7.8 },
  { id: 'be_muur', name: "Muur van Geraardsbergen", region: "Vlaanderen", country: "BE", flag: "🇧🇪", distance: 1.1, elevation: 92, avgGrade: 8.7 },
  // LUXEMBURG
  { id: 'lu_vianden', name: "Mont Saint-Nicolas", region: "Luxemburg", country: "LU", flag: "🇱🇺", distance: 3.5, elevation: 290, avgGrade: 8.3 },
  { id: 'lu_bourscheid', name: "Bourscheid-Moulin", region: "Luxemburg", country: "LU", flag: "🇱🇺", distance: 3.6, elevation: 265, avgGrade: 7.4 },
  { id: 'lu_esch', name: "Esch-sur-Sûre", region: "Luxemburg", country: "LU", flag: "🇱🇺", distance: 2.5, elevation: 160, avgGrade: 6.4 },
  { id: 'lu_putscheid', name: "Putscheid", region: "Luxemburg", country: "LU", flag: "🇱🇺", distance: 2.8, elevation: 210, avgGrade: 7.5 },
  { id: 'lu_kauten', name: "Kautenbach", region: "Luxemburg", country: "LU", flag: "🇱🇺", distance: 4.5, elevation: 230, avgGrade: 5.1 },
];

const REAL_WORLD_CLIMBS = [
  // Frankrijk
  { id: 'alpe_huez', name: "Alpe d'Huez", region: "Alpen", country: "FR", flag: "🇫🇷", distance: 13.8, elevation: 1135, avgGrade: 8.1 },
  { id: 'galibier', name: "Col du Galibier", region: "Alpen", country: "FR", flag: "🇫🇷", distance: 18.1, elevation: 1245, avgGrade: 6.9 },
  { id: 'glandon', name: "Col du Glandon", region: "Alpen", country: "FR", flag: "🇫🇷", distance: 21.3, elevation: 1472, avgGrade: 6.9 },
  { id: 'madeleine', name: "Col de la Madeleine", region: "Alpen", country: "FR", flag: "🇫🇷", distance: 19.2, elevation: 1522, avgGrade: 7.9 },
  { id: 'izoard', name: "Col d'Izoard", region: "Alpen", country: "FR", flag: "🇫🇷", distance: 14.1, elevation: 1000, avgGrade: 7.1 },
  { id: 'croix_fer', name: "Col de la Croix-de-Fer", region: "Alpen", country: "FR", flag: "🇫🇷", distance: 29.4, elevation: 1520, avgGrade: 5.2 },
  { id: 'telegraphe', name: "Col du Télégraphe", region: "Alpen", country: "FR", flag: "🇫🇷", distance: 11.8, elevation: 856, avgGrade: 7.3 },
  { id: 'ventoux', name: "Mont Ventoux (Bédoin)", region: "Provence", country: "FR", flag: "🇫🇷", distance: 21.0, elevation: 1610, avgGrade: 7.5 },
  { id: 'ventoux_mal', name: "Mont Ventoux (Malaucène)", region: "Provence", country: "FR", flag: "🇫🇷", distance: 21.2, elevation: 1535, avgGrade: 7.2 },
  { id: 'puy_dome', name: "Puy de Dôme", region: "Centraal", country: "FR", flag: "🇫🇷", distance: 10.5, elevation: 780, avgGrade: 7.4 },
  { id: 'planche', name: "Planche des Belles Filles", region: "Vogezen", country: "FR", flag: "🇫🇷", distance: 5.9, elevation: 500, avgGrade: 8.5 },
  { id: 'ballon_alsace', name: "Ballon d'Alsace", region: "Vogezen", country: "FR", flag: "🇫🇷", distance: 12.4, elevation: 643, avgGrade: 5.2 },
  { id: 'grand_ballon', name: "Grand Ballon", region: "Vogezen", country: "FR", flag: "🇫🇷", distance: 13.5, elevation: 950, avgGrade: 7.0 },
  { id: 'tourmalet', name: "Col du Tourmalet", region: "Pyreneeën", country: "FR", flag: "🇫🇷", distance: 18.3, elevation: 1404, avgGrade: 7.7 },
  { id: 'aubisque', name: "Col d'Aubisque", region: "Pyreneeën", country: "FR", flag: "🇫🇷", distance: 16.6, elevation: 1190, avgGrade: 7.2 },
  { id: 'hautacam', name: "Hautacam", region: "Pyreneeën", country: "FR", flag: "🇫🇷", distance: 13.5, elevation: 1050, avgGrade: 7.8 },
  // Italië
  { id: 'stelvio', name: "Passo dello Stelvio", region: "Dolomieten", country: "IT", flag: "🇮🇹", distance: 24.3, elevation: 1808, avgGrade: 7.4 },
  { id: 'mortirolo', name: "Mortirolo", region: "Dolomieten", country: "IT", flag: "🇮🇹", distance: 12.4, elevation: 1300, avgGrade: 10.5 },
  { id: 'gavia', name: "Passo Gavia", region: "Dolomieten", country: "IT", flag: "🇮🇹", distance: 17.3, elevation: 1363, avgGrade: 7.9 },
  { id: 'zoncolan', name: "Monte Zoncolan", region: "Dolomieten", country: "IT", flag: "🇮🇹", distance: 10.1, elevation: 1210, avgGrade: 11.9 },
  { id: 'tre_cime', name: "Tre Cime di Lavaredo", region: "Dolomieten", country: "IT", flag: "🇮🇹", distance: 7.5, elevation: 560, avgGrade: 7.5 },
  { id: 'finestre', name: "Colle delle Finestre", region: "Alpen", country: "IT", flag: "🇮🇹", distance: 18.6, elevation: 1694, avgGrade: 9.1 },
  // Spanje
  { id: 'angliru', name: "Alto de l'Angliru", region: "Asturië", country: "ES", flag: "🇪🇸", distance: 12.5, elevation: 1266, avgGrade: 10.1 },
  { id: 'lagos', name: "Lagos de Covadonga", region: "Asturië", country: "ES", flag: "🇪🇸", distance: 12.6, elevation: 890, avgGrade: 7.0 },
  { id: 'teide', name: "Mount Teide", region: "Tenerife", country: "ES", flag: "🇪🇸", distance: 50.0, elevation: 2300, avgGrade: 4.6 },
  { id: 'sa_calobra', name: "Sa Calobra", region: "Mallorca", country: "ES", flag: "🇪🇸", distance: 9.4, elevation: 670, avgGrade: 7.1 },
  // UK
  { id: 'hardknott', name: "Hardknott Pass", region: "Lake District", country: "UK", flag: "🇬🇧", distance: 2.2, elevation: 298, avgGrade: 13.3 },
  { id: 'wrynose', name: "Wrynose Pass", region: "Lake District", country: "UK", flag: "🇬🇧", distance: 2.7, elevation: 280, avgGrade: 10.4 },
  { id: 'green_lane', name: "Green Lane", region: "England", country: "UK", flag: "🇬🇧", distance: 5.7, elevation: 347, avgGrade: 6.1 },
  { id: 'park_rash', name: "Park Rash", region: "England", country: "UK", flag: "🇬🇧", distance: 4.2, elevation: 302, avgGrade: 7.2 },
  // Duitsland
  { id: 'nebelhorn', name: "Nebelhorn", region: "Beieren", country: "DE", flag: "🇩🇪", distance: 7.3, elevation: 1102, avgGrade: 15.1 },
  { id: 'schlappold', name: "Alpe Schlappold", region: "Beieren", country: "DE", flag: "🇩🇪", distance: 7.3, elevation: 876, avgGrade: 12.0 },
];

const FULL_CLIMB_DB = [
    ...REAL_WORLD_CLIMBS.map(c => ({...c, type: 'Real'})),
    ...BENELUX_CLIMBS.map(c => ({...c, type: 'Real'})),
    ...ZWIFT_CLIMBS.map(c => ({...c, type: 'Zwift'}))
];

const INITIAL_ACTIVITIES = [
  { id: 'a1', date: '01/09/2023', name: 'Base Mile Munching', duration: 10800, distance: 90, elevation: 400, speed: 30, hr: 135, cadence: 85, power: 180, np: 190, tss: 150, p5: 220, p20: 200, p60: 190 },
];

// --- MAIN COMPONENT ---

export default function ClimbPerformanceLab() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [userProfile, setUserProfile] = useState({ height: 1.83, weight: 70, ftp: 280 });
  const [activities, setActivities] = useState(INITIAL_ACTIVITIES);
  const [climbs, setClimbs] = useState(FULL_CLIMB_DB);
  const [activeClimb, setActiveClimb] = useState(FULL_CLIMB_DB[0]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle');

  // --- PERSISTENCE & SYNC ---
  useEffect(() => {
    const loadData = async () => {
        try {
            if (db) {
                const docRef = doc(db, "users", "default_user_v1");
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if(data.profile) setUserProfile(data.profile);
                    if(data.activities) setActivities(data.activities);
                    if(data.customClimbs) {
                        const customs = JSON.parse(data.customClimbs);
                        setClimbs(prev => {
                            const newIds = new Set(customs.map(c => c.id));
                            return [...prev.filter(c => !newIds.has(c.id)), ...customs];
                        });
                    }
                    setLoading(false);
                    return; 
                }
            }
        } catch (e) {
            console.warn("Cloud load failed", e);
        }

        const savedProfile = localStorage.getItem('cpl_profile');
        const savedActivities = localStorage.getItem('cpl_activities');
        const savedCustomClimbs = localStorage.getItem('cpl_custom_climbs');

        if (savedProfile) setUserProfile(JSON.parse(savedProfile));
        if (savedActivities) setActivities(JSON.parse(savedActivities));
        if (savedCustomClimbs) {
            const customs = JSON.parse(savedCustomClimbs);
            setClimbs(prev => {
                const newIds = new Set(customs.map(c => c.id));
                return [...prev.filter(c => !newIds.has(c.id)), ...customs];
            });
        }
        setLoading(false);
    };
    loadData();
  }, []);

  useEffect(() => {
    if(!loading) {
        localStorage.setItem('cpl_profile', JSON.stringify(userProfile));
        localStorage.setItem('cpl_activities', JSON.stringify(activities));
    }
  }, [userProfile, activities, loading]);

  const handleCloudSync = async () => {
      setSyncStatus('syncing');
      try {
          if (!db) throw new Error("Database niet verbonden");
          const customs = climbs.filter(c => c.type === 'Custom');
          await setDoc(doc(db, "users", "default_user_v1"), {
              profile: userProfile,
              activities: activities,
              customClimbs: JSON.stringify(customs),
              lastUpdated: new Date().toISOString()
          });
          setSyncStatus('success');
          notify("Data succesvol opgeslagen in Cloud!");
          setTimeout(() => setSyncStatus('idle'), 2000);
      } catch (e) {
          setSyncStatus('error');
          notify("Cloud opslaan mislukt", "error");
          setTimeout(() => setSyncStatus('idle'), 3000);
      }
  };

  const saveCustomClimb = (newClimb) => {
    const updatedClimbs = [...climbs, newClimb];
    setClimbs(updatedClimbs);
    const customs = updatedClimbs.filter(c => c.type === 'Custom');
    localStorage.setItem('cpl_custom_climbs', JSON.stringify(customs));
  };

  const notify = (msg, type='success') => {
    setNotification({msg, type});
    setTimeout(() => setNotification(null), 3000);
  };

  // --- HELPERS ---
  const activeProfile = useMemo(() => {
    if (!activeClimb) return [];
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

  // --- SUB-COMPONENTS ---

  const DashboardComponent = () => {
    const [targetTime, setTargetTime] = useState(60); 
    const reqSpeed = (activeClimb?.distance || 10) / (targetTime / 60);
    const reqWatts = calculateWattsForSpeed(activeClimb?.avgGrade || 5, userProfile.weight)(reqSpeed);
    const gap = reqWatts - userProfile.ftp;
    const [bestPowerTab, setBestPowerTab] = useState('p20');

    if(!activeClimb) return <div>Laden...</div>;

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
        <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg flex items-start gap-3">
            <Globe className="text-blue-500 shrink-0 mt-0.5" size={16}/>
            <div className="text-xs text-blue-200">
                <span className="font-bold">Status:</span> Klik rechtsboven op <strong>"Sync Cloud"</strong> om je ritten veilig in Firebase op te slaan.
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg p-5">
            <div className="flex justify-between items-start mb-4">
               <div>
                 <h3 className="text-blue-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2"><TrendingUp size={14}/> Goal Tracker</h3>
                 <h2 className="text-xl font-bold text-white mt-1">{activeClimb.name}</h2>
                 <p className="text-xs text-slate-500">{activeClimb.distance}km @ {activeClimb.avgGrade}%</p>
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
                <h4 className="text-white font-bold text-sm">Beste Prestaties (Power Records)</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Automatisch gegenereerd uit Logboek data</p>
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
                     <td className="p-3 text-white font-medium truncate max-w-[150px]">{act.name}</td>
                     <td className={`p-3 text-right font-bold text-lg ${bestPowerTab === 'p5' ? 'text-yellow-400' : bestPowerTab === 'p20' ? 'text-orange-400' : 'text-red-400'}`}>
                        {act[bestPowerTab]}w
                     </td>
                   </tr>
                 ))}
                 {getTopPerformances(bestPowerTab).length === 0 && (
                     <tr><td colSpan="4" className="p-4 text-center text-slate-500 italic">Geen data beschikbaar voor deze tijdspanne in het logboek.</td></tr>
                 )}
               </tbody>
             </table>
           </div>
        </div>
      </div>
    );
  };

  const ClimbManagerComponent = () => {
    // State for filters
    const [mainFilter, setMainFilter] = useState('All'); 
    const [countryFilter, setCountryFilter] = useState('All');
    const [regionFilter, setRegionFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    
    const [isCreating, setIsCreating] = useState(false);
    const [newClimb, setNewClimb] = useState({ name: '', distance: '', elevation: '', country: 'FR', flag: '🇫🇷' });

    // Crash prevention: check if climbs exists
    const safeClimbs = climbs || [];
    
    // Filter Logic
    const availableCountries = useMemo(() => {
        const relevant = mainFilter === 'All' ? safeClimbs : safeClimbs.filter(c => c.type === mainFilter);
        return [...new Set(relevant.map(c => c.country))].sort();
    }, [mainFilter, safeClimbs]);

    const availableRegions = useMemo(() => {
        let relevant = mainFilter === 'All' ? safeClimbs : safeClimbs.filter(c => c.type === mainFilter);
        if(countryFilter !== 'All') relevant = relevant.filter(c => c.country === countryFilter);
        return [...new Set(relevant.map(c => c.region))].sort();
    }, [mainFilter, countryFilter, safeClimbs]);

    const filteredClimbs = safeClimbs.filter(c => {
       const matchMain = mainFilter === 'All' || c.type === mainFilter;
       const matchCountry = countryFilter === 'All' || c.country === countryFilter;
       const matchRegion = regionFilter === 'All' || c.region === regionFilter;
       const matchSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
       return matchMain && matchCountry && matchRegion && matchSearch;
    });

    // Crash prevention: handle null activeClimb
    if (!activeClimb && safeClimbs.length > 0) setActiveClimb(safeClimbs[0]);

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
       notify("Custom klim & natuurlijk profiel gegenereerd!");
    };

    const deleteClimb = (id) => {
        setClimbs(prev => prev.filter(c => c.id !== id));
        // Reset active climb if deleted
        if(activeClimb && activeClimb.id === id) setActiveClimb(safeClimbs[0] || null);
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)] min-h-[600px] w-full">
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
                   {/* Filters restored */}
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
                   <div className="flex gap-2">
                        <select className="bg-slate-800 text-xs text-white border border-slate-700 rounded p-2 flex-1 outline-none" value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
                            <option value="All">Alle Regio's</option>
                            {availableRegions.map(r => <option key={r} value={r}>{r}</option>)}
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
                  <div key={c.id} onClick={() => setActiveClimb(c)} className={`p-3 rounded cursor-pointer border transition flex justify-between items-center group ${activeClimb?.id === c.id ? 'bg-blue-900/30 border-blue-500' : 'border-transparent hover:bg-slate-700/50'}`}>
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

         <div className="lg:col-span-8 bg-slate-800 rounded-xl border border-slate-700 p-4 flex flex-col">
            {activeClimb ? (
            <>
                <h2 className="text-xl font-bold text-white mb-4">{activeClimb.name}</h2>
                <div className="flex-1 bg-slate-900/50 rounded relative overflow-hidden">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={activeProfile}>
                            <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#818cf8" stopOpacity={0.8}/><stop offset="95%" stopColor="#818cf8" stopOpacity={0}/></linearGradient></defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                            <XAxis dataKey="km" stroke="#94a3b8" unit="km" fontSize={10}/>
                            <YAxis stroke="#94a3b8" unit="m" domain={['auto', 'auto']} fontSize={10}/>
                            <RechartsTooltip contentStyle={{backgroundColor: '#0f172a', border: '1px solid #334155'}}/>
                            <Area type="monotone" dataKey="elevation" stroke="#818cf8" fill="url(#grad)" strokeWidth={2}/>
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                
                {/* Koersplan Table embedded */}
                <div className="mt-4 h-48 overflow-y-auto border border-slate-700 rounded">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-slate-900 sticky top-0"><tr><th className="p-2">Km</th><th className="p-2">Grade</th><th className="p-2">Watt</th><th className="p-2">Cadans</th><th className="p-2">Focus</th></tr></thead>
                        <tbody>
                            {activeProfile.map((s,i) => (
                                <tr key={i} className="border-b border-slate-700/50">
                                    <td className="p-2 text-slate-300">{s.km.toFixed(1)}</td>
                                    <td className="p-2 font-bold text-white">{s.gradient.toFixed(1)}%</td>
                                    <td className="p-2 text-green-400">{Math.round(userProfile.ftp * (s.gradient > 9 ? 1.05 : 0.95))}w</td>
                                    <td className="p-2 text-slate-400">{s.gradient > 8 ? '70-80' : '90+'}</td>
                                    <td className="p-2 text-slate-500 italic">{s.gradient > 8 ? 'Power' : 'Aero'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </>
            ) : (
                <div className="flex h-full items-center justify-center text-slate-500">Selecteer een klim uit de database</div>
            )}
         </div>
      </div>
    );
  };

  const AICoachComponent = () => {
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
        }, 1500);
    };

    return (
       <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 text-center shadow-lg h-fit w-full">
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
          
          <div className="w-full">
            <AnimatePresence>
                {response && (
                    <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-xl h-full w-full">
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
       </div>
    );
  };
  
  const FuelingLabComponent = () => {
    const [duration, setDuration] = useState(60);
    const [intensity, setIntensity] = useState(0.85);
    const carbs = Math.round((userProfile.weight > 75 ? 90 : 60) * (duration/60));
    const fluid = Math.round((500 + userProfile.weight * 5) * (duration/60));

    return (
       <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-lg w-full">
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
          <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 h-fit w-full">
             <h4 className="text-white font-bold mb-2">AI Nutrition Tip</h4>
             <p className="text-slate-400 italic text-sm leading-relaxed">"Bij {intensity*100}% intensiteit werkt je maag langzamer. Gebruik isotone gels en vermijd vaste voeding na het eerste uur. Start met 500ml vocht loading 2 uur voor de start. Voor ritten langer dan 2 uur, overweeg natrium toevoeging."</p>
          </div>
       </div>
    );
  };

  const DataHubComponent = () => {
    // --- CSV LOGIC ---
    const [csvText, setCsvText] = useState('');
    const [parsedData, setParsedData] = useState([]);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const fileInputRef = useRef(null);

    const parseCSV = (text) => {
        const lines = text.trim().split('\n');
        const results = [];
        const parseNum = (val) => val ? parseFloat(val.replace(',', '.').replace(/[^\d.-]/g, '')) : 0;
        const parseTime = (val) => {
           if (!val) return 0;
           const parts = val.split(':').map(Number);
           return parts.length === 3 ? parts[0]*3600 + parts[1]*60 + parts[2] : parts.length === 2 ? parts[0]*60 + parts[1] : 0;
        };
        for(let i=0; i<lines.length; i++) {
            const cols = lines[i].split(/;/);
            if(cols.length < 5 || cols[0].toLowerCase().includes('date')) continue;
            const duration = parseTime(cols[3]);
            if(duration > 0) {
                results.push({
                    id: `csv_${Date.now()}_${i}`,
                    date: cols[0]?.trim(), name: cols[1], duration,
                    distance: parseNum(cols[5]), elevation: parseNum(cols[6]), speed: parseNum(cols[17]),
                    hr: parseNum(cols[18]), cadence: parseNum(cols[16]), power: parseNum(cols[19]),
                    p5: parseNum(cols[24]), p20: parseNum(cols[25]), p60: parseNum(cols[26]),
                    selected: true, source: 'CSV'
                });
            }
        }
        setParsedData(results);
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => parseCSV(evt.target.result);
        reader.readAsText(file);
    };

    // --- INTERVALS.ICU LOGIC (Improved V20 - Fix visibility) ---
    const [icuId, setIcuId] = useState('');
    const [icuKey, setIcuKey] = useState('');
    const [icuLoading, setIcuLoading] = useState(false);
    
    // Config: Dates & Types
    const [icuStart, setIcuStart] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().split('T')[0];
    });
    const [icuEnd, setIcuEnd] = useState(() => new Date().toISOString().split('T')[0]);
    const [activityTypes, setActivityTypes] = useState({ Ride: true, VirtualRide: true, Run: false, Walk: false });
    const [showOnlyNew, setShowOnlyNew] = useState(true);

    useEffect(() => {
        setIcuId(localStorage.getItem('cpl_icu_id') || '');
        setIcuKey(localStorage.getItem('cpl_icu_key') || '');
    }, []);

    const fetchIntervalsData = async () => {
        if (!icuId || !icuKey) { notify("Vul Athlete ID en API Key in", "error"); return; }
        setIcuLoading(true);
        localStorage.setItem('cpl_icu_id', icuId);
        localStorage.setItem('cpl_icu_key', icuKey);

        try {
            const auth = btoa("API_KEY:" + icuKey);
            const url = `https://intervals.icu/api/v1/athlete/${icuId}/activities?oldest=${icuStart}&newest=${icuEnd}`;
            const response = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });
            
            if (!response.ok) throw new Error("API Fout: " + response.status);
            
            const data = await response.json();
            let mapped = data.map((act) => ({
                id: `icu_${act.id}`,
                date: act.start_date_local.split('T')[0], name: act.name, duration: act.moving_time,
                distance: (act.distance / 1000).toFixed(2), elevation: act.total_elevation_gain,
                speed: (act.average_speed * 3.6).toFixed(1), hr: act.average_heartrate, cadence: act.average_cadence,
                power: act.average_watts, p5: 0, p20: 0, p60: 0, selected: true, source: 'API', type: act.type
            }));

            // Filter Types
            mapped = mapped.filter(item => activityTypes[item.type]);

            // Filter Duplicates (Optional)
            if(showOnlyNew) {
                mapped = mapped.filter(m => !activities.some(a => a.date === m.date && a.name === m.name));
            }
            
            setParsedData(mapped);
            if (mapped.length === 0) {
                notify("Geen ritten gevonden met deze filters", "error");
            } else {
                notify(`${mapped.length} ritten gevonden. Scroll omlaag om te selecteren.`);
            }

        } catch (error) {
            console.error(error);
            notify("Fetch mislukt. Check CORS of API Key.", "error");
        } finally {
            setIcuLoading(false);
        }
    };

    const commitImport = () => {
        const toAdd = parsedData.filter(d => d.selected);
        setActivities(prev => {
             const safeAdd = toAdd.filter(newA => !prev.some(existingA => existingA.date === newA.date && existingA.name === newA.name));
             return [...prev, ...safeAdd];
        });
        setParsedData([]);
        setCsvText('');
        notify(`${toAdd.length} ritten toegevoegd aan logboek!`);
    };

    const sortedActivities = useMemo(() => [...activities].sort((a,b) => parseDate(b.date) - parseDate(a.date)), [activities]);
    const toggleAll = (state) => setParsedData(parsedData.map(p => ({...p, selected: state})));

    return (
       <div className="space-y-6 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              {/* CSV BLOCK */}
              <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 w-full">
                 <div className="flex justify-between items-center mb-4"><h3 className="text-white font-bold flex items-center gap-2"><Upload size={18}/> CSV Import</h3></div>
                 <div className="flex gap-2 mb-3">
                    <button onClick={() => fileInputRef.current.click()} className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 w-full justify-center">
                        <FileText size={14}/> Upload Bestand
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv,.txt"/>
                 </div>
                 <textarea className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-xs font-mono text-slate-300 h-24 mb-3" placeholder="Of plak CSV tekst..." value={csvText} onChange={e => setCsvText(e.target.value)}/>
                 <button onClick={() => parseCSV(csvText)} className="text-blue-400 text-xs font-bold w-full text-center">Preview CSV</button>
              </div>

              {/* INTERVALS.ICU BLOCK */}
              <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 relative overflow-hidden w-full">
                 <div className="absolute top-0 right-0 p-2 opacity-10"><Globe size={64} className="text-blue-500"/></div>
                 <h3 className="text-white font-bold flex items-center gap-2 mb-4"><LinkIcon size={18}/> Intervals.icu API</h3>
                 <div className="space-y-3">
                    <div className="flex gap-2">
                         <input className="w-1/2 bg-slate-900 border border-slate-700 p-2 rounded text-xs text-white" placeholder="Athlete ID" value={icuId} onChange={e => setIcuId(e.target.value)}/>
                         <input type="password" className="w-1/2 bg-slate-900 border border-slate-700 p-2 rounded text-xs text-white" placeholder="API Key" value={icuKey} onChange={e => setIcuKey(e.target.value)}/>
                    </div>
                    
                    {/* DATE RANGE */}
                    <div className="flex gap-2 items-end">
                        <div className="flex-1">
                            <label className="text-[10px] text-slate-500 block mb-1">Van</label>
                            <input type="date" className="w-full bg-slate-900 border border-slate-700 p-1.5 rounded text-xs text-white" value={icuStart} onChange={e => setIcuStart(e.target.value)} />
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] text-slate-500 block mb-1">Tot</label>
                            <input type="date" className="w-full bg-slate-900 border border-slate-700 p-1.5 rounded text-xs text-white" value={icuEnd} onChange={e => setIcuEnd(e.target.value)} />
                        </div>
                    </div>

                    {/* TYPE FILTERS */}
                    <div className="flex flex-wrap gap-2 pt-1">
                         {Object.keys(activityTypes).map(type => (
                             <button 
                                key={type} 
                                onClick={() => setActivityTypes(prev => ({...prev, [type]: !prev[type]}))}
                                className={`px-2 py-1 rounded text-[10px] border ${activityTypes[type] ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-500'}`}
                             >
                                 {type}
                             </button>
                         ))}
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                        <input type="checkbox" checked={showOnlyNew} onChange={e => setShowOnlyNew(e.target.checked)} className="rounded bg-slate-700 border-slate-600"/>
                        <span className="text-[10px] text-slate-400">Toon alleen nieuwe activiteiten</span>
                    </div>

                    <button onClick={fetchIntervalsData} disabled={icuLoading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm font-bold flex justify-center items-center gap-2 transition disabled:opacity-50 mt-2">
                        {icuLoading ? <RefreshCw className="animate-spin" size={16}/> : <Download size={16}/>}
                        {icuLoading ? 'Ophalen...' : 'Haal Data Op'}
                    </button>
                 </div>
              </div>
          </div>

          {/* PREVIEW & IMPORT AREA */}
          <AnimatePresence>
            {parsedData.length > 0 && (
                <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="bg-slate-800 p-4 rounded-xl border border-green-500/30 w-full">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="text-green-400 font-bold text-sm">Preview: {parsedData.length} ritten gevonden</h4>
                         <div className="flex gap-2">
                            <button onClick={() => toggleAll(true)} className="text-[10px] text-slate-400 hover:text-white uppercase">Select All</button>
                            <button onClick={() => toggleAll(false)} className="text-[10px] text-slate-400 hover:text-white uppercase">Select None</button>
                            <button onClick={commitImport} className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded text-xs font-bold flex items-center gap-2">
                                <Check size={14}/> Bevestig Import
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto border border-slate-700 rounded max-h-96">
                        <table className="w-full text-xs text-left text-slate-300">
                            <thead className="bg-slate-900 uppercase sticky top-0"><tr><th className="p-2">Sel</th><th className="p-2">Datum</th><th className="p-2">Naam</th><th className="p-2">Bron</th><th className="p-2">Watt</th><th className="p-2">5m</th><th className="p-2">20m</th><th className="p-2">60m</th></tr></thead>
                            <tbody>{parsedData.map((d,i) => (
                                <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                                    <td className="p-2"><input type="checkbox" checked={d.selected} onChange={() => setParsedData(parsedData.map(p => p.id === d.id ? {...p, selected: !p.selected} : p))}/></td>
                                    <td className="p-2">{d.date}</td><td className="p-2 max-w-[150px] truncate" title={d.name}>{d.name}</td><td className="p-2">{d.source}</td><td className="p-2">{d.power}</td><td className="p-2">{d.p5}</td><td className="p-2">{d.p20}</td><td className="p-2">{d.p60}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                </motion.div>
            )}
          </AnimatePresence>

          {/* LOGBOOK TABLE */}
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 w-full">
             <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Database size={18}/> Logboek</h3>
             <div className="overflow-x-auto">
                 <table className="w-full text-xs text-left min-w-[800px]">
                     <thead className="bg-slate-900 text-slate-400 uppercase">
                         <tr>
                            <th className="p-3">Datum</th><th className="p-3">Naam</th><th className="p-3">Duur</th><th className="p-3">HM</th>
                            <th className="p-3 text-cyan-400">Snelh.</th><th className="p-3 text-red-400">HR</th><th className="p-3 text-purple-400">Cad</th>
                            <th className="p-3 text-green-400">Watt</th><th className="p-3 text-yellow-400">5m</th><th className="p-3 text-orange-400">20m</th><th className="p-3 text-red-500">60m</th>
                            <th className="p-3 text-right">Actie</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-700">
                         {sortedActivities.map(a => (
                             <tr key={a.id} className="hover:bg-slate-700/30">
                                 <td className="p-3 font-mono text-slate-300">{a.date}</td>
                                 <td className="p-3 font-bold text-white max-w-[150px] truncate" title={a.name}>{a.name}</td>
                                 <td className="p-3 text-slate-400">{formatTime(a.duration)}</td>
                                 <td className="p-3 text-slate-400">{a.elevation}m</td>
                                 <td className="p-3 text-cyan-300 font-mono">{a.speed}</td>
                                 <td className="p-3 text-red-300 font-mono">{a.hr || '-'}</td>
                                 <td className="p-3 text-purple-300 font-mono">{a.cadence || '-'}</td>
                                 <td className="p-3 text-green-300 font-bold">{a.power || '-'}</td>
                                 <td className="p-3 text-yellow-300">{a.p5 || '-'}</td>
                                 <td className="p-3 text-orange-400 font-bold">{a.p20 || '-'}</td>
                                 <td className="p-3 text-red-400">{a.p60 || '-'}</td>
                                 <td className="p-3 text-right">
                                     <button 
                                        onClick={() => {
                                            if (deleteConfirmId === a.id) {
                                                setActivities(prev => prev.filter(x => x.id !== a.id));
                                                setDeleteConfirmId(null);
                                            } else {
                                                setDeleteConfirmId(a.id);
                                                // Reset confirmation after 3 seconds
                                                setTimeout(() => setDeleteConfirmId(null), 3000);
                                            }
                                        }} 
                                        className={`${deleteConfirmId === a.id ? 'text-red-500 bg-red-900/30' : 'text-slate-600 hover:text-red-500'} p-1 rounded transition`}
                                     >
                                        {deleteConfirmId === a.id ? <HelpCircle size={14}/> : <Trash2 size={14}/>}
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
          {notification && <motion.div initial={{y:-50, opacity:0}} animate={{y:0, opacity:1}} exit={{opacity:0}} className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-2 rounded-full font-bold shadow-2xl flex items-center gap-2"><Check size={16}/> {notification.msg}</motion.div>}
       </AnimatePresence>
       <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur border-b border-slate-800">
          <div className="w-full px-4 md:px-8 py-3 flex justify-between items-center">
             <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2 rounded shadow-lg shadow-blue-500/20"><Mountain className="text-white" size={20}/></div>
                <h1 className="text-lg font-bold text-white tracking-tight">Climb Performance Lab <span className="text-xs text-blue-500 ml-1">ELITE v20</span></h1>
             </div>
             <div className="flex items-center gap-4">
                <button onClick={handleCloudSync} disabled={syncStatus === 'syncing'} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition disabled:opacity-50">
                    {syncStatus === 'syncing' ? <RefreshCw className="animate-spin" size={14}/> : <Save size={14}/>}
                    {syncStatus === 'syncing' ? 'Opslaan...' : 'Sync Cloud'}
                </button>
             </div>
          </div>
       </header>
       <main className="w-full p-4 md:p-6 md:px-8 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
          <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 sticky md:top-24 h-fit">
             {[{id: 'dashboard', icon: Activity, l: 'Dashboard'}, {id: 'strategy', icon: Map, l: 'Climb Manager'}, {id: 'coach', icon: Brain, l: 'AI Coach'}, {id: 'fuel', icon: Droplet, l: 'Fueling'}, {id: 'data', icon: Database, l: 'Data Hub'}].map(item => (
                <button key={item.id} onClick={() => setActiveTab(item.id)} className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition whitespace-nowrap border ${activeTab === item.id ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/40' : 'border-transparent text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
                   <item.icon size={18}/> {item.l}
                </button>
             ))}
          </nav>
          <div className="min-h-[80vh]">
             {activeTab === 'dashboard' && <DashboardComponent/>}
             {activeTab === 'strategy' && <ClimbManagerComponent/>}
             {activeTab === 'coach' && <AICoachComponent/>}
             {activeTab === 'fuel' && <FuelingLabComponent/>}
             {activeTab === 'data' && <DataHubComponent/>}
          </div>
       </main>
    </div>
  );
}