/* =====================================================================
 * CreditRisk AI — frontend logic (vanilla JS)
 *
 * >>> BACKEND URL — change it HERE, and only here <<<
 *   Local testing:  http://127.0.0.1:8000
 *   Deployed:       https://your-backend-name.onrender.com
 * Use no trailing slash.
 * ===================================================================== */
const API_BASE_URL = "http://127.0.0.1:8000";

const REQUEST_TIMEOUT_MS = 70000; // Render free tier can take ~50s to wake up

/* Field order and names match the FastAPI request model exactly. */
const NUMERIC_FIELDS = {
  person_age:                  { label: "Age",                    min: 18, max: 100, integer: true },
  person_income:               { label: "Annual income",          min: 1,  integer: false },
  person_emp_length:           { label: "Employment length",      min: 0,  max: 80,  integer: false },
  loan_amnt:                   { label: "Loan amount",            min: 1,  integer: false },
  loan_int_rate:               { label: "Interest rate",          min: 0,  max: 100, integer: false },
  cb_person_cred_hist_length:  { label: "Credit history length",  min: 0,  max: 80,  integer: false },
};
const CATEGORICAL_FIELDS = {
  person_home_ownership:     { label: "Home ownership",         values: ["RENT", "OWN", "MORTGAGE", "OTHER"] },
  loan_intent:               { label: "Loan purpose",           values: ["PERSONAL", "EDUCATION", "MEDICAL", "VENTURE", "HOMEIMPROVEMENT", "DEBTCONSOLIDATION"] },
  loan_grade:                { label: "Loan grade",             values: ["A", "B", "C", "D", "E", "F", "G"] },
  cb_person_default_on_file: { label: "Previous default",       values: ["Y", "N"] },
};

const SAMPLES = {
  low: {
    person_age: 35, person_income: 90000, person_home_ownership: "MORTGAGE", person_emp_length: 10,
    loan_intent: "EDUCATION", loan_grade: "A", loan_amnt: 8000, loan_int_rate: 7.5,
    cb_person_default_on_file: "N", cb_person_cred_hist_length: 12,
  },
  high: {
    person_age: 22, person_income: 24000, person_home_ownership: "RENT", person_emp_length: 1,
    loan_intent: "MEDICAL", loan_grade: "E", loan_amnt: 15000, loan_int_rate: 17.5,
    cb_person_default_on_file: "Y", cb_person_cred_hist_length: 2,
  },
};

/* ---------- DOM helpers ---------- */
const $ = (id) => document.getElementById(id);
const form = $("riskForm");
const states = ["stateEmpty", "stateLoading", "stateError", "stateResult"];

function showState(name) {
  states.forEach((s) => { $(s).hidden = s !== name; });
}
function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

/* ---------- loan_percent_income = loan_amnt / person_income ---------- */
function computePercentIncome() {
  const loan = parseFloat($("loan_amnt").value);
  const income = parseFloat($("person_income").value);
  if (!isFinite(loan) || !isFinite(income) || income <= 0) return null; // prevents divide-by-zero
  return loan / income;
}
function updatePercentIncome() {
  const ratio = computePercentIncome();
  $("loan_percent_income").value = ratio === null ? "—" : `${(ratio * 100).toFixed(1)}%  (${ratio.toFixed(2)})`;
}

/* ---------- Validation ---------- */
function setError(name, message) {
  const field = $(name).closest(".field");
  const out = $("err_" + name);
  field.classList.toggle("invalid", Boolean(message));
  $(name).setAttribute("aria-invalid", message ? "true" : "false");
  if (out) { out.textContent = message || ""; $(name).setAttribute("aria-describedby", message ? out.id : ""); }
}

function validate() {
  let firstInvalid = null;
  const fail = (name, msg) => { setError(name, msg); firstInvalid = firstInvalid || $(name); };

  for (const [name, rule] of Object.entries(NUMERIC_FIELDS)) {
    const raw = $(name).value.trim();
    const num = Number(raw);
    if (raw === "" || !isFinite(num)) fail(name, `${rule.label} is required.`);
    else if (rule.integer && !Number.isInteger(num)) fail(name, `${rule.label} must be a whole number.`);
    else if (num < rule.min) fail(name, `${rule.label} must be at least ${rule.min}.`);
    else if (rule.max !== undefined && num > rule.max) fail(name, `${rule.label} must be at most ${rule.max}.`);
    else setError(name, "");
  }
  for (const [name, rule] of Object.entries(CATEGORICAL_FIELDS)) {
    if (!rule.values.includes($(name).value)) fail(name, `Choose a value for ${rule.label.toLowerCase()}.`);
    else setError(name, "");
  }
  if (firstInvalid) firstInvalid.focus();
  return !firstInvalid;
}

/* ---------- Build the JSON body (exact backend field names) ---------- */
function buildPayload() {
  const ratio = computePercentIncome();
  return {
    person_age: Number($("person_age").value),
    person_income: Number($("person_income").value),
    person_home_ownership: $("person_home_ownership").value,
    person_emp_length: Number($("person_emp_length").value),
    loan_intent: $("loan_intent").value,
    loan_grade: $("loan_grade").value,
    loan_amnt: Number($("loan_amnt").value),
    loan_int_rate: Number($("loan_int_rate").value),
    loan_percent_income: Number(ratio.toFixed(4)),
    cb_person_default_on_file: $("cb_person_default_on_file").value,
    cb_person_cred_hist_length: Number($("cb_person_cred_hist_length").value),
  };
}

