// لوحات مشتركة بين المعلم والإدارة: إدارة الامتحانات، النتائج، تحليل الأسئلة.
(function () {
'use strict';
const { $, $$, esc } = UI;
const cls = (g, t) => Catalog.classLabel(g, t);

// ------------------------------------------------------------------ إدارة الامتحانات
async function examsPanel(root, { me, onEdit, term }) {
  root.innerHTML = `<div class="filters"><select class="in" id="fx-own"><option value="all">كل الامتحانات</option><option value="mine">امتحاناتي فقط</option></select>
    <select class="in" id="fx-g"></select><select class="in" id="fx-s"></select><select class="in" id="fx-t"></select><input class="in" id="fx-q" placeholder="بحث بالعنوان…"></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>العنوان</th><th>المادة</th><th>الصف</th><th>الشعب</th><th>الفصل</th><th class="num">أسئلة</th><th class="num">طلاب تدرّبوا</th><th>الحالة</th><th>إعداد</th><th></th></tr></thead><tbody></tbody></table></div>`;
  const tb = $('tbody', root);
  $('#fx-g', root).innerHTML = '<option value="">كل الصفوف</option>' + APP_CONFIG.grades.map(g => `<option>${g}</option>`).join('');
  $('#fx-s', root).innerHTML = '<option value="">كل المواد</option>' + Object.keys(Catalog.SUBJECTS).map(s => `<option value="${s}">${Catalog.subjAr(s)}</option>`).join('');
  $('#fx-t', root).innerHTML = '<option value="">كل الفصول</option>' + Catalog.TERMS.map(t => `<option value="${t}"${t === term ? ' selected' : ''}>${Catalog.TERM_AR[t]}</option>`).join('');
  if (me) $('#fx-own', root).value = 'mine'; else $('#fx-own', root).classList.add('hidden');
  let list = [];
  async function load() { try { list = await API.exams(); } catch (e) { UI.toast(e.message, 'err'); } draw(); }
  function draw() {
    const own = $('#fx-own', root).value, g = $('#fx-g', root).value, s = $('#fx-s', root).value, t = $('#fx-t', root).value, q = $('#fx-q', root).value.trim();
    const rows = list.filter(e => (own !== 'mine' || e.teacher === me) && (!g || e.grade == g) && (!s || e.subject === s) && (!t || e.term === t) && (!q || e.title.includes(q)))
      .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));
    tb.innerHTML = rows.length ? rows.map(e => `<tr data-id="${e.id}"><td><b>${esc(e.title)}</b></td><td>${Catalog.subjAr(e.subject)}</td><td class="nowrap">${cls(e.grade, e.track)}</td><td>${e.sections && e.sections.length ? esc(e.sections.join('، ')) : 'كل الشعب'}</td>
      <td class="nowrap">${Catalog.TERM_AR[e.term] || e.term}</td><td class="num">${e.qcount}</td><td class="num">${e.students}</td><td>${e.published ? '<span class="pill ok">منشور</span>' : '<span class="pill grey">مخفي</span>'}</td><td class="small">${esc(e.teacher || '')}</td>
      <td class="nowrap"><a class="btn sm sec" href="exam.html?id=${encodeURIComponent(e.id)}&preview=1" title="جرّب الامتحان كما يراه الطالب">${UI.ICONS.eye}</a>
        <button class="btn sm sec" data-a="pub">${e.published ? 'إخفاء' : 'نشر'}</button>${onEdit ? '<button class="btn sm sec" data-a="edit">تعديل</button>' : ''}<button class="btn sm sec" data-a="stats">تحليل</button><button class="btn sm danger" data-a="del">حذف</button></td></tr>`).join('')
      : '<tr><td colspan="10" class="muted" style="text-align:center;padding:18px">لا توجد امتحانات مطابقة.</td></tr>';
  }
  $$('select,input', root).forEach(x => x.oninput = draw);
  tb.onclick = async e => {
    const b = e.target.closest('button[data-a]'); if (!b) return; const id = b.closest('tr').dataset.id, ex = list.find(x => x.id === id);
    try {
      if (b.dataset.a === 'pub') { await API.setPublished(id, !ex.published); UI.toast(ex.published ? 'تم إخفاء الامتحان عن الطلاب.' : 'تم نشر الامتحان للطلاب.'); load(); }
      if (b.dataset.a === 'edit') onEdit(await API.exam(id));
      if (b.dataset.a === 'del' && await UI.confirmBox(`حذف «${esc(ex.title)}» نهائيًا؟ ستبقى محاولات الطلاب السابقة في التقارير.`, 'حذف', 'danger')) { await API.deleteExam(id); UI.toast('تم حذف الامتحان.'); load(); }
      if (b.dataset.a === 'stats') itemStats(id);
    } catch (err) { UI.toast(err.message, 'err'); }
  };
  await load();
  return { reload: load };
}

