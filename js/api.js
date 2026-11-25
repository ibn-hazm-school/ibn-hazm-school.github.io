// ============================================================================
//  طبقة البيانات — كل الصفحات تتعامل مع window.API فقط.
//   • local    : تنفيذ كامل داخل المتصفح (IndexedDB) — للتجربة على جهاز واحد.
//   • supabase : استدعاء دوال api_* في قاعدة Supabase (database/supabase.sql) بنفس الشكل.
// ============================================================================
(function () {
'use strict';
const CFG = window.APP_CONFIG;
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const SKEY = 'ihz.session';

const ERR_AR = {
  bad_pin: 'الرمز غير صحيح، حاول مرة أخرى.',
  unknown_student: 'رقم الطالب غير موجود في سجل المدرسة. تحقق من الرقم وحاول مجددًا.',
  guest_disabled: 'التدريب للزوار متوقف حاليًا.',
  bad_guest: 'اكتب اسمك (من 2 إلى 40 حرفًا) واختر صفك ومسارك.',
  name_required: 'اكتب اسمك الكامل.',
  no_session: 'انتهت الجلسة، الرجاء تسجيل الدخول من جديد.',
  forbidden: 'لا تملك صلاحية لهذا الإجراء.',
  not_found: 'العنصر غير موجود أو حُذف.',
  invalid_exam: 'الامتحان ينقصه عنوان أو مادة أو صف أو أسئلة.',
  bad_pin_format: 'الرمز يجب أن يتكون من 4 أرقام.',
  locked: 'محاولات كثيرة، انتظر دقيقة ثم حاول مجددًا.',
  network: 'تعذر الاتصال بقاعدة البيانات. تحقق من الإنترنت.',
};
class ApiError extends Error { constructor(code) { super(ERR_AR[code] || code); this.code = code; } }

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const nowIso = () => new Date().toISOString();
const normId = v => String(v ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\s+/g, '').toUpperCase().replace(/^(\d+)\.0+$/, '$1');
const normDigits = v => String(v ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();
const totalMarks = e => (e.questions || []).reduce((s, q) => s + (Number(q.marks) || 0), 0);
const r1 = n => Math.round(n * 10) / 10;

// ------------------------------------------------------------------ shared helpers
function stripAnswers(e) {
  return { ...e, total: totalMarks(e), questions: (e.questions || []).map(q => { const { correct, solution, ...rest } = q; return rest; }) };
}
function gradeAttempt(exam, answers) {
  let score = 0; const total = totalMarks(exam);
  const review = exam.questions.map(q => {
    const picked = answers[q.id] || null, ok = picked === q.correct, m = Number(q.marks) || 0;
    if (ok) score += m;
    return { qid: q.id, picked, correct: q.correct, marks: m, gained: ok ? m : 0 };
  });
  const pct = total ? r1(score / total * 100) : 0;
  return { score, total, pct, passed: pct >= (Number(exam.passPct) || 50), review };
}
function examVisibleTo(e, s, term) {
  if (!e.published || e.term !== term) return false;
  if (Number(e.grade) !== Number(s.grade) || e.track !== s.track) return false;
  if (s.role === 'student' && e.sections && e.sections.length && !e.sections.includes(s.section)) return false;
  return true;
}
function validExam(e) {
  return e && String(e.title || '').trim() && e.subject && e.grade && e.track && Array.isArray(e.questions) && e.questions.length &&
    e.questions.every(q => Array.isArray(q.options) && q.options.length >= 2 && LETTERS.slice(0, q.options.length).includes(q.correct));
}
async function sha(s) {
  try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  catch (_) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return 'x' + h; }
}

// ------------------------------------------------------------------ session (both modes)
const Session = {
  get() { try { return JSON.parse(sessionStorage.getItem(SKEY) || localStorage.getItem(SKEY) || 'null'); } catch (_) { return null; } },
  set(s) { const j = JSON.stringify(s); try { sessionStorage.setItem(SKEY, j); if (s && s.role !== 'admin' && s.role !== 'teacher') localStorage.setItem(SKEY, j); else localStorage.removeItem(SKEY); } catch (_) {} },
  clear() { try { sessionStorage.removeItem(SKEY); localStorage.removeItem(SKEY); } catch (_) {} },
};
function need(...roles) { const s = Session.get(); if (!s) throw new ApiError('no_session'); if (roles.length && !roles.includes(s.role)) throw new ApiError('forbidden'); return s; }

// ================================================================== LOCAL (IndexedDB)
function localApi() {
  const DBN = 'ihz-platform', ST = 'kv';
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const idbGet = async k => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(ST).objectStore(ST).get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); };
  let mem = {};   // احتياطي إن لم يتوفر IndexedDB (مثل بعض نوافذ المعاينة)
  const lsGet = k => { try { const v = localStorage.getItem('ihz.kv.' + k); return v ? JSON.parse(v) : mem[k]; } catch (_) { return mem[k]; } };
  const lsSet = (k, v) => { mem[k] = v; try { localStorage.setItem('ihz.kv.' + k, JSON.stringify(v)); } catch (_) {} };
  const idbSet0 = async (k, v) => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(ST, 'readwrite'); t.objectStore(ST).put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); };
  let useIdb = true;
  const idbSet = async (k, v) => { if (useIdb) { try { return await idbSet0(k, v); } catch (_) { useIdb = false; } } lsSet(k, v); };
  let cache = null;
  async function db() {
    if (cache) return cache;
    let d = null; try { d = await idbGet('db'); } catch (_) { useIdb = false; d = lsGet('db'); }
    if (!d) {
      d = {
        settings: { term: 'Term 1', guest: true, teacherPin: await sha('ihz:1234'), adminPin: await sha('ihz:0000') },
        // سجل تجريبي — تستبدله الإدارة بملف الطلاب الحقيقي من «سجل الطلاب»
        students: [
          { id: '1001', grade: 10, track: 'Advanced', section: '10-1' }, { id: '1002', grade: 10, track: 'Advanced', section: '10-2' },
          { id: '2001', grade: 9, track: 'Advanced', section: '9-1' }, { id: '2002', grade: 9, track: 'Advanced', section: '9-2' },
          { id: '3001', grade: 7, track: 'General', section: '7-1' },
        ],
        exams: JSON.parse(JSON.stringify(window.SEED_EXAMS || [])),
        attempts: [], visits: [],
      };
      await idbSet('db', d);
    }
    cache = d; return d;
  }
  const save = () => idbSet('db', cache);

  const api = {
    mode: 'local',
    async settings() { const d = await db(); return { term: d.settings.term, guest: d.settings.guest }; },
    async login(role, p = {}) {
      const d = await db(); let s;
      if (role === 'student') {
        const id = normId(p.id); const st = d.students.find(x => normId(x.id) === id);
        if (!st) throw new ApiError('unknown_student');
        s = { role, id: st.id, grade: Number(st.grade), track: st.track, section: st.section };
      } else if (role === 'guest') {
        if (!d.settings.guest) throw new ApiError('guest_disabled');
        const name = String(p.name || '').trim().replace(/\s+/g, ' ');
        if (name.length < 2 || name.length > 40 || !p.grade || !p.track) throw new ApiError('bad_guest');
        s = { role, name, grade: Number(p.grade), track: p.track };
        d.visits.push({ name, grade: s.grade, track: s.track, at: nowIso() }); await save();
      } else if (role === 'teacher' || role === 'admin') {
        const pin = normDigits(p.pin);
        if ((await sha('ihz:' + pin)) !== d.settings[role === 'admin' ? 'adminPin' : 'teacherPin']) throw new ApiError('bad_pin');
        const name = String(p.name || '').trim();
        if (role === 'teacher' && name.length < 2) throw new ApiError('name_required');
        s = { role, name: role === 'admin' ? 'الإدارة' : name };
      } else throw new ApiError('forbidden');
      s.token = uuid(); Session.set(s); return s;
    },
    async myExams() {
      const s = need('student', 'guest'), d = await db();
      const mine = d.attempts.filter(a => s.role === 'student' ? a.student_id === s.id : (a.kind === 'guest' && a.guest_name === s.name && a.grade === s.grade && a.track === s.track));
      return d.exams.filter(e => examVisibleTo(e, s, d.settings.term)).map(e => {
        const at = mine.filter(a => a.exam_id === e.id);
        const x = stripAnswers(e); delete x.questions;
        return { ...x, qcount: e.questions.length, attempts: at.length, best: at.length ? Math.max(...at.map(a => a.pct)) : null };
      });
    },
    async exam(id) {
      const s = need(), d = await db(); const e = d.exams.find(x => x.id === id);
      if (!e) throw new ApiError('not_found');
      if (s.role === 'teacher' || s.role === 'admin') return JSON.parse(JSON.stringify(e));
      if (!examVisibleTo(e, s, d.settings.term)) throw new ApiError('not_found');
      return stripAnswers(e);
    },
    async submit(examId, answers, timeSpent) {
      const s = need('student', 'guest'), d = await db(); const e = d.exams.find(x => x.id === examId);
      if (!e || !examVisibleTo(e, s, d.settings.term)) throw new ApiError('not_found');
      const g = gradeAttempt(e, answers || {});
      const prev = d.attempts.filter(a => a.exam_id === examId && (s.role === 'student' ? a.student_id === s.id : a.guest_name === s.name && a.grade === s.grade && a.track === s.track)).length;
      const a = { id: uuid(), exam_id: e.id, exam_title: e.title, subject: e.subject, term: e.term, kind: s.role, student_id: s.role === 'student' ? s.id : null,
        guest_name: s.role === 'guest' ? s.name : null, grade: s.grade, track: s.track, section: s.section || null, answers: answers || {},
        score: g.score, total: g.total, pct: g.pct, passed: g.passed, time_spent: Math.round(timeSpent || 0), attempt_no: prev + 1, submitted_at: nowIso() };
      d.attempts.push(a); await save();
      return { ...a, review: g.review, exam: JSON.parse(JSON.stringify(e)) };
    },
    async myAttempts() {
      const s = need('student', 'guest'), d = await db();
      return d.attempts.filter(a => s.role === 'student' ? a.student_id === s.id : (a.kind === 'guest' && a.guest_name === s.name && a.grade === s.grade && a.track === s.track) && a.term === d.settings.term)
        .filter(a => a.term === d.settings.term).map(({ answers, ...a }) => a).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
    },
    async attempt(id) {
      const s = need(), d = await db(); const a = d.attempts.find(x => x.id === id); if (!a) throw new ApiError('not_found');
      const own = s.role === 'student' ? a.student_id === s.id : s.role === 'guest' ? a.guest_name === s.name : true;
      if (!own) throw new ApiError('forbidden');
      const e = d.exams.find(x => x.id === a.exam_id); if (!e) throw new ApiError('not_found');
      return { ...a, review: gradeAttempt(e, a.answers).review, exam: JSON.parse(JSON.stringify(e)) };
    },
    // ---------------- staff
    async exams() {
      need('teacher', 'admin'); const d = await db();
      return d.exams.map(e => { const at = d.attempts.filter(a => a.exam_id === e.id && a.kind === 'student'); return { ...e, questions: undefined, qcount: e.questions.length, total: totalMarks(e), attempts: at.length, students: new Set(at.map(a => a.student_id)).size }; });
    },
    async saveExam(e) {
      const s = need('teacher', 'admin'), d = await db();
      if (!validExam(e)) throw new ApiError('invalid_exam');
      const i = d.exams.findIndex(x => x.id === e.id);
      const rec = { ...JSON.parse(JSON.stringify(e)), updated_at: nowIso() };
      if (i >= 0) { d.exams[i] = { ...d.exams[i], ...rec }; } else { rec.id = uuid(); rec.created_at = nowIso(); rec.teacher = rec.teacher || s.name; d.exams.push(rec); }
      await save(); return i >= 0 ? e.id : rec.id;
    },
    async setPublished(id, on) { need('teacher', 'admin'); const d = await db(); const e = d.exams.find(x => x.id === id); if (!e) throw new ApiError('not_found'); e.published = !!on; await save(); },
    async deleteExam(id) { need('teacher', 'admin'); const d = await db(); d.exams = d.exams.filter(x => x.id !== id); await save(); },
    async results(term) {
      need('teacher', 'admin'); const d = await db();
      return d.attempts.filter(a => a.kind === 'student' && (!term || a.term === term)).map(({ answers, ...a }) => a);
    },
    async itemStats(examId) {
      need('teacher', 'admin'); const d = await db(); const e = d.exams.find(x => x.id === examId); if (!e) throw new ApiError('not_found');
      const at = d.attempts.filter(a => a.exam_id === examId && a.kind === 'student');
      return e.questions.map(q => { const c = {}; let ok = 0; at.forEach(a => { const p = a.answers[q.id] || '-'; c[p] = (c[p] || 0) + 1; if (p === q.correct) ok++; }); return { qid: q.id, n: at.length, correct: ok, counts: c }; });
    },
    // ---------------- admin
    async setTerm(term) { need('admin'); const d = await db(); d.settings.term = term; await save(); },
    async setGuest(on) { need('admin'); const d = await db(); d.settings.guest = !!on; await save(); },
    async roster() { need('teacher', 'admin'); const d = await db(); return d.students.slice(); },
    async replaceRoster(rows) {
      need('admin'); const d = await db(); const old = new Set(d.students.map(x => normId(x.id)));
      const clean = []; const seen = new Set();
      rows.forEach(r => { const id = normId(r.id); if (!id || seen.has(id)) return; seen.add(id); clean.push({ id, grade: Number(r.grade), track: r.track, section: String(r.section || '').trim() }); });
      d.students = clean; await save();
      return { n: clean.length, added: clean.filter(x => !old.has(x.id)).length, removed: [...old].filter(x => !seen.has(x)).length };
    },
    async changePin(kind, pin) {
      need('admin'); if (!/^\d{4}$/.test(normDigits(pin))) throw new ApiError('bad_pin_format');
      const d = await db(); d.settings[kind === 'admin' ? 'adminPin' : 'teacherPin'] = await sha('ihz:' + normDigits(pin)); await save();
    },
    async visitorStats() {
      need('admin'); const d = await db(); const now = Date.now();
      const v = d.visits, g = d.attempts.filter(a => a.kind === 'guest');
      return { names: new Set(v.map(x => x.name + '|' + x.grade + x.track)).size, signins: v.length, today: v.filter(x => now - Date.parse(x.at) < 864e5).length,
        week: v.filter(x => now - Date.parse(x.at) < 7 * 864e5).length, practice: g.length };
    },
    async resetAll() { need('admin'); cache = null; await idbSet('db', null); },
  };
  return api;
}