/* ---------- API call ---------- */
async function requestPrediction(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let body = null;
    try { body = await res.json(); } catch (_) { /* non-JSON body */ }

    if (!res.ok) {
      const err = new Error("http");
      err.status = res.status;
      err.detail = body && body.detail;
      throw err;
    }
    if (!body || typeof body.default_probability !== "number") {
      const err = new Error("shape");
      throw err;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function friendlyError(err) {
  if (err.name === "AbortError") {
    return ["The server took too long to respond", "If the backend is hosted on Render's free tier it may be waking up. Wait a moment and try again."];
  }
  if (err.message === "shape") {
    return ["Unexpected response from the server", "The backend replied, but not with the expected prediction fields. Check the /predict response format."];
  }
  if (err.message === "http") {
    if (err.status === 422) {
      const detail = Array.isArray(err.detail)
        ? err.detail.map((d) => `${(d.loc || []).slice(1).join(".")}: ${d.msg}`).join("; ")
        : "";
      return ["The backend rejected the input", detail || "One or more values are not accepted by the model. Review the form and try again."];
    }
    if (err.status >= 500) return ["The server hit an error", "The prediction service failed while processing this request. Try again shortly."];
    return [`Request failed (HTTP ${err.status})`, "Check that the backend URL and /predict route are correct."];
  }
  return ["Can't reach the prediction server",
    `Make sure the backend is running at ${API_BASE_URL} and that its CORS settings allow this site's origin.`];
}

/* ---------- Render the real backend response ---------- */
const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;

function renderResult(data) {
  const prob = data.default_probability;
  const threshold = typeof data.threshold === "number" ? data.threshold : null;
  const isHigh = data.default_prediction === 1 || data.default_prediction === true ||
    (data.default_prediction == null && /high/i.test(String(data.Result)));
  const tone = isHigh ? "high" : "low";
  const label = data.Result ? String(data.Result) : (isHigh ? "High Risk" : "Low Risk");

  $("verdict").className = `verdict ${tone}`;
  $("verdictIcon").innerHTML = `<i data-lucide="${isHigh ? "alert-octagon" : "check-circle-2"}"></i>`;
  $("verdictLabel").textContent = label;
  $("verdictSub").textContent = isHigh ? "Likely to default at this threshold" : "Unlikely to default at this threshold";

  $("probValue").textContent = pct(prob);
  $("probValue").className = `big-number ${tone}`;

  const clamped = Math.min(Math.max(prob, 0), 1);
  $("meter").setAttribute("aria-label",
    `Default probability ${pct(prob)}${threshold !== null ? `, threshold ${pct(threshold)}` : ""}`);
  const fill = $("meterFill");
  fill.className = `meter-fill ${tone}`;
  fill.style.width = "0";
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${clamped * 100}%`; }));

  const marker = $("meterThreshold");
  marker.hidden = threshold === null;
  if (threshold !== null) {
    marker.style.left = `${Math.min(Math.max(threshold, 0), 1) * 100}%`;
    $("thresholdTag").textContent = pct(threshold);
  }

  $("sumProb").textContent = pct(prob, 2);
  $("sumThreshold").textContent = threshold !== null ? pct(threshold, 2) : "—";
  $("sumPred").textContent = `${data.default_prediction} (${isHigh ? "default" : "no default"})`;
  $("sumResult").textContent = label;

  showState("stateResult");
  refreshIcons();
}

function renderError(title, text) {
  $("errorTitle").textContent = title;
  $("errorText").textContent = text;
  showState("stateError");
  refreshIcons();
}

/* ---------- Events ---------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validate()) return;

  const btn = $("predictBtn");
  btn.disabled = true;
  btn.querySelector("span").textContent = "Predicting…";
  showState("stateLoading");

  try {
    const data = await requestPrediction(buildPayload());
    renderResult(data);
  } catch (err) {
    console.error("Prediction failed:", err);
    renderError(...friendlyError(err)); // never shows a made-up prediction
  } finally {
    btn.disabled = false;
    btn.querySelector("span").textContent = "Predict risk";
  }
});

form.addEventListener("input", (e) => {
  if (e.target.id === "loan_amnt" || e.target.id === "person_income") updatePercentIncome();
  if (e.target.id in NUMERIC_FIELDS || e.target.id in CATEGORICAL_FIELDS) setError(e.target.id, "");
});

$("resetBtn").addEventListener("click", () => {
  form.reset();
  Object.keys({ ...NUMERIC_FIELDS, ...CATEGORICAL_FIELDS }).forEach((n) => setError(n, ""));
  updatePercentIncome();
  showState("stateEmpty");
});

function loadSample(kind) {
  Object.entries(SAMPLES[kind]).forEach(([k, v]) => { $(k).value = v; setError(k, ""); });
  updatePercentIncome();
  showState("stateEmpty");
}
$("sampleLow").addEventListener("click", () => loadSample("low"));
$("sampleHigh").addEventListener("click", () => loadSample("high"));

/* ---------- Optional backend reachability check (GET /docs, FastAPI default) ---------- */
async function checkApi() {
  const box = $("apiStatus"), text = $("apiStatusText");
  try {
    const c = new AbortController();
    setTimeout(() => c.abort(), 8000);
    const res = await fetch(`${API_BASE_URL}/docs`, { method: "GET", signal: c.signal });
    box.className = `api-status ${res.ok ? "online" : "offline"}`;
    text.textContent = res.ok ? "API connected" : "API unavailable";
  } catch (_) {
    box.className = "api-status offline";
    text.textContent = "API unreachable";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  refreshIcons();
  updatePercentIncome();
  checkApi();
});