// ------------------------------------------------------------------ تحليل الأسئلة
async function itemStats(id) {
  const [ex, st] = await Promise.all([API.exam(id), API.itemStats(id)]);
  const L = API.LETTERS;
  const body = `<p class="muted" style="margin-top:0">نسبة الإجابة الصحيحة لكل سؤال، وتوزيع اختيارات الطلاب (المحاولات كلها). الأسئلة ذات النسبة المنخفضة تحتاج إلى إعادة شرح.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="num">السؤال</th><th class="num">الصحيحة</th><th class="num">% صحيح</th>${L.slice(0, 4).map(l => `<th class="num">${l}</th>`).join('')}<th class="num">بدون</th></tr></thead><tbody>
    ${st.map((s, i) => { const q = ex.questions[i]; const p = s.n ? Math.round(s.correct / s.n * 100) : 0; return `<tr><td class="num"><b>${i + 1}</b></td><td class="num">${q.correct}</td><td class="num"><span class="pill ${!s.n ? 'grey' : p >= 70 ? 'ok' : p >= 40 ? 'gold' : 'bad'}">${s.n ? p + '%' : '—'}</span></td>${L.slice(0, 4).map(l => `<td class="num"${l === q.correct ? ' style="font-weight:800;color:var(--ok)"' : ''}>${s.counts[l] || 0}</td>`).join('')}<td class="num">${s.counts['-'] || 0}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  UI.modal({ title: 'تحليل الأسئلة · ' + esc(ex.title), body, wide: true, foot: [{ text: 'تصدير Excel', cls: 'sec', onClick: () => UI.saveXlsx([{ name: 'تحليل الأسئلة', rows: [['السؤال', 'الإجابة الصحيحة', 'عدد المحاولات', 'إجابات صحيحة', '% صحيح', 'A', 'B', 'C', 'D', 'بدون إجابة'], ...st.map((s, i) => [i + 1, ex.questions[i].correct, s.n, s.correct, s.n ? Math.round(s.correct / s.n * 100) : 0, s.counts.A || 0, s.counts.B || 0, s.counts.C || 0, s.counts.D || 0, s.counts['-'] || 0])] }], `IbnHazm_Item_Analysis.xlsx`) }, { text: 'إغلاق' }] });
}

