// ============================================================================
//  إعدادات المنصة — مدرسة ابن حزم الحلقة الثانية والثالثة
//
//  mode 'local'    : كل البيانات تُحفظ داخل المتصفح (IndexedDB) على هذا الجهاز فقط.
//                    مناسب للتجربة والمعاينة، ولا يشارك البيانات بين الأجهزة.
//  mode 'supabase' : قاعدة بيانات مشتركة (مجانية) — يدخل المعلم الامتحان من جهازه
//                    ويراه كل الطلاب، وتصل النتائج إلى الإدارة. يُفعَّل تلقائيًا عند
//                    تعبئة SUPABASE_URL و SUPABASE_KEY ونشر الموقع على الإنترنت.
//                    خطوات الإعداد في الملف docs/دليل_التشغيل.md
// ============================================================================
(function () {
  var SUPABASE_URL = 'https://qjfibaicadguuvlzydeq.supabase.co';   // مثال: https://xxxxxxxx.supabase.co
  var SUPABASE_KEY = 'sb_publishable_8v54NUPJvEqhpQCC56IOyA_KwrCEer0';   // Publishable (anon) key — عام بطبيعته، والقاعدة لا تسمح إلا بدوال api_*
  var onWeb = /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  window.APP_CONFIG = {
    mode: SUPABASE_URL && SUPABASE_KEY && (onWeb || /[?&]db=supabase\b/.test(location.search)) ? 'supabase' : 'local',
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    academicYear: '2026–2027',
    schoolAr: 'مدرسة ابن حزم',
    schoolCycleAr: 'الحلقة الثانية والثالثة',
    schoolEn: 'Ibn Hazm School – Cycle 2 & 3',
    principal: 'د. آمنة آل علي',
    designer: 'محمد رمزي الحفني',
    grades: [5, 6, 7, 8, 9, 10, 11, 12],
  };
})();
