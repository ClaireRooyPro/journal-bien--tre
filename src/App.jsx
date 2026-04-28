import { useState, useEffect, useRef, useCallback } from "react";

// Constants
const PHASES = ["Menstruelle", "Folliculaire", "Ovulatoire", "Lutéale"];
const SLEEP_QUALITY = ["😴 Très bien", "🙂 Bien", "😐 Moyen", "😞 Mauvais"];
const HUNGER_LEVELS = Array.from({ length: 10 }, (_, i) => String(i + 1));
const MOODS = ["😊 Sereine", "😌 Détendue", "😐 Neutre", "😟 Stressée", "😢 Émotionnelle", "😤 Irritable"];
const CONTEXTS = ["🏠 Seule", "👨‍👩‍👧 En famille", "👥 Entre amis", "💼 Au travail", "🏃 En déplacement", "📱 Devant écran"];
const SPORT_TYPES = ["🏃 Course", "🚴 Vélo", "🏊 Natation", "🧘 Yoga", "🏋️ Musculation", "🤸 Pilates", "💃 Danse", "🥊 Boxe", "🚶 Marche", "⛷️ Ski", "🧗 Escalade", "Autre"];
const SPORT_INTENSITY = ["🟢 Légère", "🟡 Modérée", "🔴 Intense"];
const MEDITATION_TYPES = ["🌬️ Respiration", "🧘 Pleine conscience", "💤 Body scan", "🎵 Guidée", "📿 Mantra", "🌊 Visualisation", "Autre"];
const HYDRATION_GOAL = 8;

const UNITS = [
  { value: "g", label: "Grammes (g)", factor: 1 },
  { value: "portion", label: "Portion", factor: null },
  { value: "cac", label: "Cuillère à café", factor: 5 },
  { value: "cas", label: "Cuillère à soupe", factor: 15 },
  { value: "unite", label: "Unité / pièce", factor: null },
  { value: "bol", label: "Bol (~250g)", factor: 250 },
  { value: "verre", label: "Verre (~200g)", factor: 200 },
  { value: "assiette", label: "Assiette (~300g)", factor: 300 },
  { value: "tranche", label: "Tranche (~30g)", factor: 30 },
  { value: "poignee", label: "Poignée (~30g)", factor: 30 },
];

const STORAGE_KEY = "wellness-journal-v3";
const MEASUREMENTS_KEY = "wellness-measurements";
const RECIPES_KEY = "wellness-recipes";

const TABS = [
  { id: "food", icon: "🍽️", label: "Alimentation" },
  { id: "hydration", icon: "💧", label: "Hydratation" },
  { id: "sport", icon: "🏃", label: "Sport" },
  { id: "meditation", icon: "🧘", label: "Méditation" },
  { id: "wellbeing", icon: "💫", label: "Bien-être" },
  { id: "measurements", icon: "📏", label: "Mensurations" },
  { id: "recipes", icon: "📖", label: "Mes recettes" },
  { id: "history", icon: "📅", label: "Historique" },
];

function loadData(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
function saveData(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}
function todayKey() { return new Date().toISOString().slice(0, 10); }
function formatDate(key) {
  const [y, m, d] = key.split("-");
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

const emptyMeal = () => ({ id: Date.now() + Math.random(), time: "", name: "", hungerBefore: "", satietyAfter: "", sensations: "", items: [] });
const emptyWorkout = () => ({ id: Date.now() + Math.random(), type: "", duration: "", intensity: "", calories: "", notes: "" });
const emptyMeditation = () => ({ id: Date.now() + Math.random(), type: "", duration: "", notes: "" });
const emptyDay = () => ({ meals: [], workouts: [], meditations: [], waterGlasses: 0, sleep: "", sleepHours: "", cyclePhase: "", cycleDay: "", context: "", mood: "", notes: "" });

function getMealMacros(meal) {
  return (meal.items || []).reduce((a, i) => ({
    p: a.p + (parseFloat(i.proteins) || 0),
    g: a.g + (parseFloat(i.carbs) || 0),
    l: a.l + (parseFloat(i.fats) || 0),
    cal: a.cal + (parseFloat(i.calories) || 0),
  }), { p: 0, g: 0, l: 0, cal: 0 });
}

function calcMacros(base, quantity, unit) {
  const unitObj = UNITS.find(u => u.value === unit);
  let grams = parseFloat(quantity) || 0;
  if (unitObj && unitObj.factor) {
    grams = grams * unitObj.factor;
  } else if (unit === "portion" || unit === "unite") {
    grams = grams * (base.serving_size_g || 100);
  }
  const r = grams / 100;
  return {
    proteins: ((base.proteins || 0) * r).toFixed(1),
    carbs: ((base.carbs || 0) * r).toFixed(1),
    fats: ((base.fats || 0) * r).toFixed(1),
    calories: ((base.calories || 0) * r).toFixed(0),
  };
}

// Cache pour éviter de retraduire les mêmes noms
const translationCache = {};

async function translateNamesWithAI(names) {
  // Filtre ceux déjà en cache
  const toTranslate = names.filter(n => !translationCache[n]);
  if (toTranslate.length === 0) return;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `Traduis ces noms d'aliments en français courant et naturel. 
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni backticks, de la forme {"nom original": "traduction française"}.
Si le nom est déjà en français ou est un nom de marque, garde-le tel quel.
Noms à traduire: ${JSON.stringify(toTranslate)}`
        }]
      })
    });
    const data = await response.json();
    const text = data.content?.[0]?.text || "{}";
    const translations = JSON.parse(text);
    Object.assign(translationCache, translations);
  } catch {
    // En cas d'erreur, on garde les noms originaux
    toTranslate.forEach(n => { translationCache[n] = n; });
  }
}

async function searchOFF(query) {
  if (!query || query.length < 2) return [];
  try {
    // Recherche en FR + EN simultanément pour plus de résultats
    const [resFr, resEn] = await Promise.all([
      fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=6&lc=fr&fields=id,product_name,product_name_fr,nutriments,serving_size`),
      fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=4&lc=en&fields=id,product_name,product_name_fr,nutriments,serving_size`)
    ]);
    const [dataFr, dataEn] = await Promise.all([resFr.json(), resEn.json()]);

    const allProducts = [...(dataFr.products || []), ...(dataEn.products || [])];
    // Dédoublonne par id
    const seen = new Set();
    const unique = allProducts.filter(p => {
      if (seen.has(p.id) || (!p.product_name && !p.product_name_fr)) return false;
      seen.add(p.id); return true;
    }).slice(0, 10);

    const mapped = unique.map(p => ({
      id: p.id,
      name: p.product_name_fr || p.product_name || "Produit inconnu",
      proteins: p.nutriments?.["proteins_100g"] || 0,
      carbs: p.nutriments?.["carbohydrates_100g"] || 0,
      fats: p.nutriments?.["fat_100g"] || 0,
      calories: p.nutriments?.["energy-kcal_100g"] || 0,
      serving_size_g: parseFloat(p.serving_size) || 100,
    }));

    // Traduit les noms encore en anglais
    const namesToTranslate = mapped.map(p => p.name);
    await translateNamesWithAI(namesToTranslate);

    // Applique les traductions
    return mapped.map(p => ({
      ...p,
      name: translationCache[p.name] || p.name,
    }));
  } catch { return []; }
}

const C = {
  bg: "linear-gradient(160deg, #fdf6f0 0%, #fef0e8 40%, #fce8f0 100%)",
  card: "rgba(255,255,255,0.82)", border: "rgba(210,160,130,0.28)",
  primary: "#8b3a3a", muted: "#b07060", text: "#3d2b1f",
  food: "#c4607a", water: "#4a9eba", sport: "#6a9a5a",
  meditation: "#7a6aaa", wellbeing: "#c47a3a", measurements: "#8a6a4a",
};