// ------------------------------------------------------------------ النتائج
async function resultsPanel(root, { term }) {
  root.innerHTML = `<div class="filters"><select class="in" id="fr-term"></select><select class="in" id="fr-g"></select><select class="in" id="fr-sec"></select><select class="in" id="fr-s"></select><select class="in" id="fr-e"></select>
    <select class="in" id="fr-mode"><option value="best">أفضل درجة لكل طالب</option><option value="all">كل المحاولات</option></select><input class="in ltr" id="fr-id" placeholder="رقم الطالب…" style="max-width:170px">
    <button class="btn sec" id="fr-x">${UI.ICONS.dl}تصدير Excel</button></div>
    <div class="kpis" id="fr-k"></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>رقم الطالب</th><th>الصف</th><th>الشعبة</th><th>المادة</th><th>الامتحان</th><th class="num">المحاولات</th><th class="num">الدرجة</th><th class="num">النسبة</th><th>النتيجة</th><th class="num">الوقت</th><th>آخر تسليم</th></tr></thead><tbody></tbody></table></div>`;
  const tb = $('tbody', root);
  $('#fr-term', root).innerHTML = Catalog.TERMS.map(t => `<option value="${t}"${t === term ? ' selected' : ''}>${Catalog.TERM_AR[t]}</option>`).join('');
  $('#fr-g', root).innerHTML = '<option value="">كل الصفوف</option>' + APP_CONFIG.grades.flatMap(g => Catalog.tracksFor(g).map(t => `<option value="${g}|${t}">${cls(g, t)}</option>`)).join('');
  $('#fr-s', root).innerHTML = '<option value="">كل المواد</option>' + Object.keys(Catalog.SUBJECTS).map(s => `<option value="${s}">${Catalog.subjAr(s)}</option>`).join('');
  let all = [], view = [];
  async function load() { try { all = await API.results($('#fr-term', root).value); } catch (e) { UI.toast(e.message, 'err'); } fillDyn(); draw(); }
  function fillDyn() {
    const g = $('#fr-g', root).value; const keep = [$('#fr-sec', root).value, $('#fr-e', root).value];
    const secs = [...new Set(all.filter(a => !g || `${a.grade}|${a.track}` === g).map(a => a.section).filter(Boolean))].sort();
    $('#fr-sec', root).innerHTML = '<option value="">كل الشعب</option>' + secs.map(s => `<option>${esc(s)}</option>`).join('');
    const exs = new Map(); all.filter(a => (!g || `${a.grade}|${a.track}` === g) && (!$('#fr-s', root).value || a.subject === $('#fr-s', root).value)).forEach(a => exs.set(a.exam_id, a.exam_title));
    $('#fr-e', root).innerHTML = '<option value="">كل الامتحانات</option>' + [...exs].map(([id, t]) => `<option value="${id}">${esc(t)}</option>`).join('');
    $('#fr-sec', root).value = secs.includes(keep[0]) ? keep[0] : ''; $('#fr-e', root).value = exs.has(keep[1]) ? keep[1] : '';
  }
  function draw() {
    const g = $('#fr-g', root).value, sec = $('#fr-sec', root).value, s = $('#fr-s', root).value, ex = $('#fr-e', root).value, id = API.normId($('#fr-id', root).value), mode = $('#fr-mode', root).value;
    const f = all.filter(a => (!g || `${a.grade}|${a.track}` === g) && (!sec || a.section === sec) && (!s || a.subject === s) && (!ex || a.exam_id === ex) && (!id || API.normId(a.student_id).includes(id)));
    if (mode === 'best') {
      const m = new Map(); f.forEach(a => { const k = a.student_id + '|' + a.exam_id; const c = m.get(k); if (!c) m.set(k, { ...a, n: 1, last: a.submitted_at }); else { c.n++; if (a.submitted_at > c.last) c.last = a.submitted_at; if (a.pct > c.pct) Object.assign(c, { ...a, n: c.n, last: c.last }); } });
      view = [...m.values()];
    } else view = f.map(a => ({ ...a, n: a.attempt_no, last: a.submitted_at }));
    view.sort((a, b) => String(a.section).localeCompare(String(b.section)) || String(a.student_id).localeCompare(String(b.student_id)) || a.exam_title.localeCompare(b.exam_title));
    const stu = new Set(f.map(a => a.student_id)).size, avg = view.length ? Math.round(view.reduce((x, a) => x + a.pct, 0) / view.length) : 0, pass = view.length ? Math.round(view.filter(a => a.passed).length / view.length * 100) : 0;
    $('#fr-k', root).innerHTML = `<div class="kpi"><small>طلاب تدرّبوا</small><b>${stu}</b></div><div class="kpi"><small>المحاولات</small><b>${f.length}</b></div><div class="kpi"><small>متوسط ${mode === 'best' ? 'أفضل الدرجات' : 'الدرجات'}</small><b>${view.length ? avg + '%' : '–'}</b></div><div class="kpi"><small>نسبة النجاح</small><b>${view.length ? pass + '%' : '–'}</b></div>`;
    tb.innerHTML = view.length ? view.slice(0, 1500).map(a => `<tr class="click" data-id="${a.id}"><td class="ltr" style="text-align:right">${esc(a.student_id)}</td><td class="nowrap">${cls(a.grade, a.track)}</td><td>${esc(a.section || '')}</td><td>${Catalog.subjAr(a.subject)}</td><td>${esc(a.exam_title)}</td>
      <td class="num">${mode === 'best' ? a.n : '#' + a.n}</td><td class="num">${a.score} / ${a.total}</td><td class="num"><b>${a.pct}%</b></td><td>${a.passed ? '<span class="pill ok">ناجح</span>' : '<span class="pill bad">غير ناجح</span>'}</td><td class="num">${UI.fmtDur(a.time_spent)}</td><td class="nowrap small">${UI.fmtDate(a.last)}</td></tr>`).join('')
      : '<tr><td colspan="11" class="muted" style="text-align:center;padding:18px">لا توجد نتائج مطابقة بعد.</td></tr>';
  }
  ['#fr-g', '#fr-s'].forEach(x => $(x, root).onchange = () => { fillDyn(); draw(); });
  ['#fr-sec', '#fr-e', '#fr-mode', '#fr-id'].forEach(x => $(x, root).oninput = draw);
  $('#fr-term', root).onchange = load;
  tb.onclick = e => { const r = e.target.closest('tr.click'); if (r) window.open('exam.html?review=' + encodeURIComponent(r.dataset.id), '_blank'); };
  $('#fr-x', root).onclick = () => {
    if (!view.length) return UI.toast('لا توجد نتائج للتصدير.', 'err');
    const mode = $('#fr-mode', root).value;
    UI.saveXlsx([{ name: mode === 'best' ? 'أفضل الدرجات' : 'كل المحاولات', widths: [18, 14, 10, 18, 40, 10, 10, 10, 10, 10, 18],
      rows: [['رقم الطالب', 'الصف', 'الشعبة', 'المادة', 'الامتحان', mode === 'best' ? 'عدد المحاولات' : 'رقم المحاولة', 'الدرجة', 'من', 'النسبة %', 'النتيجة', 'التاريخ'],
        ...view.map(a => [a.student_id, cls(a.grade, a.track), a.section || '', Catalog.subjAr(a.subject), a.exam_title, a.n, a.score, a.total, a.pct, a.passed ? 'ناجح' : 'غير ناجح', UI.fmtDate(a.last)])] }],
      `IbnHazm_Results_${$('#fr-term', root).value.replace(' ', '')}.xlsx`);
  };
  await load();
  return { reload: load, data: () => all };
}

window.Panels = { examsPanel, resultsPanel, itemStats };
})();