// ================================================================== SUPABASE (RPC)
function supabaseApi() {
  async function rpc(fn, args = {}) {
    let res;
    try {
      res = await fetch(`${CFG.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseKey, Authorization: 'Bearer ' + CFG.supabaseKey }, body: JSON.stringify(args) });
    } catch (_) { throw new ApiError('network'); }
    const txt = await res.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (_) {}
    if (!res.ok) { const m = (j && (j.message || j.hint)) || ''; const code = (m.match(/^([a-z_]+)/) || [])[1]; if (code === 'no_session') Session.clear(); throw new ApiError(code && ERR_AR[code] ? code : 'network'); }
    return j;
  }
  const tok = () => (Session.get() || {}).token || '';
  return {
    mode: 'supabase',
    settings: () => rpc('api_settings'),
    async login(role, p = {}) { const s = await rpc('api_login', { p_role: role, p: { ...p, id: p.id != null ? normId(p.id) : undefined, pin: p.pin != null ? normDigits(p.pin) : undefined } }); Session.set(s); return s; },
    myExams: () => rpc('api_my_exams', { p_token: tok() }),
    exam: id => rpc('api_exam', { p_token: tok(), p_id: id }),
    submit: (id, answers, t) => rpc('api_submit', { p_token: tok(), p_id: id, p_answers: answers || {}, p_time: Math.round(t || 0) }),
    myAttempts: () => rpc('api_my_attempts', { p_token: tok() }),
    attempt: id => rpc('api_attempt', { p_token: tok(), p_id: id }),
    exams: () => rpc('api_exams', { p_token: tok() }),
    async saveExam(e) { if (!validExam(e)) throw new ApiError('invalid_exam'); return rpc('api_save_exam', { p_token: tok(), p_exam: e }); },
    setPublished: (id, on) => rpc('api_set_published', { p_token: tok(), p_id: id, p_on: !!on }),
    deleteExam: id => rpc('api_delete_exam', { p_token: tok(), p_id: id }),
    results: term => rpc('api_results', { p_token: tok(), p_term: term || null }),
    itemStats: id => rpc('api_item_stats', { p_token: tok(), p_id: id }),
    setTerm: t => rpc('api_set_term', { p_token: tok(), p_term: t }),
    setGuest: on => rpc('api_set_guest', { p_token: tok(), p_on: !!on }),
    roster: () => rpc('api_roster', { p_token: tok() }),
    replaceRoster: rows => rpc('api_replace_roster', { p_token: tok(), p_rows: rows.map(r => ({ ...r, id: normId(r.id) })) }),
    changePin: (kind, pin) => rpc('api_change_pin', { p_token: tok(), p_kind: kind, p_pin: normDigits(pin) }),
    visitorStats: () => rpc('api_visitor_stats', { p_token: tok() }),
  };
}

const impl = CFG.mode === 'supabase' ? supabaseApi() : localApi();
window.API = Object.assign(impl, {
  session: () => Session.get(),
  logout() { const s = Session.get(); Session.clear(); if (impl.mode === 'supabase' && s) fetch(`${CFG.supabaseUrl}/rest/v1/rpc/api_logout`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseKey, Authorization: 'Bearer ' + CFG.supabaseKey }, body: JSON.stringify({ p_token: s.token }) }).catch(() => {}); },
  LETTERS, ApiError, normId, totalMarks, gradeAttempt, stripAnswers,
});
})();
