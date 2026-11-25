// واجهة مشتركة: الشريط العلوي، الرسائل، النوافذ، عرض الأسئلة، أدوات Excel.
(function () {
'use strict';
const CFG = window.APP_CONFIG;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const MARK = '<svg viewBox="0 0 40 40"><path d="M20 3l4.6 9.4L35 14l-7.5 7.3L29.2 32 20 27.1 10.8 32l1.7-10.7L5 14l10.4-1.6z" fill="#2F8FCB"/><path d="M20 10.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" fill="#D4A853"/></svg>';
const ICONS = {
  logout: '<svg viewBox="0 0 24 24" style="transform:scaleX(-1)"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4a2 2 0 00-2 2v14a2 2 0 002 2h8v-2H4z"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5zM12 17a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5zm7-18v12.17l-4.59-4.58L6 11l6 6 6-6-1.41-1.41L13 14.17V2z"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5zM12 2l-6 6 1.41 1.41L11 5.83V16h2V5.83l3.59 3.58L18 8z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
};

// ---------- نص بسيط ← HTML (للمعلم): x^2 ، x^{n+1} ، a_1 ، sqrt(5) ، (3/4) كسر ، سطر جديد
function fmt(src) {
  let s = esc(src || '');
  s = s.replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>').replace(/\^(-?[0-9a-zA-Z]+)/g, '<sup>$1</sup>')
    .replace(/_\{([^}]*)\}/g, '<sub>$1</sub>').replace(/_([0-9a-zA-Z]+)/g, '<sub>$1</sub>')
    .replace(/sqrt\(([^()]*)\)/g, '√<span class="ov">$1</span>')
    .replace(/\[(-?[\w.]+)\/(-?[\w.]+)\]/g, '<span class="fr"><span>$1</span><span>$2</span></span>')
    .replace(/\*/g, '×').replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/!=/g, '≠').replace(/\bpi\b/g, 'π').replace(/(\d)\s*deg\b/g, '$1°')
    .replace(/\n/g, '<br>');
  return s;
}
// اتجاه النص: الإنجليزي من اليسار والعربي من اليمين
function dirOf(html) { const t = String(html).replace(/<[^>]+>/g, ''); const ar = (t.match(/[؀-ۿ]/g) || []).length, en = (t.match(/[A-Za-z]/g) || []).length; return ar > en ? 'rtl' : 'ltr'; }
function qDir(q) { return /class="en"/.test(q.stem) ? 'ltr' : dirOf(q.stem); }
function stemHtml(q) {
  if (/class="(en|ar)"/.test(q.stem)) return q.stem;          // أسئلة جاهزة ثنائية اللغة
  return `<div dir="${dirOf(q.stem)}" style="text-align:start">${q.stem}</div>`;
}
function figHtml(q) {
  let h = '';
  if (q.fig) h += `<div class="qfig">${q.fig}</div>`;
  if (q.image) h += `<div class="qfig"><img src="${q.image}" alt=""></div>`;
  return h;
}
function optHtml(q, i) {
  const t = q.options[i] || ''; const img = q.optImages && q.optImages[i];
  return `<span class="opt-c" dir="${dirOf(t)}">${t}</span>${img ? `<img src="${img}" alt="" style="display:block;max-height:120px;margin-top:6px;border-radius:6px">` : ''}`;
}

