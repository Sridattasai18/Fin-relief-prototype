/* ================================================================
   FinRelief AI — app.js
   Served at /static/js/app.js by FastAPI StaticFiles.
   API_BASE is empty string — frontend is served FROM the backend,
   so all fetch() calls go to the same origin with no CORS needed.
================================================================ */

const API_BASE = '';   // same-origin: FastAPI serves both the HTML and the API

let currentUser = null;
let authToken = null;
let authMode = 'login';
let loans = [];
let letterHistoryData = [];
let activeLoanId = null;
let currentLetter = '';
let currentLetterId = null;
let currentSettlement = null;

/* ---- Formatters ---- */
function inr(n){ return '₹' + Math.round(n).toLocaleString('en-IN'); }
function pct(n){ return Math.round(n) + '%'; }
function fmtDate(iso){ return new Date(iso).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'}); }

/* ================================================================
   Toast notifications
================================================================ */
function toast(msg, type='info', duration=3500){
  const c = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast' + (type !== 'info' ? ' ' + type : '');
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ';
  el.innerHTML = `<span style="font-size:15px;">${icon}</span><span>${msg}</span>`;
  c.appendChild(el);
  setTimeout(() => {
    el.classList.add('hiding');
    setTimeout(() => el.remove(), 220);
  }, duration);
}

/* ================================================================
   API helper — all calls go to same-origin FastAPI server
================================================================ */
async function api(path, options = {}){
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  let res;
  try {
    res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
  } catch (err) {
    throw new Error('Could not reach the backend. Is uvicorn running? (uvicorn main:app --port 8000)');
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch(e){}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

/* ================================================================
   Auth
================================================================ */
function toggleAuthMode(){
  authMode = authMode === 'login' ? 'register' : 'login';
  document.getElementById('nameFieldWrap').style.display = authMode === 'register' ? 'block' : 'none';
  document.getElementById('authSub').textContent = authMode === 'register'
    ? 'Create an account to start tracking your loans'
    : 'Log in to manage your loans and settlements';
  document.getElementById('authSubmitBtn').textContent = authMode === 'register' ? 'Create account' : 'Log in';
  document.getElementById('authToggle').innerHTML = authMode === 'register'
    ? 'Already have an account? <a data-action="toggleAuthMode">Log in</a>'
    : 'New here? <a data-action="toggleAuthMode">Create an account</a>';
  document.getElementById('authErr').textContent = '';
}

async function handleAuth(e){
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const name = document.getElementById('authName').value.trim();
  const errEl = document.getElementById('authErr');
  const submitBtn = document.getElementById('authSubmitBtn');
  errEl.textContent = '';

  if (!email || !password || (authMode === 'register' && !name)) {
    errEl.textContent = 'Please fill in all fields.';
    return false;
  }

  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.innerHTML = '<span class="spinner"></span>' + (authMode === 'register' ? 'Creating…' : 'Logging in…');

  try {
    const path = authMode === 'register' ? '/auth/register' : '/auth/login';
    const body = authMode === 'register' ? { name, email, password } : { email, password };
    const data = await api(path, { method: 'POST', body: JSON.stringify(body) });

    authToken = data.access_token;
    currentUser = data.user;

    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userAvatar').textContent = currentUser.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();

    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    toast('Welcome, ' + currentUser.name + '!', 'success');
    await navigate('dashboard');
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
  return false;
}

function logout(){
  authToken = null; currentUser = null;
  loans = []; letterHistoryData = [];
  activeLoanId = null; currentLetter = ''; currentLetterId = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('authErr').textContent = '';
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
}

/* ================================================================
   Navigation
================================================================ */
async function navigate(pageId){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.navitem').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  document.querySelector('.navitem[data-page="' + pageId + '"]').classList.add('active');

  try {
    if(pageId === 'dashboard')  await renderDashboard();
    if(pageId === 'loans')      await renderLoansTable();
    if(pageId === 'settlement') await renderSettlement();
    if(pageId === 'letters')    await renderLettersPage();
  } catch (err) {
    if (err.message && err.message.includes('Could not validate credentials')) {
      logout();
    } else {
      toast(err.message, 'error');
    }
  }
}

/* ================================================================
   Dashboard  →  GET /dashboard  +  GET /letters  +  GET /snapshots
================================================================ */
async function renderDashboard(){
  await loadLoans();
  const [dashData, letters] = await Promise.all([
    api('/dashboard'),
    api('/letters'),
  ]);
  letterHistoryData = letters;

  // Stat cards — populated from real /dashboard response
  const dtiSt = statusFor('dti', dashData.avg_dti);
  const strSt  = statusFor('stress', dashData.overall_stress);
  document.getElementById('dash-dti').textContent     = pct(dashData.avg_dti);
  document.getElementById('dash-dti-foot').innerHTML  = `<span class="badge ${dtiSt.cls} dot">${dtiSt.label}</span>`;
  document.getElementById('dash-surplus').textContent = inr(dashData.monthly_surplus);
  document.getElementById('dash-stress').textContent  = Math.round(dashData.overall_stress) + ' / 100';
  document.getElementById('dash-stress-foot').innerHTML = `<span class="badge ${strSt.cls} dot">${strSt.label}</span>`;
  document.getElementById('dash-loans').textContent   = dashData.loan_count;
  document.getElementById('dash-loans-foot').textContent = dashData.loan_count === 0
    ? 'No loans yet'
    : 'Total debt: ' + inr(dashData.total_debt);

  updateInsight(dashData);

  // Settlement history table — from GET /letters
  const tbody = document.getElementById('historyTableBody');
  if(letters.length === 0){
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state">No settlements yet. Review a loan to get a recommendation.</div></td></tr>';
  } else {
    tbody.innerHTML = letters.slice(0,6).map(l => `
      <tr>
        <td>${fmtDate(l.created_at)}</td>
        <td>${l.lender}</td>
        <td class="num">${Math.round(l.settlement_pct)}%</td>
        <td><span class="badge ${l.source === 'AI' ? 'ai' : 'tight'}">${l.source}</span></td>
      </tr>
    `).join('');
  }

  await drawTrendChart();
}

function updateInsight(dash){
  const el = document.getElementById('insightText');
  if (dash.loan_count === 0) {
    el.textContent = 'No loans on record yet. Add your first loan to start tracking your debt stress score and get personalised settlement recommendations.';
    return;
  }
  const stress = dash.overall_stress;
  const dti    = dash.avg_dti;
  const surplus = dash.monthly_surplus;
  let msg = '';
  if (stress >= 65) {
    msg = `Your average debt stress score of ${Math.round(stress)}/100 is high — driven by a ${pct(dti)} debt-to-income ratio and ${inr(surplus)} monthly surplus. Initiating a One Time Settlement now could significantly reduce your total repayment burden.`;
  } else if (stress >= 40) {
    msg = `Your debt stress is moderate at ${Math.round(stress)}/100. With a ${pct(dti)} DTI and ${inr(surplus)} left after EMIs, you have some breathing room — but it's worth reviewing settlement options before overdue days increase.`;
  } else {
    msg = `Your financial position looks manageable — stress score ${Math.round(stress)}/100 and ${pct(dti)} DTI. Keep monitoring as overdue days increase your settlement leverage window.`;
  }
  el.textContent = msg;
}

/* Trend chart — pulls from GET /snapshots; falls back to illustrative data */
async function drawTrendChart(){
  const svg    = document.getElementById('trendChart');
  const noteEl = document.getElementById('chartNote');
  let stress, settle, labels, isReal = false;

  try {
    const snaps = await api('/snapshots?limit=30');
    if (snaps && snaps.length >= 2) {
      stress  = snaps.map(s => s.stress_score);
      settle  = snaps.map(s => s.settlement_pct);
      labels  = snaps.map(s => { const d = new Date(s.created_at); return d.getDate() + '/' + (d.getMonth()+1); });
      isReal  = true;
      noteEl.textContent = 'Showing ' + snaps.length + ' real data point' + (snaps.length > 1 ? 's' : '') + ' from your settlement history.';
    }
  } catch(e){}

  if (!isReal) {
    stress  = [52,58,61,65,68,71];
    settle  = [30,33,35,38,40,42];
    labels  = ['Jan','Feb','Mar','Apr','May','Jun'];
    noteEl.textContent = 'Showing illustrative data — visit Settlement for your first real data point.';
  }

  const w=560,h=190,padL=30,padB=24,padT=10,padR=10;
  const plotW=w-padL-padR, plotH=h-padT-padB, maxV=100;
  function pathFor(arr){
    return arr.map((v,i)=>{
      const x=padL+(i/(arr.length-1))*plotW;
      const y=padT+plotH-(v/maxV)*plotH;
      return (i===0?'M':'L')+x.toFixed(1)+','+y.toFixed(1);
    }).join(' ');
  }
  let gridLines='';
  for(let i=0;i<=4;i++){ const y=padT+(i/4)*plotH; gridLines+=`<line x1="${padL}" y1="${y}" x2="${w-padR}" y2="${y}" stroke="#EDEAE1" stroke-width="1"/>`; }
  const xLabels=labels.map((m,i)=>{ const x=padL+(i/(labels.length-1))*plotW; return `<text x="${x}" y="${h-6}" font-size="10" fill="#7A776E" text-anchor="middle" font-family="Inter">${m}</text>`; }).join('');
  svg.innerHTML = gridLines + xLabels +
    `<path d="${pathFor(stress)}" fill="none" stroke="#1B1A17" stroke-width="2"/>` +
    `<path d="${pathFor(settle)}" fill="none" stroke="#B8622B" stroke-width="2" stroke-dasharray="4 3"/>` +
    stress.map((v,i)=>{const x=padL+(i/(stress.length-1))*plotW;const y=padT+plotH-(v/maxV)*plotH;return `<circle cx="${x}" cy="${y}" r="3" fill="#1B1A17"/>`;}).join('') +
    settle.map((v,i)=>{const x=padL+(i/(settle.length-1))*plotW;const y=padT+plotH-(v/maxV)*plotH;return `<circle cx="${x}" cy="${y}" r="3" fill="#B8622B"/>`;}).join('');
}

/* ================================================================
   Loans  →  GET /loans  POST /loans  PATCH /loans/{id}  DELETE /loans/{id}
================================================================ */
function toggleAddLoanForm(){
  const el = document.getElementById('addLoanCard');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function loadLoans(){
  loans = await api('/loans');
}

async function addLoan(e){
  e.preventDefault();
  const lender      = document.getElementById('newLender').value.trim();
  const loan_type   = document.getElementById('newLoanType').value;
  const amount      = parseFloat(document.getElementById('newAmount').value);
  const emi         = parseFloat(document.getElementById('newEmi').value);
  const overdue_days= parseInt(document.getElementById('newOverdue').value);
  const income      = parseFloat(document.getElementById('newIncome').value);

  const btn = document.getElementById('addLoanBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Adding…';
  try {
    await api('/loans', { method:'POST', body:JSON.stringify({lender,loan_type,amount,emi,overdue_days,income}) });
    document.getElementById('addLoanCard').style.display = 'none';
    e.target.reset();
    await renderLoansTable();
    toast('Loan added successfully.', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add loan';
  }
  return false;
}

async function deleteLoan(id){
  if (!confirm('Delete this loan? This will also remove its letters and history. Cannot be undone.')) return;
  try {
    await api('/loans/' + id, { method:'DELETE' });
    if (activeLoanId === id) activeLoanId = null;
    await renderLoansTable();
    toast('Loan deleted.', 'warning');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function overdueStatus(days){
  if(days === 0)  return {label:'Current', cls:'healthy'};
  if(days <= 30)  return {label:'Tight',   cls:'tight'};
  return {label:'Overdue', cls:'high'};
}

function openEditRow(loan){
  closeAllEditRows();
  const row = document.getElementById('edit-row-' + loan.id);
  if (row) row.style.display = 'table-row';
}

function closeAllEditRows(){
  document.querySelectorAll('.edit-row').forEach(r => r.style.display = 'none');
}

async function saveEditLoan(id){
  const lender      = document.getElementById('edit-lender-'+id).value.trim();
  const loan_type   = document.getElementById('edit-type-'+id).value;
  const amount      = parseFloat(document.getElementById('edit-amount-'+id).value);
  const emi         = parseFloat(document.getElementById('edit-emi-'+id).value);
  const overdue_days= parseInt(document.getElementById('edit-overdue-'+id).value);
  const income      = parseFloat(document.getElementById('edit-income-'+id).value);
  const btn = document.getElementById('save-edit-'+id);
  btn.disabled = true; btn.innerHTML='<span class="spinner dark"></span>';
  try {
    await api('/loans/'+id, { method:'PATCH', body:JSON.stringify({lender,loan_type,amount,emi,overdue_days,income}) });
    await renderLoansTable();
    toast('Loan updated.', 'success');
  } catch(err){ toast(err.message,'error'); btn.disabled=false; btn.textContent='Save'; }
}

async function renderLoansTable(){
  await loadLoans();
  const tbody = document.getElementById('loansTableBody');
  if(loans.length === 0){
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">No loans added yet. Click "+ Add loan" to get started.</div></td></tr>';
    return;
  }
  tbody.innerHTML = loans.map(l => {
    const st = overdueStatus(l.overdue_days);
    return `
      <tr class="clickable-row" data-action="selectLoan" data-arg="${l.id}">
        <td><div class="loan-name-cell"><b>${l.lender}</b><span>${l.loan_type}</span></div></td>
        <td>${inr(l.amount)}</td>
        <td>${inr(l.emi)}</td>
        <td>${l.overdue_days} days</td>
        <td><span class="badge ${st.cls} dot">${st.label}</span></td>
        <td>
          <div class="action-cell" onclick="event.stopPropagation()">
            <button class="btn-icon edit" onclick="openEditRow(${JSON.stringify(l).replace(/"/g,'&quot;')})">✎ Edit</button>
            <button class="btn-icon" onclick="deleteLoan(${l.id})">✕ Delete</button>
          </div>
        </td>
      </tr>
      <tr class="edit-row" id="edit-row-${l.id}" style="display:none;">
        <td colspan="6">
          <div class="edit-form">
            <div class="field"><label>Lender</label><input id="edit-lender-${l.id}" value="${l.lender}" type="text"></div>
            <div class="field"><label>Type</label>
              <select id="edit-type-${l.id}">
                <option ${l.loan_type==='Personal loan'?'selected':''}>Personal loan</option>
                <option ${l.loan_type==='Credit card'?'selected':''}>Credit card</option>
                <option ${l.loan_type==='Digital lending app'?'selected':''}>Digital lending app</option>
                <option ${l.loan_type==='NBFC loan'?'selected':''}>NBFC loan</option>
              </select>
            </div>
            <div class="field"><label>Amount (₹)</label><input id="edit-amount-${l.id}" value="${l.amount}" type="number"></div>
            <div class="field"><label>EMI (₹)</label><input id="edit-emi-${l.id}" value="${l.emi}" type="number"></div>
            <div class="field"><label>Overdue days</label><input id="edit-overdue-${l.id}" value="${l.overdue_days}" type="number" min="0"></div>
            <div class="field"><label>Income (₹)</label><input id="edit-income-${l.id}" value="${l.income}" type="number"></div>
          </div>
          <div style="display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--hairline);">
            <button id="save-edit-${l.id}" class="btn btn-primary" style="padding:8px 16px;font-size:13px;" onclick="saveEditLoan(${l.id})">Save</button>
            <button class="btn btn-secondary" style="padding:8px 16px;font-size:13px;" onclick="closeAllEditRows()">Cancel</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function selectLoan(id){
  activeLoanId = id;
  navigate('settlement');
}

/* ================================================================
   Settlement  →  GET /settlement/{loan_id}  (snapshots auto-saved by backend)
================================================================ */
function computeMetrics(income, emi, overdue, amount){
  const dti = Math.min(100,(emi/Math.max(income,1))*100);
  const surplus = income - emi - (income*0.4);
  let stress = (dti*0.5) + (Math.min(overdue,180)/180*40) + (surplus<0?10:0);
  stress = Math.max(0,Math.min(100,stress));
  let settlePct = 25+(stress*0.35);
  settlePct = Math.max(20,Math.min(70,settlePct));
  return {dti,surplus,stress,settlePct};
}

function statusFor(kind,val){
  if(kind==='dti'){     if(val<35)return{label:'Healthy',cls:'healthy'};if(val<55)return{label:'Tight',cls:'tight'};return{label:'High',cls:'high'}; }
  if(kind==='surplus'){ if(val>5000)return{label:'Healthy',cls:'healthy'};if(val>=0)return{label:'Tight',cls:'tight'};return{label:'High risk',cls:'high'}; }
  if(kind==='stress'){  if(val<40)return{label:'Healthy',cls:'healthy'};if(val<65)return{label:'Tight',cls:'tight'};return{label:'High',cls:'high'}; }
  if(kind==='overdue'){ if(val===0)return{label:'Current',cls:'healthy'};if(val<=30)return{label:'Tight',cls:'tight'};return{label:'High',cls:'high'}; }
}

async function renderSettlement(){
  if (loans.length === 0) await loadLoans();
  if (!activeLoanId && loans.length > 0) activeLoanId = loans[0].id;
  const loan = loans.find(l => l.id === activeLoanId) || loans[0];
  if (!loan) {
    document.getElementById('settlementSub').textContent = 'No loans yet — add one first';
    return;
  }
  document.getElementById('settlementSub').textContent = 'Reviewing loan with ' + loan.lender;
  document.getElementById('sl-income').value  = loan.income;
  document.getElementById('sl-emi').value     = loan.emi;
  document.getElementById('sl-overdue').value = loan.overdue_days;
  window._settlementLoan = loan;

  // Official recommendation from backend — also triggers snapshot save
  try {
    currentSettlement = await api('/settlement/' + loan.id);
    const srcEl = document.getElementById('rec-source');
    if (currentSettlement.source === 'AI') {
      srcEl.textContent = '✦ Generated by Gemini AI';
      srcEl.className   = 'rec-source ai-source';
    } else {
      srcEl.textContent = 'Generated by: Formula Engine';
      srcEl.className   = 'rec-source';
    }
  } catch (err) {
    currentSettlement = null;
  }
  recompute();
}

function recompute(){
  const loan = window._settlementLoan;
  if (!loan) return;
  const income = parseFloat(document.getElementById('sl-income').value);
  const emi    = parseFloat(document.getElementById('sl-emi').value);
  const overdue= parseInt(document.getElementById('sl-overdue').value);

  document.getElementById('lbl-income').textContent  = inr(income);
  document.getElementById('lbl-emi').textContent     = inr(emi);
  document.getElementById('lbl-overdue').textContent = overdue + ' days';

  const m = computeMetrics(income, emi, overdue, loan.amount);

  document.getElementById('brk-dti').textContent = pct(m.dti);
  const dtiSt = statusFor('dti',m.dti);
  document.getElementById('brk-dti-badge').className   = 'badge '+dtiSt.cls;
  document.getElementById('brk-dti-badge').textContent = dtiSt.label;

  document.getElementById('brk-surplus').textContent = inr(m.surplus);
  const surSt = statusFor('surplus',m.surplus);
  document.getElementById('brk-surplus-badge').className   = 'badge '+surSt.cls;
  document.getElementById('brk-surplus-badge').textContent = surSt.label;

  document.getElementById('brk-stress').textContent = Math.round(m.stress)+' / 100';
  const strSt = statusFor('stress',m.stress);
  document.getElementById('brk-stress-badge').className   = 'badge '+strSt.cls;
  document.getElementById('brk-stress-badge').textContent = strSt.label;

  document.getElementById('brk-overdue').textContent = overdue+' days';
  const ovSt = statusFor('overdue',overdue);
  document.getElementById('brk-overdue-badge').className   = 'badge '+ovSt.cls;
  document.getElementById('brk-overdue-badge').textContent = ovSt.label;

  document.getElementById('rec-pct').textContent         = Math.round(m.settlePct)+'%';
  document.getElementById('rec-amt').textContent         = 'of '+inr(loan.amount)+' outstanding (≈ '+inr(loan.amount*m.settlePct/100)+')';
  document.getElementById('rec-outstanding').textContent = inr(loan.amount);
  document.getElementById('rec-emi').textContent         = inr(emi);
  document.getElementById('rec-income').textContent      = inr(income);

  window._currentMetrics = m;
}

/* ================================================================
   Letters  →  POST /letters  GET /letters
================================================================ */
async function generateLetterFromSettlement(){
  const loan = window._settlementLoan;
  if (!loan) { toast('No loan selected. Go to Loans and click Review.', 'warning'); return; }
  const m = window._currentMetrics || computeMetrics(loan.income,loan.emi,loan.overdue_days,loan.amount);
  const btn = document.getElementById('genLetterBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating…';
  try {
    const letter = await api('/letters', { method:'POST', body:JSON.stringify({loan_id:loan.id, settlement_pct:m.settlePct}) });
    currentLetter   = letter.body;
    currentLetterId = letter.id;
    toast('Letter generated' + (letter.source === 'AI' ? ' by Gemini AI' : '') + '!', 'success');
    navigate('letters');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate letter';
  }
}

async function regenerateLetter(){
  const loan = window._settlementLoan || loans[0];
  if (!loan) { toast('Review a loan first to generate a letter.', 'warning'); return; }
  const m = window._currentMetrics || computeMetrics(loan.income,loan.emi,loan.overdue_days,loan.amount);
  const jitter = Math.max(20,Math.min(70,m.settlePct+(Math.random()*4-2)));
  const btn     = document.getElementById('regenBtn');
  const headBtn = document.getElementById('regenHeadBtn');
  if(btn){ btn.disabled=true; btn.innerHTML='<span class="spinner dark"></span> Regenerating…'; }
  if(headBtn){ headBtn.disabled=true; }
  try {
    const letter = await api('/letters', { method:'POST', body:JSON.stringify({loan_id:loan.id, settlement_pct:jitter}) });
    currentLetter   = letter.body;
    currentLetterId = letter.id;
    await renderLettersPage();
    toast('Letter regenerated.', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    if(btn){ btn.disabled=false; btn.textContent='↻ Regenerate'; }
    if(headBtn){ headBtn.disabled=false; headBtn.textContent='Regenerate'; }
  }
}

function copyLetter(){
  navigator.clipboard.writeText(currentLetter).catch(()=>{});
  const btn = document.getElementById('copyBtn');
  btn.textContent = '✓ Copied';
  setTimeout(()=>{ btn.textContent='Copy'; }, 1400);
  toast('Letter copied to clipboard.', 'success');
}

function loadLetterFromHistory(letter){
  currentLetter   = letter.body;
  currentLetterId = letter.id;
  document.getElementById('letterBody').textContent = currentLetter;
  document.querySelectorAll('.history-item').forEach(el => {
    el.classList.toggle('active-letter', el.dataset.letterId === String(letter.id));
  });
}

async function renderLettersPage(){
  const letters = await api('/letters');
  letterHistoryData = letters;

  if (!currentLetter && letters.length > 0) {
    currentLetter   = letters[0].body;
    currentLetterId = letters[0].id;
  }
  document.getElementById('letterBody').textContent = currentLetter || 'No letter generated yet — review a loan\'s settlement and click "Generate letter."';

  const list = document.getElementById('letterHistoryList');
  if(letters.length === 0){
    list.innerHTML = '<div class="empty-state">No letters generated yet.</div>';
  } else {
    list.innerHTML = letters.map(l => `
      <div class="history-item${currentLetterId === l.id ? ' active-letter' : ''}"
           data-letter-id="${l.id}" data-action="loadLetter" data-arg="${l.id}">
        <div>
          <div class="hl-lender">${l.lender}</div>
          <div class="hl-meta">${fmtDate(l.created_at)} · ${Math.round(l.settlement_pct)}% settlement</div>
        </div>
        <span class="badge ${l.source === 'AI' ? 'ai' : 'tight'}">${l.source}</span>
      </div>
    `).join('');
  }
}

/* ================================================================
   Event wiring
================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const authFormEl = document.querySelector('[data-form="auth"]');
  if (authFormEl) authFormEl.addEventListener('submit', handleAuth);

  const addLoanFormEl = document.querySelector('[data-form="addLoan"]');
  if (addLoanFormEl) addLoanFormEl.addEventListener('submit', addLoan);

  document.querySelectorAll('[data-recompute]').forEach(el => {
    el.addEventListener('input', recompute);
  });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const arg    = el.dataset.arg;

    switch (action) {
      case 'navigate':               navigate(arg); break;
      case 'logout':                 logout(); break;
      case 'toggleAuthMode':         toggleAuthMode(); break;
      case 'toggleAddLoanForm':      toggleAddLoanForm(); break;
      case 'generateLetterFromSettlement': generateLetterFromSettlement(); break;
      case 'regenerateLetter':       regenerateLetter(); break;
      case 'copyLetter':             copyLetter(); break;
      case 'selectLoan':             selectLoan(parseInt(arg)); break;
      case 'goToSettlement':
        if (loans[0]) { activeLoanId = loans[0].id; navigate('settlement'); }
        else navigate('loans');
        break;
      case 'loadLetter': {
        const letter = letterHistoryData.find(l => l.id === parseInt(arg));
        if (letter) loadLetterFromHistory(letter);
        break;
      }
    }
  });
});
