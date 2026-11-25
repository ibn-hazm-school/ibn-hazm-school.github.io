// صفحتا الدخول: index.html (الطلاب والزوار) و staff.html (المعلمون والإدارة)
(function () {
'use strict';
const { $, $$, esc } = UI;
function pick(r) {
  $$('.role').forEach(b => b.classList.toggle('on', b.dataset.role === r));
  $$('.form-panel').forEach(f => f.classList.toggle('on', f.id === 'f-' + r));
  const i = $('#f-' + r + ' input'); if (i) setTimeout(() => i.focus(), 30);
  try { sessionStorage.setItem('gate.role', r); } catch (_) {}
}
$$('.role').forEach(b => b.onclick = () => pick(b.dataset.role));
$$('[data-go]').forEach(b => b.onclick = () => pick(b.dataset.go));
// عربي / English
const termText = (t, l) => l === 'en' ? t : 'لل' + Catalog.TERM_AR[t].replace(/^ال/, '');
function setLang(l) {
  document.documentElement.lang = l; document.documentElement.dir = l === 'en' ? 'ltr' : 'rtl';
  $$('.lang button').forEach(b => b.classList.toggle('on', b.dataset.lang === l));
  $$('[data-en]').forEach(el => { if (el.dataset.ar == null) el.dataset.ar = el.textContent; el.textContent = l === 'en' ? el.dataset.en : el.dataset.ar; });
  $$('[data-en-ph]').forEach(el => { if (el.dataset.arPh == null) el.dataset.arPh = el.placeholder; el.placeholder = l === 'en' ? el.dataset.enPh : el.dataset.arPh; });
  const tb = $('#termBadge'); if (tb && tb.dataset.term) tb.textContent = termText(tb.dataset.term, l);
  try { localStorage.setItem('ihz.lang', l); } catch (_) {}
}
$$('.lang button').forEach(b => b.onclick = () => setLang(b.dataset.lang));
try { if (localStorage.getItem('ihz.lang') === 'en') setLang('en'); } catch (_) {}
try { const r = location.hash === '#staff' ? 'teacher' : sessionStorage.getItem('gate.role'); if (r && $('#f-' + r)) pick(r); } catch (_) {}
const show = (form, text, kind = 'err') => { $('.msg', form).innerHTML = text ? `<div class="notice ${kind}">${esc(text)}</div>` : ''; };
const go = r => location.href = { student: 'student.html', guest: 'student.html', teacher: 'teacher.html', admin: 'admin.html' }[r];

// من سجّل الدخول سابقًا يذهب مباشرة إلى صفحته
const s = API.session();
if (s && s.role) go(s.role);

API.settings().then(st => {
  const tb = $('#termBadge'); tb.dataset.term = st.term; tb.textContent = termText(st.term, document.documentElement.lang);
  if (!st.guest) { $$('[data-go=guest]').forEach(x => x.classList.add('hidden')); if ($('#f-guest').classList.contains('on')) pick('student'); }
}).catch(() => {});
if (API.mode === 'local') $('#modeNote').innerHTML = '<span class="pill gold">وضع التجربة — البيانات محفوظة على هذا الجهاز فقط</span>';

async function run(form, role, payload) {
  const btn = $('button', form); btn.disabled = true; show(form, '');
  try { await API.login(role, payload); go(role); }
  catch (e) { show(form, e.message); btn.disabled = false; }
}
const fs = $('#f-student');
if (fs) fs.onsubmit = e => { e.preventDefault(); const id = $('#sid').value.trim(); if (!id) return show(fs, 'أدخل رقم الطالب.'); run(fs, 'student', { id }); };
const fg = $('#f-guest');
if (fg) {
  $('#ggrade').innerHTML = '<option value="">اختر الصف</option>' + APP_CONFIG.grades.map(g => `<option value="${g}">الصف ${g}</option>`).join('');
  const fillTracks = () => { const g = Number($('#ggrade').value); $('#gtrack').innerHTML = (g ? Catalog.tracksFor(g) : ['General']).map(t => `<option value="${t}">${Catalog.TRACK_AR[t]}</option>`).join(''); };
  $('#ggrade').onchange = fillTracks; fillTracks();
  try { const p = JSON.parse(localStorage.getItem('ihz.guest') || '{}'); if (p.name) { $('#gname').value = p.name; $('#ggrade').value = p.grade; fillTracks(); $('#gtrack').value = p.track; } } catch (_) {}
  fg.onsubmit = e => { e.preventDefault(); const p = { name: $('#gname').value.trim(), grade: Number($('#ggrade').value), track: $('#gtrack').value };
    if (p.name.length < 2) return show(fg, 'اكتب اسمك.'); if (!p.grade) return show(fg, 'اختر صفك.');
    localStorage.setItem('ihz.guest', JSON.stringify(p)); run(fg, 'guest', p); };
}
const ft = $('#f-teacher');
if (ft) {
  $('#tname').value = localStorage.getItem('ihz.tname') || '';
  ft.onsubmit = e => { e.preventDefault(); const name = $('#tname').value.trim(), pin = $('#tpin').value.trim();
    if (name.length < 2) return show(ft, 'اكتب اسمك الكامل.'); if (!pin) return show(ft, 'أدخل الرمز المكوّن من 4 أرقام.');
    localStorage.setItem('ihz.tname', name); run(ft, 'teacher', { name, pin }); };
}
const fa = $('#f-admin');
if (fa) fa.onsubmit = e => { e.preventDefault(); const pin = $('#apin').value.trim(); if (!pin) return show(fa, 'أدخل الرمز المكوّن من 4 أرقام.'); run(fa, 'admin', { pin }); };
})();