// ---------- shell
function header(opts = {}) {
  const s = API.session();
  const roleAr = { student: 'طالب', guest: 'زائر', teacher: 'معلم', admin: 'الإدارة' };
  const who = s ? (s.role === 'student' ? `رقم ${esc(s.id)}` : esc(s.name)) : '';
  const cls = s && s.grade ? `${Catalog.classLabel(s.grade, s.track)}${s.section ? ' · ' + esc(s.section) : ''}` : '';
  const el = document.createElement('header'); el.className = 'top';
  el.innerHTML = `<div class="in-wrap"><a class="brand" href="${opts.home || '#'}"><span class="mk">${MARK}</span><span><b>منصة ابن حزم للتدريب على الاختبارات</b><small>${CFG.schoolAr} – ${CFG.schoolCycleAr}</small></span></a><span class="sp"></span>
    ${s ? `<span class="who"><b>${who}</b>${s.role === 'admin' ? 'لوحة التحكم' : roleAr[s.role] || ''}${cls ? ' · ' + cls : ''}</span><button class="btn sm" id="logoutBtn">${ICONS.logout}<span>خروج</span></button>` : ''}</div>`;
  document.body.prepend(el);
  const b = $('#logoutBtn', el); if (b) b.onclick = () => { const r = s.role; API.logout(); location.href = 'index.html'; };
}
function guard(...roles) {
  const s = API.session();
  if (!s || (roles.length && !roles.includes(s.role))) { location.replace('index.html'); throw new Error('redirect'); }
  return s;
}
function toast(msg, kind) {
  let box = $('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.append(box); }
  const t = document.createElement('div'); t.className = 'toast' + (kind === 'err' ? ' err' : ''); t.textContent = msg; box.append(t);
  setTimeout(() => t.remove(), 4200);
}
function modal({ title, body, foot, wide, onClose }) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true"><div class="mh"><h3>${title}</h3><button class="x" aria-label="إغلاق">×</button></div><div class="mb"></div>${foot !== false ? '<div class="mf"></div>' : ''}</div>`;
  const mb = $('.mb', bg); if (typeof body === 'string') mb.innerHTML = body; else if (body) mb.append(body);
  const close = () => { bg.remove(); onClose && onClose(); };
  $('.x', bg).onclick = close; bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  if (foot) { const mf = $('.mf', bg); foot.forEach(b => { const x = document.createElement('button'); x.className = 'btn ' + (b.cls || ''); x.textContent = b.text; x.onclick = () => b.onClick ? b.onClick(close, bg) : close(); mf.append(x); }); }
  document.body.append(bg); return { el: bg, close };
}
function confirmBox(text, okText = 'تأكيد', cls = '') {
  return new Promise(res => { modal({ title: 'تأكيد', body: `<p style="margin:0">${text}</p>`, foot: [{ text: 'إلغاء', cls: 'sec', onClick: c => { res(false); c(); } }, { text: okText, cls, onClick: c => { res(true); c(); } }], onClose: () => res(false) }); });
}
const fmtDate = iso => { if (!iso) return ''; const d = new Date(iso); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const fmtDur = s => { s = Math.round(s || 0); const m = Math.floor(s / 60), x = s % 60; return `${m}:${String(x).padStart(2, '0')}`; };

// ---------- Excel
function saveXlsx(sheets, filename) {
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
  sheets.forEach(sh => { const ws = XLSX.utils.aoa_to_sheet(sh.rows); ws['!cols'] = (sh.widths || sh.rows[0].map(() => 16)).map(w => ({ wch: w })); if (sh.rtl !== false) ws['!rightToLeft'] = true; XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31)); });
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a'); a.href = url; a.download = filename.replace(/[\\/:*?"<>|]+/g, '-'); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function readXlsx(file) {
  return file.arrayBuffer().then(buf => { const wb = XLSX.read(buf, { type: 'array' }); return wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false }) })); });
}
// صورة ← dataURL مصغرة (حتى 1000 بكسل)
function imageToData(file, max = 1000) {
  return new Promise((res, rej) => {
    const fr = new FileReader(); fr.onerror = rej;
    fr.onload = () => { const img = new Image(); img.onerror = rej; img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      const png = c.toDataURL('image/png'), jpg = c.toDataURL('image/jpeg', .85); res(png.length < jpg.length * 1.3 ? png : jpg); }; img.src = fr.result; };
    fr.readAsDataURL(file);
  });
}
function selectOpts(list, val) { return list.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(t)}</option>`; }).join(''); }

window.UI = { esc, $, $$, ICONS, MARK, fmt, dirOf, qDir, stemHtml, figHtml, optHtml, header, guard, toast, modal, confirmBox, fmtDate, fmtDur, saveXlsx, readXlsx, imageToData, selectOpts };
})();
