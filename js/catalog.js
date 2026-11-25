// الصفوف والمسارات والمواد — العام الدراسي 2026–2027
(function () {
'use strict';
const SUBJECTS = {
  Mathematics: { ar: 'الرياضيات', ico: '∑' },
  Science: { ar: 'العلوم', ico: '🔬' },
  Physics: { ar: 'الفيزياء', ico: '⚛' },
  Chemistry: { ar: 'الكيمياء', ico: '⚗' },
  Biology: { ar: 'الأحياء', ico: '🧬' },
  English: { ar: 'اللغة الإنجليزية', ico: 'En' },
  Arabic: { ar: 'اللغة العربية', ico: 'ض' },
  'Islamic Education': { ar: 'التربية الإسلامية', ico: '☪' },
  'Social Studies': { ar: 'الدراسات الاجتماعية', ico: '🌍' },
  'Computer Science': { ar: 'الحوسبة والتصميم الإبداعي', ico: '💻' },
  Other: { ar: 'مادة أخرى', ico: '★' },
};
const CORE = ['Mathematics', 'English', 'Arabic', 'Islamic Education', 'Social Studies'];
// مسار عام للصفوف 5–12، ومسار متقدم للصفوف 9–12
function tracksFor(g) { return g >= 9 ? ['General', 'Advanced'] : ['General']; }
function subjectsFor(g, track) {
  g = Number(g);
  if (g <= 8) return [...CORE, 'Science', 'Computer Science', 'Other'];
  if (track === 'Advanced') return [...CORE, 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Other'];
  if (g <= 10) return [...CORE, 'Science', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Other'];
  return [...CORE, 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Other'];
}
const TRACK_AR = { General: 'عام', Advanced: 'متقدم' };
const TERM_AR = { 'Term 1': 'الفصل الدراسي الأول', 'Term 2': 'الفصل الدراسي الثاني', 'Term 3': 'الفصل الدراسي الثالث' };
const TERMS = ['Term 1', 'Term 2', 'Term 3'];
const subjAr = s => (SUBJECTS[s] || SUBJECTS.Other).ar;
const subjIco = s => (SUBJECTS[s] || SUBJECTS.Other).ico;
const classLabel = (g, tr) => `الصف ${g}${Number(g) >= 9 ? ' ' + TRACK_AR[tr] : ''}`;
// رمز صف الزائر: 7g، 10a، 9ع، 12م
function parseClassCode(v) {
  const s = String(v || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s+/g, '').toLowerCase();
  const m = s.match(/^(\d{1,2})([gaعم])$/); if (!m) return null;
  const g = Number(m[1]), tr = /[aم]/.test(m[2]) ? 'Advanced' : 'General';
  if (g < 5 || g > 12 || (tr === 'Advanced' && g < 9)) return null;
  return { grade: g, track: tr };
}
window.Catalog = { SUBJECTS, TERMS, TRACK_AR, TERM_AR, tracksFor, subjectsFor, subjAr, subjIco, classLabel, parseClassCode };
})();