export default function WellnessJournal() {
  const [allData, setAllData] = useState(() => loadData(STORAGE_KEY));
  const [measurements, setMeasurements] = useState(() => loadData(MEASUREMENTS_KEY));
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [activeTab, setActiveTab] = useState("food");
  const [expandedMeal, setExpandedMeal] = useState(null);
  const [expandedItem, setExpandedItem] = useState(null);
  const [showAdd, setShowAdd] = useState({ meal: false, workout: false, meditation: false, measurement: false });
  const [newMeal, setNewMeal] = useState(emptyMeal());
  const [newWorkout, setNewWorkout] = useState(emptyWorkout());
  const [newMeditation, setNewMeditation] = useState(emptyMeditation());
  const [newMeasurement, setNewMeasurement] = useState({ weight: "", waist: "", hips: "", bust: "", thighs: "", arms: "", notes: "" });
  const [meditationTimer, setMeditationTimer] = useState({ running: false, seconds: 0, target: 0 });
  const [foodSearch, setFoodSearchRaw] = useState("");
  const [foodResults, setFoodResults] = useState([]);
  const [foodLoading, setFoodLoading] = useState(false);
  const [activeMealId, setActiveMealId] = useState(null);
  const [pendingItem, setPendingItem] = useState(null);
  const searchTimeout = useRef(null);
  const [recipes, setRecipes] = useState(() => loadData(RECIPES_KEY));
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [newRecipe, setNewRecipe] = useState({ name: "", category: "", servings: "1", ingredients: [], notes: "" });
  const [recipeIngSearch, setRecipeIngSearch] = useState("");
  const [recipeIngResults, setRecipeIngResults] = useState([]);
  const [recipeIngLoading, setRecipeIngLoading] = useState(false);
  const [pendingRecipeIng, setPendingRecipeIng] = useState(null);
  const recipeSearchTimeout = useRef(null);
  const timerRef = useRef(null);

  const dayData = allData[selectedDate] || emptyDay();

  function updateDay(updates) {
    const updated = { ...allData, [selectedDate]: { ...dayData, ...updates } };
    setAllData(updated); saveData(STORAGE_KEY, updated);
  }

  const handleFoodSearch = useCallback((q) => {
    setFoodSearchRaw(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.length < 2) { setFoodResults([]); return; }
    setFoodLoading(true);
    // Résultats recettes maison immédiats
    const localResults = Object.values(recipes).filter(r =>
      r.name.toLowerCase().includes(q.toLowerCase())
    ).map(r => {
      const macros = getRecipeMacrosPer100g(r);
      return { id: r.id, name: "🏠 " + r.name, isRecipe: true, _base: { ...macros, serving_size_g: macros.serving_size_g }, ...macros };
    });
    setFoodResults(localResults);
    searchTimeout.current = setTimeout(async () => {
      const offResults = await searchOFF(q);
      setFoodResults([...localResults, ...offResults]);
      setFoodLoading(false);
    }, 600);
  }, [recipes]);

  function selectFood(food) {
    const base = calcMacros(food, "100", "g");
    setPendingItem({ id: Date.now(), name: food.name, offId: food.id, _base: food, quantity: "100", unit: "g", ...base });
    setFoodSearchRaw(""); setFoodResults([]);
  }

  function updatePendingQuantity(quantity, unit) {
    if (!pendingItem?._base) return;
    setPendingItem(p => ({ ...p, quantity, unit: unit || p.unit, ...calcMacros(p._base, quantity, unit || p.unit) }));
  }

  function confirmAddFood(targetMealId) {
    if (!pendingItem) return;
    const { _base, ...item } = pendingItem;
    if (targetMealId === "new") {
      setNewMeal(p => ({ ...p, items: [...(p.items || []), { ...item, id: Date.now() }] }));
    } else {
      updateDay({ meals: dayData.meals.map(m => m.id === targetMealId ? { ...m, items: [...(m.items || []), { ...item, id: Date.now() }] } : m) });
    }
    setPendingItem(null);
  }

  function removeFoodItem(mealId, itemId) {
    updateDay({ meals: dayData.meals.map(m => m.id === mealId ? { ...m, items: (m.items || []).filter(i => i.id !== itemId) } : m) });
  }

  function addMeal() {
    updateDay({ meals: [...(dayData.meals || []), { ...newMeal, id: Date.now() }] });
    setNewMeal(emptyMeal()); setShowAdd(p => ({ ...p, meal: false })); setPendingItem(null);
  }
  function removeMeal(id) { updateDay({ meals: dayData.meals.filter(m => m.id !== id) }); }
  function updateMealField(id, f, v) { updateDay({ meals: dayData.meals.map(m => m.id === id ? { ...m, [f]: v } : m) }); }

  function addWorkout() {
    if (!newWorkout.type) return;
    updateDay({ workouts: [...(dayData.workouts || []), { ...newWorkout, id: Date.now() }] });
    setNewWorkout(emptyWorkout()); setShowAdd(p => ({ ...p, workout: false }));
  }
  function removeWorkout(id) { updateDay({ workouts: dayData.workouts.filter(w => w.id !== id) }); }

  function addMeditation(m = newMeditation) {
    if (!m.type && !m.duration) return;
    updateDay({ meditations: [...(dayData.meditations || []), { ...m, id: Date.now() }] });
    setNewMeditation(emptyMeditation()); setShowAdd(p => ({ ...p, meditation: false }));
  }
  function removeMeditation(id) { updateDay({ meditations: dayData.meditations.filter(m => m.id !== id) }); }

  function setWater(n) { updateDay({ waterGlasses: Math.max(0, Math.min(20, n)) }); }

  function saveMeasurement() {
    const updated = { ...measurements, [selectedDate]: { ...newMeasurement, date: selectedDate } };
    setMeasurements(updated); saveData(MEASUREMENTS_KEY, updated);
    setNewMeasurement({ weight: "", waist: "", hips: "", bust: "", thighs: "", arms: "", notes: "" });
    setShowAdd(p => ({ ...p, measurement: false }));
  }

  // function getRecipeMacrosPer100g(recipe) {
    const servings = parseFloat(recipe.servings) || 1;
    const totalG = (recipe.ingredients || []).reduce((a, i) => {
      const u = UNITS.find(u => u.value === i.unit);
      const g = (parseFloat(i.quantity) || 0) * (u && u.factor ? u.factor : 100);
      return a + g;
    }, 0);
    const totals = (recipe.ingredients || []).reduce((a, i) => {
      const u = UNITS.find(u => u.value === i.unit);
      const g = (parseFloat(i.quantity) || 0) * (u && u.factor ? u.factor : 100);
      const r = g / 100;
      return { p: a.p + (parseFloat(i.proteins) || 0) * r, c: a.c + (parseFloat(i.carbs) || 0) * r, f: a.f + (parseFloat(i.fats) || 0) * r, cal: a.cal + (parseFloat(i.calories) || 0) * r };
    }, { p: 0, c: 0, f: 0, cal: 0 });
    const perServing = totalG / servings;
    if (perServing === 0) return { proteins: 0, carbs: 0, fats: 0, calories: 0, serving_size_g: 100 };
    return {
      proteins: (totals.p / servings / perServing * 100),
      carbs: (totals.c / servings / perServing * 100),
      fats: (totals.f / servings / perServing * 100),
      calories: (totals.cal / servings / perServing * 100),
      serving_size_g: perServing,
    };
  }

  function saveRecipe() {
    if (!newRecipe.name.trim()) return;
    const id = editingRecipe || ("recipe_" + Date.now());
    const updated = { ...recipes, [id]: { ...newRecipe, id } };
    setRecipes(updated); saveData(RECIPES_KEY, updated);
    setNewRecipe({ name: "", category: "", servings: "1", ingredients: [], notes: "" });
    setShowRecipeForm(false); setEditingRecipe(null);
  }

  function deleteRecipe(id) {
    const updated = { ...recipes }; delete updated[id];
    setRecipes(updated); saveData(RECIPES_KEY, updated);
  }

  function handleRecipeIngSearch(q) {
    setRecipeIngSearch(q);
    if (recipeSearchTimeout.current) clearTimeout(recipeSearchTimeout.current);
    if (q.length < 2) { setRecipeIngResults([]); return; }
    setRecipeIngLoading(true);
    recipeSearchTimeout.current = setTimeout(async () => {
      const results = await searchOFF(q);
      setRecipeIngResults(results);
      setRecipeIngLoading(false);
    }, 600);
  }

  function selectRecipeIngredient(food) {
    const base = calcMacros(food, "100", "g");
    setPendingRecipeIng({ id: Date.now(), name: food.name, _base: food, quantity: "100", unit: "g", ...base });
    setRecipeIngSearch(""); setRecipeIngResults([]);
  }

  function updatePendingRecipeIng(quantity, unit) {
    if (!pendingRecipeIng?._base) return;
    setPendingRecipeIng(p => ({ ...p, quantity, unit: unit || p.unit, ...calcMacros(p._base, quantity, unit || p.unit) }));
  }

  function confirmRecipeIngredient() {
    if (!pendingRecipeIng) return;
    const { _base, ...ing } = pendingRecipeIng;
    setNewRecipe(p => ({ ...p, ingredients: [...(p.ingredients || []), { ...ing, id: Date.now() }] }));
    setPendingRecipeIng(null);
  }

  // Search recipes maison + OFF
  function searchAllFoods(q) {
    const recipeList = Object.values(recipes);
    const matching = recipeList.filter(r => r.name.toLowerCase().includes(q.toLowerCase()));
    return matching.map(r => {
      const macros = getRecipeMacrosPer100g(r);
      return { id: r.id, name: "🏠 " + r.name, isRecipe: true, ...macros };
    });
  }

  function startTimer(minutes) {
    if (timerRef.current) clearInterval(timerRef.current);
    const target = minutes * 60;
    setMeditationTimer({ running: true, seconds: 0, target });
    timerRef.current = setInterval(() => {
      setMeditationTimer(prev => {
        if (prev.seconds >= target - 1) {
          clearInterval(timerRef.current);
          addMeditation({ ...newMeditation, duration: String(minutes), type: newMeditation.type || "🌬️ Respiration" });
          return { running: false, seconds: target, target };
        }
        return { ...prev, seconds: prev.seconds + 1 };
      });
    }, 1000);
  }
  function stopTimer() { if (timerRef.current) clearInterval(timerRef.current); setMeditationTimer({ running: false, seconds: 0, target: 0 }); }
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const totalMacros = (dayData.meals || []).reduce((a, meal) => { const m = getMealMacros(meal); return { p: a.p + m.p, g: a.g + m.g, l: a.l + m.l }; }, { p: 0, g: 0, l: 0 });
  const totalSportMin = (dayData.workouts || []).reduce((a, w) => a + (parseInt(w.duration) || 0), 0);
  const totalMeditationMin = (dayData.meditations || []).reduce((a, m) => a + (parseInt(m.duration) || 0), 0);
  const water = dayData.waterGlasses || 0;
  const historyDates = Object.keys(allData).sort().reverse().slice(0, 30);
  const measurementDates = Object.keys(measurements).sort().reverse().slice(0, 10);
  const tabColor = { food: C.food, hydration: C.water, sport: C.sport, meditation: C.meditation, wellbeing: C.wellbeing, measurements: C.measurements, recipes: '#5a7a4a', history: C.primary };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Georgia', serif", color: C.text }}>

      {/* Header */}
      <div style={{ background: "rgba(255,255,255,0.75)", backdropFilter: "blur(14px)", borderBottom: `1px solid ${C.border}`, padding: "14px 20px", position: "sticky", top: 0, zIndex: 200 }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: "bold", color: C.primary }}>🌸 Mon Journal Bien-être</div>
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: "2px", textTransform: "uppercase" }}>Corps . Esprit . Énergie</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <NavBtn onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d.toISOString().slice(0, 10)); }}>‹</NavBtn>
              <div style={{ fontSize: 12, color: C.primary, fontWeight: "bold", minWidth: 80, textAlign: "center" }}>{selectedDate === todayKey() ? "Aujourd'hui" : selectedDate}</div>
              <NavBtn disabled={selectedDate >= todayKey()} onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); const n = d.toISOString().slice(0, 10); if (n <= todayKey()) setSelectedDate(n); }}>›</NavBtn>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "5px 11px", borderRadius: 20, border: "none", cursor: "pointer", whiteSpace: "nowrap", fontSize: 12, fontFamily: "inherit", transition: "all 0.18s", background: activeTab === t.id ? (tabColor[t.id] || C.primary) : "rgba(0,0,0,0.04)", color: activeTab === t.id ? "white" : C.muted, fontWeight: activeTab === t.id ? "bold" : "normal" }}>{t.icon} {t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary strip */}
      {activeTab !== "history" && activeTab !== "measurements" && (
        <div style={{ background: "rgba(255,255,255,0.55)", borderBottom: `1px solid ${C.border}`, padding: "8px 20px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 16, overflowX: "auto" }}>
            {[{ icon: "🥩", val: `${totalMacros.p.toFixed(0)}g`, label: "Prot.", color: C.food }, { icon: "🌾", val: `${totalMacros.g.toFixed(0)}g`, label: "Gluc.", color: "#d4a060" }, { icon: "🥑", val: `${totalMacros.l.toFixed(0)}g`, label: "Lip.", color: "#80a860" }, { icon: "💧", val: `${water}/${HYDRATION_GOAL}`, label: "Verres", color: C.water }, { icon: "🏃", val: `${totalSportMin}min`, label: "Sport", color: C.sport }, { icon: "🧘", val: `${totalMeditationMin}min`, label: "Médit.", color: C.meditation }].map(s => (
              <div key={s.label} style={{ textAlign: "center", minWidth: 48 }}>
                <div style={{ fontSize: 13, fontWeight: "bold", color: s.color }}>{s.icon} {s.val}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 14px" }}>

        {/* ==== FOOD ==== */}
        {activeTab === "food" && (
          <Section title="🍽️ Repas du jour" color={C.food}>
            {(dayData.meals || []).map(meal => {
              const macros = getMealMacros(meal);
              const isExp = expandedMeal === meal.id;
              return (
                <div key={meal.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 10, overflow: "hidden" }}>
                  <div onClick={() => { setExpandedMeal(isExp ? null : meal.id); setActiveMealId(meal.id); }} style={{ padding: "12px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontWeight: "bold", color: "#5a2a1a", fontSize: 14 }}>{meal.name || (meal.items?.length > 0 ? meal.items.slice(0,2).map(i => i.name).join(", ") : "Repas")}</span>
                      {meal.time && <span style={{ fontSize: 11, color: C.muted, marginLeft: 6 }}>⏱ {meal.time}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      {macros.p > 0 && <Pill color={C.food}>{macros.p.toFixed(0)}g P</Pill>}
                      {macros.g > 0 && <Pill color="#d4a060">{macros.g.toFixed(0)}g G</Pill>}
                      {macros.l > 0 && <Pill color="#80a860">{macros.l.toFixed(0)}g L</Pill>}
                      <ChevronIcon open={isExp} />
                    </div>
                  </div>
                  {isExp && (
                    <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${C.border}` }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                        <Field label="Nom du repas" value={meal.name} onChange={v => updateMealField(meal.id, "name", v)} placeholder="ex: Déjeuner" />
                        <Field label="Heure" type="time" value={meal.time} onChange={v => updateMealField(meal.id, "time", v)} />
                        <SelectField label="Faim avant /10" value={meal.hungerBefore} onChange={v => updateMealField(meal.id, "hungerBefore", v)} options={HUNGER_LEVELS} />
                        <SelectField label="Satiété après /10" value={meal.satietyAfter} onChange={v => updateMealField(meal.id, "satietyAfter", v)} options={HUNGER_LEVELS} />
                      </div>
                      {(meal.items || []).length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: "bold", letterSpacing: "0.5px" }}>ALIMENTS</div>
                          {meal.items.map(item => (
                            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "rgba(196,96,122,0.05)", borderRadius: 8, marginBottom: 4 }}>
                              <div>
                                <span style={{ fontSize: 13 }}>{item.name}</span>
                                <span style={{ fontSize: 11, color: C.muted, marginLeft: 6 }}>{item.quantity} {UNITS.find(u => u.value === item.unit)?.label.split(" ")[0] || item.unit}</span>
                              </div>
                              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                                <span style={{ fontSize: 10, color: C.food }}>{item.proteins}g P</span>
                                <span style={{ fontSize: 10, color: "#d4a060" }}>{item.carbs}g G</span>
                                <span style={{ fontSize: 10, color: "#80a860" }}>{item.fats}g L</span>
                                <button onClick={() => removeFoodItem(meal.id, item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#e07060", fontSize: 16, lineHeight: 1 }}>×</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <FoodSearch mealId={meal.id} activeMealId={activeMealId} setActiveMealId={setActiveMealId} foodSearch={foodSearch} setFoodSearch={handleFoodSearch} foodResults={foodResults} foodLoading={foodLoading} pendingItem={pendingItem} setPendingItem={setPendingItem} selectFood={selectFood} updatePendingQuantity={updatePendingQuantity} confirmAddFood={confirmAddFood} />
                      <TextArea label="Sensations, envies, remarques" value={meal.sensations} onChange={v => updateMealField(meal.id, "sensations", v)} />
                      <DeleteBtn onClick={() => removeMeal(meal.id)} />
                    </div>
                  )}
                </div>
              );
            })}

            {showAdd.meal ? (
              <div style={{ background: "rgba(255,255,255,0.92)", border: "1px dashed rgba(139,58,58,0.35)", borderRadius: 14, padding: 14, marginBottom: 10 }}>
                <div style={{ fontWeight: "bold", color: C.primary, marginBottom: 10, fontSize: 13 }}>Nouveau repas</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <Field label="Nom" value={newMeal.name} onChange={v => setNewMeal(p => ({ ...p, name: v }))} placeholder="ex: Petit-déjeuner" />
                  <Field label="Heure" type="time" value={newMeal.time} onChange={v => setNewMeal(p => ({ ...p, time: v }))} />
                  <SelectField label="Faim avant /10" value={newMeal.hungerBefore} onChange={v => setNewMeal(p => ({ ...p, hungerBefore: v }))} options={HUNGER_LEVELS} />
                  <SelectField label="Satiété après /10" value={newMeal.satietyAfter} onChange={v => setNewMeal(p => ({ ...p, satietyAfter: v }))} options={HUNGER_LEVELS} />
                </div>
                {(newMeal.items || []).length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 5, fontWeight: "bold" }}>ALIMENTS AJOUTÉS</div>
                    {newMeal.items.map(item => (
                      <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 9px", background: "rgba(196,96,122,0.05)", borderRadius: 7, marginBottom: 3 }}>
                        <span style={{ fontSize: 12 }}>{item.name} - {item.quantity} {UNITS.find(u => u.value === item.unit)?.label.split(" ")[0]}</span>
                        <div style={{ display: "flex", gap: 5 }}>
                          <span style={{ fontSize: 10, color: C.food }}>{item.proteins}g P</span>
                          <button onClick={() => setNewMeal(p => ({ ...p, items: p.items.filter(i => i.id !== item.id) }))} style={{ background: "none", border: "none", cursor: "pointer", color: "#e07060", fontSize: 16 }}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <FoodSearch mealId="new" activeMealId={activeMealId} setActiveMealId={setActiveMealId} foodSearch={foodSearch} setFoodSearch={handleFoodSearch} foodResults={foodResults} foodLoading={foodLoading} pendingItem={pendingItem} setPendingItem={setPendingItem} selectFood={(f) => { setActiveMealId("new"); selectFood(f); }} updatePendingQuantity={updatePendingQuantity} confirmAddFood={confirmAddFood} />
                <TextArea label="Sensations" value={newMeal.sensations} onChange={v => setNewMeal(p => ({ ...p, sensations: v }))} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={addMeal} style={{ background: C.primary, color: "white", border: "none", borderRadius: 9, padding: "7px 18px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Enregistrer</button>
                  <button onClick={() => { setShowAdd(p => ({ ...p, meal: false })); setNewMeal(emptyMeal()); setPendingItem(null); }} style={{ background: "none", border: "1px solid #ccc", borderRadius: 9, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#999" }}>Annuler</button>
                </div>
              </div>
            ) : (
              <AddBtn color={C.food} onClick={() => { setShowAdd(p => ({ ...p, meal: true })); setActiveMealId("new"); }}>+ Ajouter un repas</AddBtn>
            )}

            <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(196,96,122,0.06)", borderRadius: 10, border: `1px solid ${C.food}22`, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              🏠 <strong>Recette maison ?</strong> Crée-la dans l'onglet <strong style={{ color: C.food }}>📖 Mes recettes</strong> - elle apparaîtra automatiquement dans la recherche !
            </div>
          </Section>
        )}

        {/* ==== HYDRATION ==== */}
        {activeTab === "hydration" && (
          <Section title="💧 Hydratation" color={C.water}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 42, fontWeight: "bold", color: C.water }}>{water}</div>
                <div style={{ fontSize: 14, color: C.muted }}>verres sur {HYDRATION_GOAL} recommandés</div>
                <div style={{ margin: "12px auto", maxWidth: 300, height: 10, background: "#e8f0f8", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, (water / HYDRATION_GOAL) * 100)}%`, height: "100%", background: "linear-gradient(90deg, #4a9eba, #7abfda)", borderRadius: 10, transition: "width 0.4s" }} />
                </div>
                <div style={{ fontSize: 12, color: water >= HYDRATION_GOAL ? C.sport : C.muted }}>{water >= HYDRATION_GOAL ? "✅ Objectif atteint !" : `${HYDRATION_GOAL - water} verre${HYDRATION_GOAL - water > 1 ? "s" : ""} restant${HYDRATION_GOAL - water > 1 ? "s" : ""}`}</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 20 }}>
                {Array.from({ length: Math.max(HYDRATION_GOAL, water) }, (_, i) => (
                  <button key={i} onClick={() => setWater(i < water ? i : i + 1)} style={{ width: 44, height: 52, borderRadius: 8, border: `2px solid ${i < water ? C.water : "rgba(74,158,186,0.25)"}`, background: i < water ? "linear-gradient(180deg,#7abfda,#4a9eba)" : "rgba(74,158,186,0.06)", cursor: "pointer", fontSize: 20, transition: "all 0.2s" }}>💧</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <ActionBtn color={C.water} onClick={() => setWater(water - 1)}>- 1 verre</ActionBtn>
                <ActionBtn color={C.water} onClick={() => setWater(water + 1)}>+ 1 verre</ActionBtn>
                <ActionBtn color={C.water} onClick={() => setWater(0)} outline>Réinitialiser</ActionBtn>
              </div>
              <div style={{ marginTop: 18, padding: "10px 14px", background: "rgba(74,158,186,0.08)", borderRadius: 10, border: "1px solid rgba(74,158,186,0.2)", fontSize: 12, color: "#5a8a9a", lineHeight: 1.6 }}>
                💡 Un adulte a besoin d'environ 1,5 à 2 litres d'eau par jour. Les besoins augmentent lors d'activité physique.
              </div>
            </div>
            <div style={{ marginTop: 14 }}><Field label="🕐 Heure de la première gorgée" type="time" value={dayData.firstWater || ""} onChange={v => updateDay({ firstWater: v })} /></div>
            <TextArea label="Notes hydratation (tisanes, bouillons, etc.)" value={dayData.waterNotes || ""} onChange={v => updateDay({ waterNotes: v })} />
          </Section>
        )}

        {/* ==== SPORT ==== */}
        {activeTab === "sport" && (
          <Section title="🏃 Entraînements" color={C.sport}>
            {(dayData.workouts || []).length > 0 && (
              <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                {[{ label: "Durée totale", val: `${totalSportMin} min`, icon: "⏱" }, { label: "Séances", val: String(dayData.workouts.length), icon: "🏅" }].map(s => (
                  <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 16px", flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 18 }}>{s.icon}</div>
                    <div style={{ fontSize: 17, fontWeight: "bold", color: C.sport }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
            {(dayData.workouts || []).map(w => (
              <div key={w.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, marginBottom: 9, overflow: "hidden" }}>
                <div onClick={() => setExpandedItem(expandedItem === w.id ? null : w.id)} style={{ padding: "11px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: "bold", color: "#2a4a2a" }}>{w.type || "Entraînement"}</span>
                  <div style={{ display: "flex", gap: 5 }}>{w.duration && <Pill color={C.sport}>{w.duration} min</Pill>}{w.intensity && <Pill color={w.intensity.includes("🔴") ? "#e06060" : w.intensity.includes("🟡") ? "#d4a060" : C.sport}>{w.intensity}</Pill>}<ChevronIcon open={expandedItem === w.id} /></div>
                </div>
                {expandedItem === w.id && (
                  <div style={{ padding: "0 14px 12px", borderTop: `1px solid ${C.border}` }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                      <SelectField label="Type" value={w.type} onChange={v => updateDay({ workouts: dayData.workouts.map(x => x.id === w.id ? { ...x, type: v } : x) })} options={SPORT_TYPES} />
                      <Field label="Durée (min)" type="number" value={w.duration} onChange={v => updateDay({ workouts: dayData.workouts.map(x => x.id === w.id ? { ...x, duration: v } : x) })} />
                      <SelectField label="Intensité" value={w.intensity} onChange={v => updateDay({ workouts: dayData.workouts.map(x => x.id === w.id ? { ...x, intensity: v } : x) })} options={SPORT_INTENSITY} />
                      <Field label="Calories brûlées" type="number" value={w.calories} onChange={v => updateDay({ workouts: dayData.workouts.map(x => x.id === w.id ? { ...x, calories: v } : x) })} />
                    </div>
                    <TextArea label="Notes" value={w.notes} onChange={v => updateDay({ workouts: dayData.workouts.map(x => x.id === w.id ? { ...x, notes: v } : x) })} />
                    <DeleteBtn onClick={() => removeWorkout(w.id)} />
                  </div>
                )}
              </div>
            ))}
            {showAdd.workout ? (
              <div style={{ background: "rgba(255,255,255,0.92)", border: "1px dashed rgba(106,154,90,0.4)", borderRadius: 13, padding: 14, marginBottom: 9 }}>
                <div style={{ fontWeight: "bold", color: C.sport, marginBottom: 10, fontSize: 13 }}>Nouvel entraînement</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <SelectField label="Type" value={newWorkout.type} onChange={v => setNewWorkout(p => ({ ...p, type: v }))} options={SPORT_TYPES} />
                  <Field label="Durée (min)" type="number" value={newWorkout.duration} onChange={v => setNewWorkout(p => ({ ...p, duration: v }))} />
                  <SelectField label="Intensité" value={newWorkout.intensity} onChange={v => setNewWorkout(p => ({ ...p, intensity: v }))} options={SPORT_INTENSITY} />
                  <Field label="Calories brûlées" type="number" value={newWorkout.calories} onChange={v => setNewWorkout(p => ({ ...p, calories: v }))} />
                </div>
                <TextArea label="Notes" value={newWorkout.notes} onChange={v => setNewWorkout(p => ({ ...p, notes: v }))} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={addWorkout} style={{ background: C.sport, color: "white", border: "none", borderRadius: 9, padding: "7px 18px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Ajouter</button>
                  <button onClick={() => { setShowAdd(p => ({ ...p, workout: false })); setNewWorkout(emptyWorkout()); }} style={{ background: "none", border: "1px solid #ccc", borderRadius: 9, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#999" }}>Annuler</button>
                </div>
              </div>
            ) : <AddBtn color={C.sport} onClick={() => setShowAdd(p => ({ ...p, workout: true }))}>+ Ajouter un entraînement</AddBtn>}
          </Section>
        )}

        {/* ==== MEDITATION ==== */}
        {activeTab === "meditation" && (
          <Section title="🧘 Méditation" color={C.meditation}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 14, textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: "bold", color: C.meditation, marginBottom: 14 }}>⏱ Minuteur de méditation</div>
              {meditationTimer.running ? (
                <>
                  <div style={{ fontSize: 52, fontWeight: "bold", color: C.meditation, letterSpacing: "-2px" }}>{String(Math.floor((meditationTimer.target - meditationTimer.seconds) / 60)).padStart(2, "0")}:{String((meditationTimer.target - meditationTimer.seconds) % 60).padStart(2, "0")}</div>
                  <div style={{ margin: "10px auto 14px", maxWidth: 250, height: 6, background: "#ece8f8", borderRadius: 10 }}>
                    <div style={{ width: `${(meditationTimer.seconds / meditationTimer.target) * 100}%`, height: "100%", background: "linear-gradient(90deg,#7a6aaa,#a08ad0)", borderRadius: 10, transition: "width 1s linear" }} />
                  </div>
                  <button onClick={stopTimer} style={{ background: "none", border: `1px solid ${C.meditation}`, borderRadius: 10, padding: "8px 20px", color: C.meditation, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>⏹ Arrêter</button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Choisir une durée</div>
                  <SelectField label="Type" value={newMeditation.type} onChange={v => setNewMeditation(p => ({ ...p, type: v }))} options={MEDITATION_TYPES} />
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}>
                    {[5, 10, 15, 20, 30].map(min => <button key={min} onClick={() => startTimer(min)} style={{ padding: "8px 16px", borderRadius: 12, border: `1.5px solid ${C.meditation}`, background: "rgba(122,106,170,0.08)", color: C.meditation, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: "bold" }}>{min} min</button>)}
                  </div>
                  {meditationTimer.seconds > 0 && meditationTimer.seconds === meditationTimer.target && <div style={{ marginTop: 12, fontSize: 13, color: C.sport }}>✅ Séance enregistrée !</div>}
                </>
              )}
            </div>
            {(dayData.meditations || []).map(med => (
              <div key={med.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, marginBottom: 9, overflow: "hidden" }}>
                <div onClick={() => setExpandedItem(expandedItem === med.id ? null : med.id)} style={{ padding: "11px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: "bold", color: "#3a2a6a" }}>{med.type || "Méditation"}</span>
                  <div style={{ display: "flex", gap: 5 }}>{med.duration && <Pill color={C.meditation}>{med.duration} min</Pill>}<ChevronIcon open={expandedItem === med.id} /></div>
                </div>
                {expandedItem === med.id && (
                  <div style={{ padding: "0 14px 12px", borderTop: `1px solid ${C.border}` }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                      <SelectField label="Type" value={med.type} onChange={v => updateDay({ meditations: dayData.meditations.map(x => x.id === med.id ? { ...x, type: v } : x) })} options={MEDITATION_TYPES} />
                      <Field label="Durée (min)" type="number" value={med.duration} onChange={v => updateDay({ meditations: dayData.meditations.map(x => x.id === med.id ? { ...x, duration: v } : x) })} />
                    </div>
                    <TextArea label="Ressenti après" value={med.notes} onChange={v => updateDay({ meditations: dayData.meditations.map(x => x.id === med.id ? { ...x, notes: v } : x) })} />
                    <DeleteBtn onClick={() => removeMeditation(med.id)} />
                  </div>
                )}
              </div>
            ))}
            {showAdd.meditation ? (
              <div style={{ background: "rgba(255,255,255,0.92)", border: "1px dashed rgba(122,106,170,0.4)", borderRadius: 13, padding: 14, marginBottom: 9 }}>
                <div style={{ fontWeight: "bold", color: C.meditation, marginBottom: 10, fontSize: 13 }}>Nouvelle séance</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <SelectField label="Type" value={newMeditation.type} onChange={v => setNewMeditation(p => ({ ...p, type: v }))} options={MEDITATION_TYPES} />
                  <Field label="Durée (min)" type="number" value={newMeditation.duration} onChange={v => setNewMeditation(p => ({ ...p, duration: v }))} />
                </div>
                <TextArea label="Ressenti après" value={newMeditation.notes} onChange={v => setNewMeditation(p => ({ ...p, notes: v }))} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={() => addMeditation()} style={{ background: C.meditation, color: "white", border: "none", borderRadius: 9, padding: "7px 18px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Ajouter</button>
                  <button onClick={() => { setShowAdd(p => ({ ...p, meditation: false })); setNewMeditation(emptyMeditation()); }} style={{ background: "none", border: "1px solid #ccc", borderRadius: 9, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#999" }}>Annuler</button>
                </div>
              </div>
            ) : <AddBtn color={C.meditation} onClick={() => setShowAdd(p => ({ ...p, meditation: true }))}>+ Ajouter manuellement</AddBtn>}
          </Section>
        )}

        {/* ==== WELLBEING ==== */}
        {activeTab === "wellbeing" && (
          <>
            <Section title="💫 Bien-être & Contexte" color={C.wellbeing}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <SelectField label="😴 Qualité du sommeil" value={dayData.sleep} onChange={v => updateDay({ sleep: v })} options={SLEEP_QUALITY} />
                <Field label="🕐 Heures dormies" type="number" value={dayData.sleepHours} onChange={v => updateDay({ sleepHours: v })} placeholder="ex: 7.5" />
                <SelectField label="😊 Humeur générale" value={dayData.mood} onChange={v => updateDay({ mood: v })} options={MOODS} />
                <SelectField label="🌍 Contexte du jour" value={dayData.context} onChange={v => updateDay({ context: v })} options={CONTEXTS} />
              </div>
            </Section>
            <Section title="🌸 Cycle Féminin" color={C.food}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <SelectField label="Phase du cycle" value={dayData.cyclePhase} onChange={v => updateDay({ cyclePhase: v })} options={PHASES} />
                <Field label="Jour du cycle" type="number" value={dayData.cycleDay} onChange={v => updateDay({ cycleDay: v })} placeholder="ex: 14" />
              </div>
              {dayData.cyclePhase && (
                <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(240,180,200,0.2)", border: "1px solid rgba(220,150,180,0.3)", fontSize: 12, color: "#b06080", lineHeight: 1.7 }}>
                  {dayData.cyclePhase === "Menstruelle" && "🩸 Favorise les aliments riches en fer et magnésium. Repos et douceur."}
                  {dayData.cyclePhase === "Folliculaire" && "🌱 Énergie en hausse. Bonne fenêtre pour intensifier les entraînements."}
                  {dayData.cyclePhase === "Ovulatoire" && "🌟 Pic d'énergie ! Idéal pour les efforts intenses. Aliments anti-inflammatoires."}
                  {dayData.cyclePhase === "Lutéale" && "🍂 Besoins caloriques légèrement accrus. Glucides complexes et magnésium."}
                </div>
              )}
            </Section>
            <Section title="📝 Notes libres" color={C.muted}>
              <TextArea label="Observations, ressentis, intentions..." value={dayData.notes} onChange={v => updateDay({ notes: v })} rows={4} />
            </Section>
          </>
        )}

        {/* ==== MEASUREMENTS ==== */}
        {activeTab === "measurements" && (
          <Section title="📏 Mensurations" color={C.measurements}>
            {measurements[selectedDate] && !showAdd.measurement ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: "bold", color: C.measurements, marginBottom: 12 }}>📌 {formatDate(selectedDate)}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                  {[{ key: "weight", label: "Poids", unit: "kg", icon: "⚖️" }, { key: "waist", label: "Taille", unit: "cm", icon: "📐" }, { key: "hips", label: "Hanches", unit: "cm", icon: "🔵" }, { key: "bust", label: "Poitrine", unit: "cm", icon: "🔵" }, { key: "thighs", label: "Cuisses", unit: "cm", icon: "🔵" }, { key: "arms", label: "Bras", unit: "cm", icon: "💪" }].filter(x => measurements[selectedDate][x.key]).map(({ key, label, unit, icon }) => (
                    <div key={key} style={{ textAlign: "center", background: "rgba(138,106,74,0.06)", borderRadius: 10, padding: "8px 4px" }}>
                      <div style={{ fontSize: 16 }}>{icon}</div>
                      <div style={{ fontSize: 16, fontWeight: "bold", color: C.measurements }}>{measurements[selectedDate][key]}{unit}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => { setNewMeasurement(measurements[selectedDate]); setShowAdd(p => ({ ...p, measurement: true })); }} style={{ marginTop: 10, background: "none", border: `1px solid ${C.measurements}`, borderRadius: 8, color: C.measurements, padding: "5px 14px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>✏️ Modifier</button>
              </div>
            ) : !showAdd.measurement ? (
              <AddBtn color={C.measurements} onClick={() => setShowAdd(p => ({ ...p, measurement: true }))}>+ Saisir mes mensurations du jour</AddBtn>
            ) : null}
            {showAdd.measurement && (
              <div style={{ background: "rgba(255,255,255,0.92)", border: "1px dashed rgba(138,106,74,0.4)", borderRadius: 13, padding: 14, marginBottom: 9 }}>
                <div style={{ fontWeight: "bold", color: C.measurements, marginBottom: 10, fontSize: 13 }}>Mensurations</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Field label="⚖️ Poids (kg)" type="number" value={newMeasurement.weight} onChange={v => setNewMeasurement(p => ({ ...p, weight: v }))} placeholder="ex: 62.5" />
                  <Field label="📐 Taille (cm)" type="number" value={newMeasurement.waist} onChange={v => setNewMeasurement(p => ({ ...p, waist: v }))} placeholder="ex: 68" />
                  <Field label="🔵 Hanches (cm)" type="number" value={newMeasurement.hips} onChange={v => setNewMeasurement(p => ({ ...p, hips: v }))} placeholder="ex: 92" />
                  <Field label="🔵 Poitrine (cm)" type="number" value={newMeasurement.bust} onChange={v => setNewMeasurement(p => ({ ...p, bust: v }))} placeholder="ex: 88" />
                  <Field label="🔵 Cuisses (cm)" type="number" value={newMeasurement.thighs} onChange={v => setNewMeasurement(p => ({ ...p, thighs: v }))} placeholder="ex: 54" />
                  <Field label="💪 Bras (cm)" type="number" value={newMeasurement.arms} onChange={v => setNewMeasurement(p => ({ ...p, arms: v }))} placeholder="ex: 29" />
                </div>
                <TextArea label="Notes" value={newMeasurement.notes} onChange={v => setNewMeasurement(p => ({ ...p, notes: v }))} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={saveMeasurement} style={{ background: C.measurements, color: "white", border: "none", borderRadius: 9, padding: "7px 18px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Enregistrer</button>
                  <button onClick={() => setShowAdd(p => ({ ...p, measurement: false }))} style={{ background: "none", border: "1px solid #ccc", borderRadius: 9, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#999" }}>Annuler</button>
                </div>
              </div>
            )}
            {measurementDates.length > 1 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: "bold", color: C.measurements, marginBottom: 12 }}>📈 Évolution</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                    <thead><tr>{["Date", "Poids", "Taille", "Hanches", "Poitrine"].map(h => <th key={h} style={{ padding: "4px 6px", color: C.muted, textAlign: "left", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                    <tbody>{measurementDates.map(d => (<tr key={d} style={{ background: d === selectedDate ? "rgba(138,106,74,0.07)" : "transparent" }}><td style={{ padding: "4px 6px", fontSize: 10 }}>{d.slice(5)}</td>{["weight", "waist", "hips", "bust"].map(k => <td key={k} style={{ padding: "4px 6px", color: measurements[d]?.[k] ? C.measurements : "#ddd", fontWeight: d === selectedDate ? "bold" : "normal" }}>{measurements[d]?.[k] || "-"}</td>)}</tr>))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>
        )}


        {/* ==== RECIPES ==== */}
        {activeTab === "recipes" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: "bold", color: "#5a7a4a" }}>📖 Mes recettes maison</div>
              {!showRecipeForm && <button onClick={() => { setShowRecipeForm(true); setEditingRecipe(null); setNewRecipe({ name: "", category: "", servings: "1", ingredients: [], notes: "" }); }} style={{ background: "#5a7a4a", color: "white", border: "none", borderRadius: 10, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>+ Nouvelle recette</button>}
            </div>

            {showRecipeForm && (
              <div style={{ background: C.card, border: "1px solid rgba(90,122,74,0.3)", borderRadius: 14, padding: 16, marginBottom: 14 }}>
                <div style={{ fontWeight: "bold", color: "#5a7a4a", marginBottom: 12, fontSize: 14 }}>{editingRecipe ? "✏️ Modifier la recette" : "🌿 Nouvelle recette"}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <Field label="Nom de la recette" value={newRecipe.name} onChange={v => setNewRecipe(p => ({ ...p, name: v }))} placeholder="ex: Tarte aux légumes" />
                  <Field label="Catégorie" value={newRecipe.category} onChange={v => setNewRecipe(p => ({ ...p, category: v }))} placeholder="ex: Plat, Dessert..." />
                  <Field label="Nombre de portions" type="number" value={newRecipe.servings} onChange={v => setNewRecipe(p => ({ ...p, servings: v }))} placeholder="ex: 4" />
                </div>

                {/* Ingrédients ajoutés */}
                {(newRecipe.ingredients || []).length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: C.muted, fontWeight: "bold", marginBottom: 6, letterSpacing: "0.5px" }}>INGRÉDIENTS</div>
                    {newRecipe.ingredients.map((ing, idx) => (
                      <div key={ing.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "rgba(90,122,74,0.06)", borderRadius: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13 }}>{ing.name} - {ing.quantity} {UNITS.find(u => u.value === ing.unit)?.label.split(" ")[0]}</span>
                        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                          <span style={{ fontSize: 10, color: C.food }}>{ing.proteins}g P</span>
                          <span style={{ fontSize: 10, color: "#d4a060" }}>{ing.carbs}g G</span>
                          <span style={{ fontSize: 10, color: "#80a860" }}>{ing.fats}g L</span>
                          <button onClick={() => setNewRecipe(p => ({ ...p, ingredients: p.ingredients.filter((_, i) => i !== idx) }))} style={{ background: "none", border: "none", cursor: "pointer", color: "#e07060", fontSize: 16 }}>×</button>
                        </div>
                      </div>
                    ))}
                    {(() => {
                      const macros = getRecipeMacrosPer100g(newRecipe);
                      const totalG = (newRecipe.ingredients || []).reduce((a, i) => { const u = UNITS.find(u => u.value === i.unit); return a + (parseFloat(i.quantity) || 0) * (u && u.factor ? u.factor : 100); }, 0);
                      return (
                        <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(90,122,74,0.1)", borderRadius: 8, fontSize: 12, color: "#5a7a4a", display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <span>🍽️ {parseFloat(newRecipe.servings) || 1} portion{parseFloat(newRecipe.servings) > 1 ? "s" : ""}</span>
                          <span>⚖️ ~{(totalG / (parseFloat(newRecipe.servings) || 1)).toFixed(0)}g/portion</span>
                          <span>🥩 {(macros.proteins * macros.serving_size_g / 100).toFixed(1)}g prot.</span>
                          <span>🌾 {(macros.carbs * macros.serving_size_g / 100).toFixed(1)}g gluc.</span>
                          <span>🥑 {(macros.fats * macros.serving_size_g / 100).toFixed(1)}g lip.</span>
                          <span>🔥 {(macros.calories * macros.serving_size_g / 100).toFixed(0)} kcal/portion</span>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Recherche ingrédient */}
                {!pendingRecipeIng ? (
                  <div style={{ position: "relative", marginBottom: 10 }}>
                    <input value={recipeIngSearch} onChange={e => handleRecipeIngSearch(e.target.value)} placeholder="🔍 Ajouter un ingrédient (ex: farine, œuf...)"
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 9, border: "1.5px solid rgba(90,122,74,0.4)", background: "rgba(255,255,255,0.9)", fontSize: 13, fontFamily: "inherit", color: C.text, outline: "none", boxSizing: "border-box" }} />
                    {recipeIngLoading && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12 }}>⏳</span>}
                    {recipeIngResults.length > 0 && (
                      <div style={{ background: "white", border: "1px solid rgba(90,122,74,0.3)", borderRadius: 10, marginTop: 4, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
                        {recipeIngResults.map(food => (
                          <div key={food.id} onClick={() => selectRecipeIngredient(food)} style={{ padding: "9px 13px", borderBottom: "1px solid rgba(210,160,130,0.15)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13 }}>{food.name.slice(0, 38)}</span>
                            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                              <span style={{ fontSize: 10, color: C.food }}>{food.proteins.toFixed(0)}g P</span>
                              <span style={{ fontSize: 10, color: "#d4a060" }}>{food.carbs.toFixed(0)}g G</span>
                              <span style={{ fontSize: 9, color: "#bbb" }}>/100g</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ background: "rgba(90,122,74,0.07)", border: "1px solid rgba(90,122,74,0.25)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                    <div style={{ fontWeight: "bold", fontSize: 13, color: "#3a5a2a", marginBottom: 8 }}>✅ {pendingRecipeIng.name.slice(0, 35)}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 10, color: C.muted, marginBottom: 3 }}>Quantité</label>
                        <input type="number" value={pendingRecipeIng.quantity} onChange={e => updatePendingRecipeIng(e.target.value, pendingRecipeIng.unit)} style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: "1px solid rgba(210,160,130,0.4)", background: "white", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 10, color: C.muted, marginBottom: 3 }}>Unité</label>
                        <select value={pendingRecipeIng.unit} onChange={e => updatePendingRecipeIng(pendingRecipeIng.quantity, e.target.value)} style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: "1px solid rgba(210,160,130,0.4)", background: "white", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}>
                          {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ color: C.food }}>🥩 {pendingRecipeIng.proteins}g P</span>
                      <span style={{ color: "#d4a060" }}>🌾 {pendingRecipeIng.carbs}g G</span>
                      <span style={{ color: "#80a860" }}>🥑 {pendingRecipeIng.fats}g L</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={confirmRecipeIngredient} style={{ background: "#5a7a4a", color: "white", border: "none", borderRadius: 8, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>+ Ajouter</button>
                      <button onClick={() => setPendingRecipeIng(null)} style={{ background: "none", border: "1px solid #ccc", borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#999" }}>Annuler</button>
                    </div>
                  </div>
                )}

                <TextArea label="Notes / instructions" value={newRecipe.notes} onChange={v => setNewRecipe(p => ({ ...p, notes: v }))} rows={3} />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={saveRecipe} style={{ background: "#5a7a4a", color: "white", border: "none", borderRadius: 9, padding: "7px 18px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>💾 Enregistrer</button>
                  <button onClick={() => { setShowRecipeForm(false); setEditingRecipe(null); setPendingRecipeIng(null); }} style={{ background: "none", border: "1px solid #ccc", borderRadius: 9, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#999" }}>Annuler</button>
                </div>
              </div>
            )}

            {/* Recipe list */}
            {Object.values(recipes).length === 0 && !showRecipeForm && (
              <div style={{ textAlign: "center", color: C.muted, padding: 40, fontStyle: "italic" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🌿</div>
                Aucune recette pour l'instant.<br/>Crée ta première recette maison !
              </div>
            )}
            {Object.values(recipes).map(recipe => {
              const macros = getRecipeMacrosPer100g(recipe);
              const perPortion = macros.serving_size_g;
              return (
                <div key={recipe.id} style={{ background: C.card, border: "1px solid rgba(90,122,74,0.2)", borderRadius: 14, padding: "13px 16px", marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: "bold", color: "#3a5a2a", fontSize: 15 }}>{recipe.name}</div>
                      {recipe.category && <div style={{ fontSize: 11, color: C.muted }}>{recipe.category} . {recipe.servings} portion{recipe.servings > 1 ? "s" : ""}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setNewRecipe({ ...recipe }); setEditingRecipe(recipe.id); setShowRecipeForm(true); }} style={{ background: "none", border: `1px solid rgba(90,122,74,0.4)`, borderRadius: 8, color: "#5a7a4a", padding: "3px 10px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>✏️</button>
                      <button onClick={() => deleteRecipe(recipe.id)} style={{ background: "none", border: "1px solid #e07060", borderRadius: 8, color: "#e07060", padding: "3px 10px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>🗑</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Pill color="#5a7a4a">⚖️ ~{perPortion.toFixed(0)}g/port.</Pill>
                    <Pill color={C.food}>{(macros.proteins * perPortion / 100).toFixed(1)}g P</Pill>
                    <Pill color="#d4a060">{(macros.carbs * perPortion / 100).toFixed(1)}g G</Pill>
                    <Pill color="#80a860">{(macros.fats * perPortion / 100).toFixed(1)}g L</Pill>
                    <Pill color="#a07060">{(macros.calories * perPortion / 100).toFixed(0)} kcal</Pill>
                  </div>
                  {recipe.ingredients?.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>{recipe.ingredients.map(i => i.name).join(", ")}</div>
                  )}
                  {recipe.notes && <div style={{ marginTop: 6, fontSize: 12, color: C.muted, fontStyle: "italic" }}>{recipe.notes}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* ==== HISTORY ==== */}
        {activeTab === "history" && (
          <div>
            <div style={{ fontSize: 16, fontWeight: "bold", color: C.primary, marginBottom: 14 }}>📅 Journal des 30 derniers jours</div>
            {historyDates.length === 0 && <div style={{ textAlign: "center", color: C.muted, padding: 40, fontStyle: "italic" }}>Aucune entrée pour l'instant</div>}
            {historyDates.map(date => {
              const d = allData[date] || {};
              const macros = (d.meals || []).reduce((a, meal) => { const m = getMealMacros(meal); return { p: a.p + m.p, g: a.g + m.g, l: a.l + m.l }; }, { p: 0, g: 0, l: 0 });
              const sport = (d.workouts || []).reduce((a, w) => a + (parseInt(w.duration) || 0), 0);
              const med = (d.meditations || []).reduce((a, m) => a + (parseInt(m.duration) || 0), 0);
              const w = d.waterGlasses || 0;
              return (
                <div key={date} onClick={() => { setSelectedDate(date); setActiveTab("food"); }} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "13px 16px", marginBottom: 10, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: "bold", color: C.primary, fontSize: 14 }}>{formatDate(date)}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{(d.meals || []).length} repas . P{macros.p.toFixed(0)}g G{macros.g.toFixed(0)}g L{macros.l.toFixed(0)}g</div>
                    </div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {w > 0 && <Pill color={C.water}>💧{w}</Pill>}
                      {sport > 0 && <Pill color={C.sport}>🏃{sport}m</Pill>}
                      {med > 0 && <Pill color={C.meditation}>🧘{med}m</Pill>}
                      {d.cyclePhase && <Pill color={C.food}>🌸{d.cyclePhase.slice(0, 4)}.</Pill>}
                      {measurements[date] && <Pill color={C.measurements}>📏{measurements[date].weight ? measurements[date].weight + "kg" : "✓"}</Pill>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

// function FoodSearch({ mealId, activeMealId, setActiveMealId, foodSearch, setFoodSearch, foodResults, foodLoading, pendingItem, setPendingItem, selectFood, updatePendingQuantity, confirmAddFood }) {
  const isActive = activeMealId === mealId;
  const showPending = pendingItem && isActive;

  return (
    <div style={{ marginTop: 12 }}>
      {!showPending && (
        <div style={{ position: "relative" }}>
          <input
            value={isActive ? foodSearch : ""}
            onFocus={() => setActiveMealId(mealId)}
            onChange={e => { setActiveMealId(mealId); setFoodSearch(e.target.value); }}
            placeholder="🔍 Rechercher un aliment (ex: poulet, yaourt...)"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 9, border: "1.5px solid rgba(196,96,122,0.4)", background: "rgba(255,255,255,0.9)", fontSize: 13, fontFamily: "inherit", color: "#3d2b1f", outline: "none", boxSizing: "border-box" }}
          />
          {isActive && foodLoading && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#b07060" }}>⏳</span>}
        </div>
      )}

      {isActive && !showPending && foodResults.length > 0 && (
        <div style={{ background: "white", border: "1px solid rgba(210,160,130,0.35)", borderRadius: 10, marginTop: 4, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
          {foodResults.map(food => (
            <div key={food.id} onClick={() => { setActiveMealId(mealId); selectFood(food); }} style={{ padding: "9px 13px", borderBottom: "1px solid rgba(210,160,130,0.15)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#3d2b1f" }}>{food.name.slice(0, 38)}</span>
              <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 8 }}>
                <span style={{ fontSize: 10, color: "#c4607a" }}>{food.proteins.toFixed(0)}g P</span>
                <span style={{ fontSize: 10, color: "#d4a060" }}>{food.carbs.toFixed(0)}g G</span>
                <span style={{ fontSize: 10, color: "#80a860" }}>{food.fats.toFixed(0)}g L</span>
                <span style={{ fontSize: 9, color: "#bbb" }}>/100g</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {isActive && !showPending && foodSearch.length > 1 && !foodLoading && foodResults.length === 0 && (
        <div style={{ fontSize: 12, color: "#b07060", marginTop: 6, textAlign: "center" }}>Aucun résultat. Essaie un autre terme ou crée ta recette dans l'onglet 📖 Mes recettes.</div>
      )}

      {showPending && (
        <div style={{ background: "rgba(196,96,122,0.06)", border: "1px solid rgba(196,96,122,0.25)", borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: "bold", fontSize: 13, color: "#5a2a1a", marginBottom: 8 }}>✅ {pendingItem.name.slice(0, 38)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#b07060", marginBottom: 3 }}>Quantité</label>
              <input type="number" value={pendingItem.quantity} onChange={e => updatePendingQuantity(e.target.value, pendingItem.unit)} style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: "1px solid rgba(210,160,130,0.4)", background: "white", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#b07060", marginBottom: 3 }}>Unité</label>
              <select value={pendingItem.unit} onChange={e => updatePendingQuantity(pendingItem.quantity, e.target.value)} style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: "1px solid rgba(210,160,130,0.4)", background: "white", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}>
                {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 12, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ color: "#c4607a" }}>🥩 {pendingItem.proteins}g prot.</span>
            <span style={{ color: "#d4a060" }}>🌾 {pendingItem.carbs}g gluc.</span>
            <span style={{ color: "#80a860" }}>🥑 {pendingItem.fats}g lip.</span>
            {pendingItem.calories > 0 && <span style={{ color: "#a07060" }}>🔥 {pendingItem.calories} kcal</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => confirmAddFood(mealId)} style={{ background: "#c4607a", color: "white", border: "none", borderRadius: 8, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>+ Ajouter au repas</button>
            <button onClick={() => setPendingItem(null)} style={{ background: "none", border: "1px solid #ccc", borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#999" }}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}

// function Section({ title, color, children }) { return <div style={{ marginBottom: 22 }}><div style={{ fontSize: 13, fontWeight: "bold", color: color || "#8b3a3a", marginBottom: 10, letterSpacing: "0.4px" }}>{title}</div>{children}</div>; }
function AddBtn({ onClick, color, children }) { return <button onClick={onClick} style={{ width: "100%", padding: "11px", borderRadius: 13, border: `1.5px dashed ${color}55`, background: `${color}08`, color, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>{children}</button>; }
function ActionBtn({ onClick, color, outline, children }) { return <button onClick={onClick} style={{ padding: "7px 14px", borderRadius: 10, border: `1px solid ${color}`, background: outline ? "transparent" : `${color}15`, color, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>{children}</button>; }
function DeleteBtn({ onClick }) { return <button onClick={onClick} style={{ marginTop: 8, background: "none", border: "1px solid #e07060", borderRadius: 7, color: "#e07060", padding: "3px 11px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>🗑 Supprimer</button>; }
function NavBtn({ onClick, disabled, children }) { return <button onClick={onClick} disabled={disabled} style={{ background: "none", border: "none", fontSize: 18, cursor: disabled ? "default" : "pointer", color: disabled ? "#ddd" : "#8b3a3a", padding: "0 4px" }}>{children}</button>; }
function ChevronIcon({ open }) { return <span style={{ color: "#b07060", fontSize: 11 }}>{open ? "▲" : "▼"}</span>; }
function Pill({ children, color }) { return <span style={{ background: color + "18", color, border: `1px solid ${color}35`, borderRadius: 20, padding: "2px 7px", fontSize: 11, whiteSpace: "nowrap" }}>{children}</span>; }
function Field({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 10, color: "#b07060", marginBottom: 3, letterSpacing: "0.4px" }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: "1px solid rgba(210,160,130,0.4)", background: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "inherit", color: "#3d2b1f", outline: "none", boxSizing: "border-box" }} />
    </div>
  );
}
function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 10, color: "#b07060", marginBottom: 3, letterSpacing: "0.4px" }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: "1px solid rgba(210,160,130,0.4)", background: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "inherit", color: value ? "#3d2b1f" : "#b07060", outline: "none", boxSizing: "border-box" }}>
        <option value="">- choisir -</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
function TextArea({ label, value, onChange, rows = 2 }) {
  return (
    <div style={{ marginTop: 8 }}>
      {label && <label style={{ display: "block", fontSize: 10, color: "#b07060", marginBottom: 3, letterSpacing: "0.4px" }}>{label}</label>}
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: "1px solid rgba(210,160,130,0.4)", background: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "inherit", color: "#3d2b1f", resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.5 }} />
    </div>
  );
}
