/* 才薪云经营分析平台 · 扩展专题模块（P0–P3）
 * 集团合并 / 同比与预算 / 合同管理 / 质量考核 / 用工社保 / 招投标 / 客户账期
 * 依赖：data-extra.js（root.CaiXinExtra）
 * 全部为本地计算，不联网；缺失字段一律不估算。
 */
(function (root) {
  'use strict';

  var MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  function E(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return n == null || !isFinite(Number(n)) ? '—' : Number(n).toFixed(2); }
  function num0(n) { return n == null || !isFinite(Number(n)) ? '—' : Math.round(Number(n)).toLocaleString('zh-CN'); }
  function pct(n) { return n == null || !isFinite(n) ? '—' : (n * 100).toFixed(2) + '%'; }
  function sign(n) { return n > 0 ? '+' : ''; }

  function X() { return root.CaiXinExtra || null; }
  function monthIdx(m) { var i = parseInt(String(m || '').slice(5), 10); return isFinite(i) ? Math.max(0, Math.min(11, i - 1)) : 5; }

  function ytd(arr, mi) {
    if (!arr) return null; var s = 0, has = false;
    for (var i = 0; i <= mi; i++) { var v = arr[i]; if (v != null && isFinite(v)) { s += v; has = true; } }
    return has ? s : null;
  }
  /* 区间求和 + 区间标签（全局分析区间筛选器） */
  function rngSum(arr, a, b) {
    if (!arr) return null; var s = 0, has = false;
    for (var i = a; i <= b; i++) { var v = arr[i]; if (v != null && isFinite(v)) { s += v; has = true; } }
    return has ? s : null;
  }
  function rngFrom(ctx, mi) { return ctx.from ? Math.min(monthIdx(ctx.from), mi) : 0; }
  function ytdTag(ctx) { return (!ctx.from || ctx.from.slice(5, 7) === '01') ? 'YTD' : '区间累计'; }
  function sumArr(arr) {
    if (!arr) return null; var s = 0, has = false;
    for (var i = 0; i < arr.length; i++) { var v = arr[i]; if (v != null && isFinite(v)) { s += v; has = true; } }
    return has ? s : null;
  }
  function cell(v) { return '<span class="' + (v < 0 ? 'bi2-neg' : '') + '">' + num(v) + '</span>'; }

  function kpi(label, value, unit, note) {
    return '<div class="bi-kpi-card"><div class="bi-card-title">' + E(label) + '</div>' +
      '<div class="bi-card-value">' + E(value) + '<small>' + E(unit || '') + '</small></div>' +
      '<div class="bi-card-note">' + E(note || '') + '</div></div>';
  }
  function sec(title, sub, body) {
    return '<section class="bi-section"><div class="bi-section-head"><h2>' + E(title) + '</h2><small>' + E(sub || '') + '</small></div>' + body + '</section>';
  }
  function warn(title, body) {
    return '<div class="bi2-warn"><strong>' + E(title) + '</strong><p>' + body + '</p></div>';
  }
  function note(t) { return '<div class="bi-note">' + t + '</div>'; }
  function fold(title, body) { return '<details class="bi-fold"><summary>' + E(title) + '</summary><div class="bi-fold-body">' + body + '</div></details>'; }
  function emptyBox(title, body) {
    return '<div class="bi-empty"><strong>' + E(title) + '</strong><p>' + E(body) + '</p></div>';
  }
  function tag(text, kind) { return '<span class="bi2-tag ' + (kind || '') + '">' + E(text) + '</span>'; }
  function flag(level, text) { return '<span class="bi2-flag ' + level + '">' + E(text) + '</span>'; }

  /* ---------------- 通用图表 ---------------- */
  function barRows(items, opts) {
    opts = opts || {};
    var max = Math.max(1, Math.max.apply(null, items.map(function (x) { return Math.abs(x.value); })));
    return items.map(function (x, i) {
      var w = max > 0 ? Math.max(x.value === 0 ? 0 : 1.5, Math.abs(x.value) / max * 100) : 0;
      return '<div class="bi-rank-row"><div class="bi-rank-label">' + E(x.label) + '</div>' +
        '<div class="bi-rank-track"><div class="bi-rank-fill' + (x.value < 0 ? ' negative' : '') + '" style="width:' + w.toFixed(1) + '%"></div></div>' +
        '<strong>' + num(x.value) + '</strong><span class="bi-rank-detail">' + E(x.detail || '') + '</span>' +
        (opts.month ? '<button type="button" data-bi-point="' + E(opts.month) + '">查看</button>' : '<span></span>') + '</div>';
    }).join('');
  }

  // 分组柱状图：categories=标签数组，series=[{name,color,values:[]}]
  function groupBars(categories, series, opts) {
    opts = opts || {};
    var all = [];
    series.forEach(function (s) { s.values.forEach(function (v) { if (v != null && isFinite(v)) all.push(v); }); });
    if (!all.length) return emptyBox('暂无可绘制数据', '所选范围没有可用数值。');
    var vmax = Math.max(0, Math.max.apply(null, all)), vmin = Math.min(0, Math.min.apply(null, all));
    if (vmax - vmin < 0.001) vmax = vmin + 1;
    var W = 760, H = opts.height || 250, left = 56, right = 740, top = 16, bottom = H - 46;
    var plotH = bottom - top, plotW = right - left;
    var n = categories.length, gn = series.length;
    var slot = plotW / Math.max(1, n), bw = Math.min(26, slot / (gn + 1.2));
    var y = function (v) { return top + (vmax - v) / (vmax - vmin) * plotH; };
    var grid = '';
    for (var g = 0; g <= 4; g++) {
      var val = vmax - (vmax - vmin) * g / 4, yy = top + plotH * g / 4;
      grid += '<line x1="' + left + '" y1="' + yy.toFixed(1) + '" x2="' + right + '" y2="' + yy.toFixed(1) + '" stroke="#e7eaed"/>' +
        '<text x="' + (left - 8) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end" fill="#84929a" font-size="10">' + num(val) + '</text>';
    }
    var zero = y(0);
    var bars = '';
    series.forEach(function (s, si) {
      s.values.forEach(function (v, ci) {
        if (v == null || !isFinite(v)) return;
        var cx = left + slot * ci + slot / 2 + (si - (gn - 1) / 2) * bw;
        var y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v));
        bars += '<rect x="' + (cx - bw / 2 + 1).toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + Math.max(1, y1 - y0).toFixed(1) + '" fill="' + s.color + '" rx="1.5"><title>' + E(categories[ci]) + ' ' + E(s.name) + '：' + num(v) + '</title></rect>';
      });
    });
    var labels = categories.map(function (c, i) {
      return '<text x="' + (left + slot * i + slot / 2).toFixed(1) + '" y="' + (bottom + 20) + '" text-anchor="middle" fill="#7d8a92" font-size="11">' + E(c) + '</text>';
    }).join('');
    var legend = series.map(function (s) {
      return '<span class="bi2-lg"><i style="background:' + s.color + '"></i>' + E(s.name) + '</span>';
    }).join('');
    return '<div class="bi2-legend">' + legend + '</div><svg class="bi-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + E(opts.label || '分组柱状图') + '">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fff"/>' + grid +
      '<line x1="' + left + '" y1="' + zero.toFixed(1) + '" x2="' + right + '" y2="' + zero.toFixed(1) + '" stroke="#c8d2d6"/>' +
      bars + labels + '</svg>';
  }

  function multiLine(categories, series, opts) {
    opts = opts || {};
    var all = [];
    series.forEach(function (s) { s.values.forEach(function (v) { if (v != null && isFinite(v)) all.push(v); }); });
    if (!all.length) return emptyBox('暂无可绘制数据', '所选范围没有可用数值。');
    var vmax = Math.max.apply(null, all), vmin = Math.min.apply(null, all);
    if (vmax - vmin < 0.001) vmax = vmin + 1;
    var W = 760, H = opts.height || 250, left = 56, right = 740, top = 16, bottom = H - 46;
    var plotH = bottom - top, plotW = right - left, n = categories.length;
    var x = function (i) { return left + (n === 1 ? plotW / 2 : i * plotW / (n - 1)); };
    var y = function (v) { return top + (vmax - v) / (vmax - vmin) * plotH; };
    var grid = '';
    for (var g = 0; g <= 4; g++) {
      var val = vmax - (vmax - vmin) * g / 4, yy = top + plotH * g / 4;
      grid += '<line x1="' + left + '" y1="' + yy.toFixed(1) + '" x2="' + right + '" y2="' + yy.toFixed(1) + '" stroke="#e7eaed"/>' +
        '<text x="' + (left - 8) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end" fill="#84929a" font-size="10">' + num(val) + '</text>';
    }
    var paths = series.map(function (s) {
      var p = '', open = false;
      s.values.forEach(function (v, i) {
        if (v == null || !isFinite(v)) { open = false; return; }
        p += (open ? ' L' : ' M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); open = true;
      });
      var dots = s.values.map(function (v, i) {
        if (v == null || !isFinite(v)) return '';
        return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3.5" fill="' + s.color + '" stroke="#fff" stroke-width="1.5"><title>' + E(categories[i]) + ' ' + E(s.name) + '：' + num(v) + '</title></circle>';
      }).join('');
      return '<path d="' + p + '" fill="none" stroke="' + s.color + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' + dots;
    }).join('');
    var labels = categories.map(function (c, i) {
      return '<text x="' + x(i).toFixed(1) + '" y="' + (bottom + 20) + '" text-anchor="middle" fill="#7d8a92" font-size="11">' + E(c) + '</text>';
    }).join('');
    var legend = series.map(function (s) { return '<span class="bi2-lg"><i style="background:' + s.color + '"></i>' + E(s.name) + '</span>'; }).join('');
    return '<div class="bi2-legend">' + legend + '</div><svg class="bi-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + E(opts.label || '折线图') + '">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fff"/>' + grid + paths + labels + '</svg>';
  }

  /* ================= P0 集团合并与多项目对比 ================= */
  function group(ctx, d) {
    var x = X();
    if (!x || !x.group2026) return emptyBox('扩展数据集未加载', '请确认 data-extra.js 与 index.html 在同一文件夹。');
    var G = x.group2026, mi = monthIdx(ctx.month), mf = rngFrom(ctx, mi);
    var units = G.units.map(function (u) {
      var rev = rngSum(u.revenue, mf, mi), pro = rngSum(u.profit, mf, mi);
      return { name: u.name, revenue: rev, profit: pro, target: rngSum(u.target, mf, mi), wage: rngSum(u.wage, mf, mi), social: rngSum(u.social, mf, mi), deduction: rngSum(u.deduction, mf, mi), hasDed: !!u.deduction };
    }).filter(function (u) { return u.revenue != null || u.profit != null; });
    var gDed = sumArr(units.map(function (u) { return u.deduction; }));
    var dedUnits = units.filter(function (u) { return u.hasDed; }).map(function (u) { return u.name; });

    var gRev = sumArr(units.map(function (u) { return u.revenue; }));
    var gPro = sumArr(units.map(function (u) { return u.profit; }));
    var gWage = sumArr(units.map(function (u) { return u.wage; }));
    var win = units.filter(function (u) { return u.profit != null && u.profit > 0; });
    var lose = units.filter(function (u) { return u.profit != null && u.profit < 0; }).sort(function (a, b) { return a.profit - b.profit; });
    var sorted = units.slice().sort(function (a, b) { return (b.profit || 0) - (a.profit || 0); });
    var srcTotal = -137.8722; // 源表「汇总」页集团口径净利润（万元）

    var cards =
      kpi('经营单元营业收入（' + ytdTag(ctx) + '）', num(gRev), '万元', units.length + ' 个单元合计 · 未经合并抵销') +
      kpi('经营单元净利润（' + ytdTag(ctx) + '）', num(gPro), '万元', '源表各单元页净利润相加') +
      kpi('盈利 / 亏损单元', win.length + ' / ' + lose.length, '个', lose.length ? '最大亏损：' + lose[0].name : '全部单元盈利') +
      kpi('人工成本（' + ytdTag(ctx) + '）', num(gWage), '万元', gRev ? '占收入 ' + pct(gWage / gRev) : '') +
      kpi('考核扣款（' + ytdTag(ctx) + '）', num(gDed), '万元', dedUnits.length ? ('仅 ' + dedUnits.join('、') + ' 源表设扣款行') : '源表未提供扣款行');

    var chart = groupBars(
      sorted.map(function (u) { return u.name.replace('项目部', '').replace('分公司', ''); }),
      [{ name: '净利润（万元）', color: '#277d78', values: sorted.map(function (u) { return u.profit; }) }],
      { label: '各经营单元净利润', height: 260 }
    );

    var table = '<div class="bi-tablewrap"><table class="bi-table"><thead><tr><th>经营单元</th><th>营业收入</th><th>净利润</th><th>净利率</th><th>人工成本</th><th>占收入</th><th>考核扣款</th><th>状态</th></tr></thead><tbody>' +
      sorted.map(function (u) {
        var rate = u.revenue > 0 && u.profit != null ? u.profit / u.revenue : null;
        var st = u.profit == null ? '<span class="bi2-tag">无数据</span>' : (u.profit > 0 ? flag('ok', '盈利') : flag('bad', '亏损'));
        return '<tr><td>' + E(u.name) + '</td><td>' + num(u.revenue) + '</td><td>' + cell(u.profit) + '</td><td>' +
          (rate == null ? '—' : pct(rate)) + '</td><td>' + num(u.wage) + '</td><td>' +
          (u.revenue > 0 && u.wage != null ? pct(u.wage / u.revenue) : '—') + '</td><td>' +
          (u.hasDed ? num(u.deduction) : '<span class="bi2-tag">未提供</span>') + '</td><td>' + st + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    var monthlyRev = G.months.map(function (_, i) { return sumArr(units.map(function (u) { var s = G.units.filter(function (z) { return z.name === u.name; })[0]; return s && s.revenue ? s.revenue[i] : null; })); });
    var monthlyPro = G.months.map(function (_, i) { return sumArr(G.units.map(function (z) { return z.profit ? z.profit[i] : null; })); });

    return sec('集团合并与多项目对比', '源表：2026年经营利润分析统计表 · 单位万元',
      warn('口径提示：集团合并 ≠ 单项目',
        '平台原有页面展示的是<b>餐服项目部</b>单项目数据（2026年1—6月净利润 <b>+80.42 万元</b>）。源表「汇总」页集团口径净利润为 <b>' + num(srcTotal) + ' 万元</b>，主要受预制项目部影响。<b>两者不是同一口径</b>，单项目盈亏不能代表集团整体。本页按经营单元逐项相加，未做内部抵销，仅用于定位亏损单元。') +
      '<div class="bi-kpi-grid">' + cards + '</div>') +
      sec('各单元净利润对比（截至 ' + ctx.month + '）', '按净利润排序 · 负值为亏损', chart) +
      sec('经营单元明细', units.length + ' 个单元', table +
        (lose.length ? '<div class="bi2-chips" style="margin-top:14px">' + lose.map(function (u) {
          return '<button type="button" class="bi2-chip bad">' + E(u.name) + ' ' + num(u.profit) + ' 万元</button>';
        }).join('') + '</div>' : '') +
        fold('口径与来源说明',
          note('本页“经营单元净利润”为各单元页净利润逐项相加（<b>' + num(gPro) + ' 万元</b>），与源表「汇总」页的 <b>' + num(srcTotal) + ' 万元</b>存在小幅差异：预制项目部的毛利润、管理费与风险准备金不完全等于净利润（含 25% 未回款部分），汇总页另做了调整。两者以企业财务口径为准。') +
          note('各单元页字段口径存在差异（如预制项目部使用“实际收入 / 工资支出”，曲靖与客服使用“人工支出合计”），横向比较以各自源表口径为准。净利率 = 单元净利润 ÷ 单元营业收入。') +
          note('「考核扣款」列仅源表设了扣款行的单元才有数值：餐服项目部（销售不达标考核扣款 + 冷链盒饭报废扣款）、乘服项目部（质量、两违考核扣款）、水果特产（考核扣款）；其余单元源表未设此行，显示“未提供”，不做估算。'))) +
      sec('集团月度走势（经营单元合计）', '收入与净利润',
        '<div class="bi-grid-2"><div><h3 class="bi-minor-title">营业收入合计</h3>' +
        multiLine(MONTHS.slice(0, mi + 1), [{ name: '营业收入（万元）', color: '#277d78', values: monthlyRev.slice(0, mi + 1) }], { label: '集团月度营业收入', height: 220 }) +
        '</div><div><h3 class="bi-minor-title">净利润合计</h3>' +
        multiLine(MONTHS.slice(0, mi + 1), [{ name: '净利润（万元）', color: '#ad554b', values: monthlyPro.slice(0, mi + 1) }], { label: '集团月度净利润', height: 220 }) +
        '</div></div>' +
        fold('口径与建议',
          note('月度合计为各单元同月数值相加，空缺月份不补零；不代表经审计的合并报表。') +
          note('建议动作：对亏损单元按「收入—直接成本—管理费 / 风险金」三段拆解，先确认是否存在收入确认口径差异、成本归集遗漏或单价下调。具体认定需企业财务复核。')));

  }

  /* ================= P1 同比与预算达成 ================= */
  /* ================= P1 同比与预算达成（可切换经营单元） ================= */
  function yoy(ctx, d) {
    var x = X();
    if (!x || !x.group2025) return emptyBox('扩展数据集未加载', '请确认 data-extra.js 与 index.html 在同一文件夹。');
    var G26 = x.group2026 || null, G25 = x.group2025, Y = x.yoy || null;

    /* 单元清单：2026 ∪ 2025 ∪ 同比数据集 */
    var seen = {}, units = [];
    function addU(n) { if (n && !seen[n]) { seen[n] = 1; units.push(n); } }
    if (G26) G26.units.forEach(function (u) { addU(u.name); });
    G25.units.forEach(function (u) { addU(u.name); });
    if (Y && Y.unit) addU(Y.unit);
    var cur = units.indexOf(ctx.yoyUnit) >= 0 ? ctx.yoyUnit : (units.indexOf('餐服项目部') >= 0 ? '餐服项目部' : units[0]);

    function find(g, name) { return g && g.units ? (g.units.filter(function (u) { return u.name === name; })[0] || null) : null; }
    var u26 = find(G26, cur), u25 = find(G25, cur);
    /* 2024 仅餐服项目部源表提供全年逐月（24年经营利润） */
    var has24 = !!(Y && cur === Y.unit && Y.y2024);
    var y24 = has24 ? Y.y2024 : null, y25 = u25 || {}, y26 = u26 || {};

    var mi = monthIdx(ctx.month), mf = rngFrom(ctx, mi);
    function cnt(arr) { return arr ? arr.filter(function (v) { return v != null; }).length : 0; }

    var r24 = y24 ? rngSum(y24.revenue, mf, mi) : null;
    var r25 = rngSum(y25.revenue, mf, mi), r26 = rngSum(y26.revenue, mf, mi);
    var p24 = y24 ? rngSum(y24.profit, mf, mi) : null;
    var p25 = rngSum(y25.profit, mf, mi), p26 = rngSum(y26.profit, mf, mi);
    var w24 = y24 ? rngSum(y24.wage, mf, mi) : null;
    var w25 = rngSum(y25.wage, mf, mi), w26 = rngSum(y26.wage, mf, mi);
    var t25 = rngSum(y25.target, mf, mi), t26 = rngSum(y26.target, mf, mi);
    var yoyRev = (r25 != null && r26 != null) ? (r26 - r25) / Math.abs(r25) : null;
    var yoy2y = (r24 != null && r25 != null) ? (r25 - r24) / Math.abs(r24) : null;
    var yoyPro = (p25 != null && p26 != null) ? (p26 - p25) / Math.abs(p25) : null;
    var tgt = t26 != null ? t26 : t25;
    var tgtYear = t26 != null ? '2026' : (t25 != null ? '2025' : null);
    var ach = (tgt != null && p26 != null) ? p26 / tgt : null;

    var unitNav = '<nav class="bi-kpi-subnav" role="tablist" aria-label="同比分析单元">' +
      units.map(function (n) { return '<button type="button" role="tab" aria-selected="' + (n === cur) + '" class="' + (n === cur ? 'active' : '') + '" data-yoy-unit="' + E(n) + '">' + E(n) + '</button>'; }).join('') + '</nav>';

    var cards =
      kpi('收入同比（2026 vs 2025）', yoyRev == null ? '—' : sign(yoyRev) + (yoyRev * 100).toFixed(1) + '%', '',
        (r25 != null && r26 != null) ? '2025 同期 ' + num(r25) + ' → 2026 ' + num(r26) + ' 万元' : (r25 == null ? '缺 2025 数据' : '缺 2026 数据')) +
      kpi('收入同比（2025 vs 2024）', yoy2y == null ? '—' : sign(yoy2y) + (yoy2y * 100).toFixed(1) + '%', '',
        y24 ? ('2024 同期 ' + num(r24) + ' → 2025 ' + num(r25) + ' 万元') : '源表未提供该单元 2024 逐月数据') +
      kpi('净利润（2026 ' + ytdTag(ctx) + '）', num(p26), '万元',
        p25 != null ? ('2025 同期 ' + num(p25) + ' 万元' + (yoyPro == null ? '' : '（同比 ' + sign(yoyPro) + (yoyPro * 100).toFixed(1) + '%）')) : '缺 2025 同期') +
      kpi('目标利润达成率', ach == null ? '—' : pct(ach), '', tgtYear ? (tgtYear + ' 年目标 ' + num(tgt) + ' 万元') : '目标利润字段为空');

    /* 三年收入对比：2024 系列仅在有数据的单元显示 */
    var revSeries = [];
    if (y24 && cnt(y24.revenue)) revSeries.push({ name: '2024', color: '#b9c6cc', values: (y24.revenue || []).slice(0, mi + 1) });
    revSeries.push({ name: '2025', color: '#6c91b4', values: (y25.revenue || []).slice(0, mi + 1) });
    revSeries.push({ name: '2026', color: '#277d78', values: (y26.revenue || []).slice(0, mi + 1) });
    var revChart = groupBars(MONTHS.slice(0, mi + 1), revSeries, { label: cur + '三年营业收入对比', height: 270 });

    /* 净利润同比折线 */
    var proSeries = [];
    if (y24 && cnt(y24.profit)) proSeries.push({ name: '2024 净利润', color: '#b9c6cc', values: (y24.profit || []).slice(0, mi + 1) });
    if (cnt(y25.profit)) proSeries.push({ name: '2025 净利润', color: '#6c91b4', values: (y25.profit || []).slice(0, mi + 1) });
    if (cnt(y26.profit)) proSeries.push({ name: '2026 净利润', color: '#277d78', values: (y26.profit || []).slice(0, mi + 1) });
    var proChart = proSeries.length ? multiLine(MONTHS.slice(0, mi + 1), proSeries, { label: cur + '净利润同比', height: 250 }) : '';

    /* 月度明细表 */
    function at(arr, i) { return arr && arr[i] != null && isFinite(arr[i]) ? arr[i] : null; }
    var rows = MONTHS.slice(0, mi + 1).map(function (_, i) {
      var a = y24 ? at(y24.revenue, i) : null, b = at(y25.revenue, i), c = at(y26.revenue, i);
      var pA = y24 ? at(y24.profit, i) : null, pB = at(y25.profit, i), pC = at(y26.profit, i);
      var yv = (b != null && c != null) ? (c - b) / Math.abs(b) : null;
      var tg = at(y26.target, i) != null ? at(y26.target, i) : at(y25.target, i);
      var ac = pC != null ? pC : pB;
      var level = null;
      if (tg != null && ac != null && tg !== 0) { var rr = ac / tg; level = rr >= 1 ? flag('ok', '达成') : (rr >= 0.8 ? flag('warn', '接近') : flag('bad', '未达成')); }
      return '<tr><td>' + (i + 1) + '月</td><td>' + num(a) + '</td><td>' + num(b) + '</td><td>' + num(c) + '</td><td>' +
        (yv == null ? '—' : sign(yv) + (yv * 100).toFixed(1) + '%') + '</td><td>' +
        num(tg) + '</td><td>' + cell(ac) + '</td><td>' + (level || '—') + '</td></tr>';
    }).join('');

    /* 数据覆盖情况（诚实披露） */
    var covNotes = [];
    var c25 = u25 ? [['收入', cnt(u25.revenue)], ['净利润', cnt(u25.profit)], ['工资', cnt(u25.wage)]] : [];
    c25.forEach(function (p) { if (p[1] && p[1] < 12) covNotes.push('2025 年' + p[0] + '源表仅提供 ' + p[1] + ' 个月'); });
    if (!y24) covNotes.push('2024 年源表仅提供餐服项目部逐月数据，其他单元无 2024 可比口径');
    if (cur === '餐服项目部') covNotes.push('源表注明：2025 年 9 月起水果特产工资不再包含在餐服项目部，跨年比较需注意单元构成变化');
    if (u25 && u25.name === '客服部') covNotes.push('客服部源表以「人工支出合计」列示人工成本，工资与社保未分开');
    if (u25 && u25.name === '轨枕项目部') covNotes.push('轨枕项目部源表收入行为「实际收入」，且无工资 / 社保行');
    if (u25 && u25.name === '曲靖分公司') covNotes.push('曲靖分公司源表以「人工支出合计」列示人工成本，工资与社保未分开');

    return unitNav +
      sec('同比与预算达成', cur + ' · 2024—2026 · 单位万元',
        '<div class="bi-kpi-grid">' + cards + '</div>' +
        (covNotes.length ? note('数据覆盖：' + covNotes.map(function (t) { return E(t); }).join('；') + '。空缺月份不补零、不用其他字段替代。') : '')) +
      sec('营业收入三年对比', cur + ' · 同月对照（' + ytdTag(ctx) + '）', revChart +
        fold('口径与来源说明',
          note('2024 数据来自源表「24年经营利润」页（乘务项目部-餐服）；2025 来自 2025 年经营利润分析统计表；2026 来自 2026 年统计表。三期口径以各自源表为准，跨年比较需注意期间定义差异（如 3 月为 2.26—3.25 结算）。'))) +
      (proChart ? sec('净利润同比', cur + ' · 2024 / 2025 / 2026', proChart) : '') +
      sec('同比与目标达成明细', '目标利润取自源表「目标利润」行',
        '<div class="bi-tablewrap"><table class="bi-table"><thead><tr><th>月份</th><th>2024 收入</th><th>2025 收入</th><th>2026 收入</th><th>同比 26/25</th><th>目标利润</th><th>实际净利润</th><th>达成</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        fold('红绿灯口径',
          note('按「实际净利润 ÷ 目标利润」划分：≥100% 达成、80%—100% 接近、&lt;80% 未达成。' +
            (t26 == null ? '<b>2026 年源表「目标利润」行为空</b>，表中目标值沿用 2025 年，仅供演示；实际考核应使用企业当年正式预算。' : '')))) +
      sec('人工成本口径', cur + ' · ' + ytdTag(ctx),
        '<div class="bi-kpi-grid">' +
        kpi('应发工资（2024）', num(w24), '万元', w24 == null ? '源表未提供' : '2024 年同期') +
        kpi('应发工资（2025）', num(w25), '万元', '') +
        kpi('应发工资（2026）', num(w26), '万元', '') +
        kpi('工资 / 收入（2026）', (w26 != null && r26) ? pct(w26 / r26) : '—', '', '2025：' + ((w25 != null && r25) ? pct(w25 / r25) : '—')) +
        '</div>' +
        fold('口径说明', note('2024 年应发工资取源表「应发工资合计」行（含餐服员、库房、配送、水果特产、实习、社招、临时工、管理员全部条目），与 2025 / 2026 年「应发工资」行同口径。' +
          (y24 ? '' : '该单元无 2024 年工资数据。'))));

  }

  /* ================= P1 合同管理 ================= */
  function contract(ctx, d) {
    var x = X();
    if (!x || !x.contracts) return emptyBox('扩展数据集未加载', '请确认 data-extra.js 与 index.html 在同一文件夹。');
    var C = x.contracts;
    var t1 = C.team1 || [], t2 = C.team2 || [], t3 = C.team3 || [];
    var ref = ctx.month && /^\d{4}-\d{2}$/.test(ctx.month) ? ctx.month : '2026-06';

    function monthsTo(end) {
      if (!end) return null;
      var ey = +end.slice(0, 4), em = +end.slice(5, 7), ry = +ref.slice(0, 4), rm = +ref.slice(5, 7);
      return (ey - ry) * 12 + (em - rm);
    }
    /* 天数口径：基准日为分析月 1 日，到期日取合同结束月最后一天（源表只提供年月） */
    var refDate = new Date(+ref.slice(0, 4), +ref.slice(5, 7) - 1, 1);
    var contractAll = t1.concat(t2);
    function daysTo(end) {
      if (!end || !/^\d{4}-\d{2}$/.test(end)) return null;
      var exp = new Date(+end.slice(0, 4), +end.slice(5, 7), 0);
      return Math.round((exp - refDate) / 86400000);
    }
    function bucket(days) {
      if (days == null) return null;
      if (days < 0) return 'expired';
      if (days <= 30) return 'd30';
      if (days <= 60) return 'd60';
      if (days <= 90) return 'd90';
      return 'later';
    }
    var BUCKETS = [
      ['expired', '已过期'], ['d30', '≤ 30 天'], ['d60', '31–60 天'], ['d90', '61–90 天'], ['later', '90 天以后']
    ];
    var bCount = { expired: 0, d30: 0, d60: 0, d90: 0, later: 0 };
    var withDays = [];
    contractAll.forEach(function (r) {
      var dd = daysTo(r.end);
      var b = bucket(dd);
      if (b && b !== 'later') { bCount[b]++; withDays.push({ r: r, days: dd, b: b }); }
      else if (b === 'later') bCount.later++;
    });
    withDays.sort(function (a, b2) { return a.days - b2.days; });
    var BADGE = { expired: 'bad', d30: 'bad', d60: 'warn', d90: 'warn', later: 'ok' };
    var BNAME = { expired: '已过期', d30: '≤30天', d60: '31–60天', d90: '61–90天', later: '90天以后' };
    var expiryStrip = '<div class="cx-expiry">' + BUCKETS.map(function (p) {
      return '<button type="button" class="cx-expiry-item ' + BADGE[p[0]] + '" data-cx-expiry="' + p[0] + '">' +
        '<b>' + num0(bCount[p[0]]) + '</b><span>' + p[1] + '</span></button>';
    }).join('') + '</div>';
    var dayTable = withDays.length
      ? '<div class="bi-tablewrap"><table class="bi-table"><thead><tr><th>工号</th><th>队伍</th><th>岗位</th><th>类型</th><th>合同期</th><th>到期</th><th>剩余天数</th><th>档位</th></tr></thead><tbody>' +
        withDays.map(function (o) {
          var r = o.r;
          return '<tr data-cx-bucket="' + o.b + '"><td>' + E(r.id) + '</td><td>' + E(r.team) + '</td><td>' + E(r.job || '—') + '</td><td>' + E(r.type) + '</td><td>' + E(r.period || '—') + '</td><td>' + E(r.end || '—') + '</td><td>' +
            (o.days < 0 ? '已过期 ' + Math.abs(o.days) + ' 天' : o.days + ' 天') + '</td><td>' + flag(BADGE[o.b], BNAME[o.b]) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<div class="bi-note">90 天内没有合同到期记录。</div>';
    var DOCS = ['入职申请表', '入职登记表', '无犯罪证明', '身份证复印件', '健康证复印件', '合格证书复印件', '补充协议', '双向承诺书'];

    var all = [];
    t1.forEach(function (r) { all.push({ id: r.id, team: r.team, job: r.job, type: r.type, end: r.end, period: r.period, kind: '劳动合同' }); });
    t2.forEach(function (r) { all.push({ id: r.id, team: r.team, job: r.job, type: '劳务', end: r.end, period: r.period, kind: '劳动合同' }); });

    /* contractAll 已在 refDate 之后声明 */
    var cSoon = contractAll.filter(function (r) { var m = monthsTo(r.end); return m != null && m <= 3; })
      .sort(function (a, b) { return String(a.end).localeCompare(String(b.end)); });
    var hExpired = t3.filter(function (r) { var m = monthsTo(r.expiry); return m != null && m <= 0; })
      .sort(function (a, b) { return String(a.expiry).localeCompare(String(b.expiry)); });
    var hSoon = t3.filter(function (r) { var m = monthsTo(r.expiry); return m != null && m > 0 && m <= 3; })
      .sort(function (a, b) { return String(a.expiry).localeCompare(String(b.expiry)); });

    var docFilled = t1.filter(function (r) { return DOCS.some(function (dn) { return r.docs && r.docs[dn]; }); }).length;
    var docMissing = {};
    DOCS.forEach(function (dn) { docMissing[dn] = t1.filter(function (r) { return !(r.docs && r.docs[dn]); }).length; });

    var typeDist = {}; contractAll.forEach(function (r) { var k = r.type || '未标注'; typeDist[k] = (typeDist[k] || 0) + 1; });
    var socialDist = {}; t1.forEach(function (r) { var k = r.social || '未标注'; socialDist[k] = (socialDist[k] || 0) + 1; });

    var cards =
      kpi('合同 / 证照记录', num0(all.length), '条', '合同 ' + contractAll.length + ' · 健康证 ' + t3.length) +
      kpi('合同 3 个月内到期', num0(cSoon.length), '条', '一队 ' + t1.length + ' · 二队 ' + t2.length) +
      kpi('健康证已过期', num0(hExpired.length), '条', '另有 ' + hSoon.length + ' 条 3 个月内到期') +
      kpi('劳务 / 实习', (typeDist['劳务'] || 0) + ' / ' + (typeDist['实习'] || 0), '份', '按合同类型统计');

    var soonTable = cSoon.length
      ? '<div class="bi-tablewrap"><table class="bi-table"><thead><tr><th>工号</th><th>队伍</th><th>岗位</th><th>类型</th><th>到期</th><th>剩余</th><th>提醒</th></tr></thead><tbody>' +
        cSoon.slice(0, 60).map(function (r) {
          var m = monthsTo(r.end);
          var lv = m < 0 ? flag('bad', '已过期 ' + Math.abs(m) + ' 个月') : (m <= 1 ? flag('bad', m + ' 个月内') : flag('warn', m + ' 个月内'));
          return '<tr><td>' + E(r.id) + '</td><td>' + E(r.team) + '</td><td>' + E(r.job || '—') + '</td><td>' + E(r.type) + '</td><td>' + E(r.end || '—') + '</td><td>' + (m == null ? '—' : (m < 0 ? '已过期' : m + ' 个月')) + '</td><td>' + lv + '</td></tr>';
        }).join('') + '</tbody></table></div>' + note('剩余月数按经营分析月份 ' + E(ref) + ' 计算。过期与临期记录须由人资部核对是否已续签；原型只做提示，不自动变更状态。')
      : '<div class="bi-note">以 ' + E(ref) + ' 为基准，3 个月内没有合同到期记录。</div>';

    var healthTable = (hExpired.length + hSoon.length)
      ? '<div class="bi-tablewrap"><table class="bi-table"><thead><tr><th>工号</th><th>队伍</th><th>岗位</th><th>办理地点</th><th>体检日期</th><th>有效至</th><th>状态</th></tr></thead><tbody>' +
        hExpired.concat(hSoon).slice(0, 60).map(function (r) {
          var m = monthsTo(r.expiry);
          return '<tr><td>' + E(r.id) + '</td><td>' + E(r.team) + '</td><td>' + E(r.job || '—') + '</td><td>' + E(r.place || '—') + '</td><td>' + E(r.check || '—') + '</td><td>' + E(r.expiry || '—') + '</td><td>' +
            (m < 0 ? flag('bad', '已过期 ' + Math.abs(m) + ' 个月') : flag('warn', m + ' 个月内')) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        note('三队健康证数据为源表提供的时点快照（体检日期集中在 2025 年）。健康证到期影响上岗资格，属用工合规事项，建议并入「督办专题」形成续办待办。')
      : '<div class="bi-note">以 ' + E(ref) + ' 为基准，没有健康证过期或临期记录。</div>';

    var docBody = docFilled === 0
      ? emptyBox('源表未登记配套文件状态',
        '人员信息表的「入职申请表 / 入职登记表 / 无犯罪证明 / 身份证复印件 / 健康证复印件 / 合格证书复印件 / 补充协议 / 双向承诺书」8 列在源表中均为空白，未做勾选登记。原型不把“未登记”当作“未交”，因此不显示完整率。') +
        '<div class="bi-note" style="margin-top:12px"><b>该模块已就绪，待企业按人登记后自动计算：</b>下表中 8 类文件逐人核对，任一缺项即进入预警。</div>'
      : barRows(DOCS.map(function (dn) {
        var miss = docMissing[dn];
        return { label: dn, value: t1.length - miss, detail: miss ? '缺 ' + miss + ' 人' : '齐全' };
      })) + note('统计口径：一队 ' + t1.length + ' 人中，该文件列有勾选记号的计为已交。空缺可能是“尚未收回”或“源表未登记”，需人资部核实，不能直接判定缺失。');

    var docList = '<div class="bi-doc">' + DOCS.map(function (dn) {
      return '<div class="bi-doc-item"><span>' + E(dn) + '</span><b class="miss">未登记</b></div>';
    }).join('') + '</div>';

    var ktcb = x.ktcb;
    var ktcbBody = ktcb ? '<div class="bi-tablewrap"><table class="bi-table"><thead><tr><th>合同项目</th><th>计价项</th><th>单价</th><th>数量</th><th>金额（元）</th></tr></thead><tbody>' +
      ktcb.rows.map(function (r) { return '<tr><td>' + E(ktcb.name) + '</td><td>' + E(r.item) + '</td><td>' + num0(r.unit) + '</td><td>' + num0(r.qty) + '</td><td>' + num0(r.amount) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' + note('合同提取比例：总部管理费 <b>' + pct(ktcb.managementRate) + '</b>（按营业收入）、风险准备金 <b>' + pct(ktcb.reserveRate) + '</b>。合同为「一年一签」，人员 ' + num0(ktcb.headcount) + ' 人。') : '';

    var typeLib = ['云南省劳动合同', '入职申请表', '员工入职告知书', '劳动合同补充协议', '劳务协议', '非全日制劳动合同书', '学生实习协议', '承揽合同', '同意/放弃购买社会保险承诺书', '报到告知书（乘务使用）', '业务外包企业、业务外包人员“双向承诺书”', '员工管理办法'];

    return sec('合同管理', '来源：餐服部人员信息表 · 人资部流程 · 招投标管理制度 · KTCB 外包合同',
      warn('数据边界', '本模块基于企业提供的合同台账与制度文件构建，是<b>拟设计模块与演示原型</b>，不是企业已上线的合同系统。人员数据已去标识化（仅工号 / 岗位 / 类型 / 日期），不含姓名、身份证、住址等个人信息。') +
      '<div class="bi-kpi-grid">' + cards + '</div>') +
      sec('到期预警', '以 ' + ref + ' 为基准 · 合同 ' + num0(contractAll.length) + ' 份',
        expiryStrip +
        note('天数口径：以分析月 ' + E(ref) + ' 月 1 日为基准日，合同到期日取结束月最后一天（源表仅提供年月，故天数为月内近似值）。点击档位可筛选下方明细。') +
        '<div class="bi-grid-2"><div><h3 class="bi-minor-title">90 天内到期 / 已过期明细（' + num0(withDays.length) + ' 份）</h3>' + dayTable + '</div>' +
        '<div><h3 class="bi-minor-title">健康证到期（三队 ' + num0(t3.length) + ' 条 · 已过期 ' + num0(hExpired.length) + ' · 临期 ' + num0(hSoon.length) + '）</h3>' + healthTable + '</div></div>' +
        '<h3 class="bi-minor-title" style="margin-top:18px">合同到期与续签（按月汇总 · 3 个月内 ' + num0(cSoon.length) + ' 份）</h3>' + soonTable) +
      sec('配套文件与合同类型', '一队 ' + num0(t1.length) + ' 人',
        docBody + '<div style="margin-top:14px">' + docList + '</div>' +
        '<div class="bi-grid-2" style="margin-top:18px"><div><h3 class="bi-minor-title">合同类型</h3>' +
        barRows(Object.keys(typeDist).map(function (k) { return { label: k, value: typeDist[k], detail: '' }; })) +
        '</div><div><h3 class="bi-minor-title">社保情况（一队）</h3>' +
        barRows(Object.keys(socialDist).map(function (k) { return { label: k, value: socialDist[k], detail: '' }; })) +
        '</div></div>' +
        fold('文件类型库与口径说明',
          '<div class="bi2-chips">' + typeLib.map(function (t, i) { return '<span class="bi2-chip">' + (i + 1) + '. ' + E(t) + '</span>'; }).join('') + '</div>' +
          note('每份合同应配齐以上文件类型。新增人员时按此清单核对，缺项进入「督办专题」形成待办。') +
          note('「保险」指企业为其缴纳社保，「补助」指按社保补贴标准发放补助，「实习补助」对应实习协议；三种方式对应的成本与合规要求不同，应与用工社保专题联动查看。'))) +
      sec('合同计价与合同级盈亏', 'KTCB 外包合同（一年一签）', ktcbBody);

  }

  /* ================= P2 质量考核与扣款归因 ================= */
  function quality(ctx, d) {
    var x = X();
    if (!x || !x.quality) return emptyBox('扩展数据集未加载', '请确认 data-extra.js 与 index.html 在同一文件夹。');
    var Q = x.quality;
    var real = 0, walk = 0;
    Object.keys(Q.byCat).forEach(function (k) { if (k === '现场写实') walk += Q.byCat[k]; else real += Q.byCat[k]; });
    var dedAbs = Math.abs(Q.totalDed), amtAbs = Math.abs(Q.totalAmt);

    var cards =
      kpi('检查记录合计', num0(Q.total), '条', '段查 / 队查现场记录') +
      kpi('现场写实', num0(walk), '条', '日常检查与写实记录') +
      kpi('考核（扣分）记录', num0(real), '条', 'Ⅰ / Ⅱ / Ⅲ / Ⅳ 及 FA/FB/FⅢ 分级') +
      kpi('扣款合计', num0(amtAbs), '元', '扣分合计 ' + num0(dedAbs) + ' 分');

    var catBars = Object.keys(Q.byCat).map(function (k) { return { label: k, value: Q.byCat[k], detail: '' }; })
      .sort(function (a, b) { return b.value - a.value; });
    var deptBars = Object.keys(Q.byDept).map(function (k) { return { label: k, value: Q.byDept[k], detail: '' }; })
      .sort(function (a, b) { return b.value - a.value; }).slice(0, 12);

    var mkeys = Object.keys(Q.monthly).sort();
    var monthChart = groupBars(mkeys, [
      { name: '检查记录数', color: '#6c91b4', values: mkeys.map(function (k) { return Q.monthly[k].n; }) }
    ], { label: '月度检查记录数', height: 220 });

    var recs = (Q.records || []).slice(0, 40);
    var recTable = recs.length ? '<div class="bi-tablewrap"><table class="bi-table"><thead><tr><th>月份</th><th>类别</th><th>检查部门</th><th>来源</th><th>扣分</th><th>扣款（元）</th><th>考核内容摘要</th></tr></thead><tbody>' +
      recs.map(function (r) {
        return '<tr><td>' + E(r.month) + '</td><td>' + E(r.cat) + '</td><td>' + E(r.dept) + '</td><td>' + E(r.kind) + '</td><td>' +
          num0(Math.abs(r.ded)) + '</td><td>' + num0(Math.abs(r.amt)) + '</td><td style="white-space:normal;max-width:320px;text-align:left">' + E(r.content) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '';
    return sec('质量考核与扣款归因', '来源：2026_06_11 岗位量化指标完成情况 · 502 条',
      warn('重要口径提示：本页扣款 ≠ 利润表扣款',
        '利润表上的「销售不达标考核扣款 + 冷链盒饭报废扣款」半年合计 <b>113.12 万元</b>，是<b>客户对公司的结算扣款</b>；本页考核扣款合计 <b>' + num0(amtAbs) + ' 元</b>，是<b>段 / 车队对岗位服务质量的现场考核</b>。两者口径不同，<b>不能直接相减或互相印证</b>。本模块的价值在于证明“服务质量考核台账存在且可追溯”，为后续建立逐单对应关系提供基础。') +
      '<div class="bi-kpi-grid">' + cards + '</div>') +
      sec('检查与考核结构', '按类别 / 检查部门 / 月份',
        '<div class="bi-grid-2"><div><h3 class="bi-minor-title">按类别</h3>' + barRows(catBars) +
        '</div><div><h3 class="bi-minor-title">按检查部门（前 12）</h3>' + barRows(deptBars) + '</div></div>' +
        '<h3 class="bi-minor-title" style="margin-top:20px">月度检查强度</h3>' + monthChart +
        fold('口径与来源说明',
          note('「现场写实」是日常检查记录，多数不产生扣分；Ⅰ—Ⅳ 与 FA/FB/FⅢ 为分级考核结论。检查部门含段级机关（安全科、劳人科、经管科等）与车队。') +
          note('记录覆盖 2026 年 4—5 月，与源表出表日期 2026-06-11 及考核区间 2026-04-26 至 2026-05-25 一致。'))) +
      sec('考核记录明细（扣分或扣款非零）', recs.length + ' 条示例', recTable) +
      sec('归因与建议', '把服务考核接回经营结果',
        '<div class="bi2-chips">' +
        '<span class="bi2-chip">① 建立考核单 ↔ 客户结算扣款的对应关系</span>' +
        '<span class="bi2-chip">② 对高频考核内容做专项整改（班前培训 / 标准作业）</span>' +
        '<span class="bi2-chip">③ 考核扣款按部门归集，纳入部门绩效</span>' +
        '<span class="bi2-chip">④ 现场写实覆盖率作为服务质量先行指标</span>' +
        '</div>' +
        fold('建议边界', note('以上为管理建议，不是财务结论。建立逐单对应关系需要客户结算单与考核通知书的原始凭证，原型无法自动完成。')));

  }

  /* ================= P2 用工与社保合规 ================= */
  function compliance(ctx, d) {
    var x = X();
    if (!x || !x.socialStandard) return emptyBox('扩展数据集未加载', '请确认 data-extra.js 与 index.html 在同一文件夹。');
    var S = x.socialStandard, t1 = (x.contracts && x.contracts.team1) || [];
    var socialDist = {}; t1.forEach(function (r) { var k = r.social || '未标注'; socialDist[k] = (socialDist[k] || 0) + 1; });
    var insured = socialDist['保险'] || 0, subsidy = (socialDist['补助'] || 0) + (socialDist['实习补助'] || 0);

    var cards =
      kpi('人员记录（一队）', num0(t1.length), '人', '含合同与社保方式') +
      kpi('参保（保险）', num0(insured), '人', '企业缴纳社保') +
      kpi('补贴（补助）', num0(subsidy), '人', '按补贴标准发放') +
      kpi('补贴标准', '880 / 400', '元', '签合同 / 实习协议');

    var stdTable = '<div class="bi-tablewrap"><table class="bi-table"><thead><tr><th>出勤天数</th><th>合同社保补贴（元）</th><th>实习社保补贴（元）</th></tr></thead><tbody>' +
      S.contract.map(function (r) {
        var it = (S.intern || []).filter(function (z) { return z.days === r.days; })[0];
        return '<tr><td>' + r.days + ' 天</td><td>' + num0(r.actual) + '</td><td>' + (it ? num0(it.actual) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    /* 社保补贴试算器：按源表阶梯规则实时计算（本地运算，不联网） */
    function subsidyOf(kind, days) {
      var ladder = kind === 'intern' ? (S.intern || []) : (S.contract || []);
      var full = ladder.length ? ladder[0].full : 0;
      if (days == null || !isFinite(days) || days < 6) return { amt: 0, full: full, hit: days < 6 ? '出勤 6 天以下不做补贴' : null };
      if (days >= 15) return { amt: full, full: full, hit: '满勤' };
      var row = ladder.filter(function (z) { return z.days === days; })[0];
      return row ? { amt: row.actual, full: full, hit: '差 ' + (15 - days) + ' 天' } : { amt: full, full: full, hit: '满勤' };
    }
    var calc =
      '<div class="cx-calc" data-cx-calc>' +
      '<div class="cx-calc-head"><b>社保补贴试算器</b><span>选择用工形式与出勤天数，按源表阶梯实时试算</span></div>' +
      '<div class="cx-calc-row"><span class="cx-calc-lab">用工形式</span>' +
      '<button type="button" class="cx-calc-type active" data-cx-type="contract">签合同（满额 880 元）</button>' +
      '<button type="button" class="cx-calc-type" data-cx-type="intern">实习协议（满额 400 元）</button></div>' +
      '<div class="cx-calc-row"><span class="cx-calc-lab">出勤天数</span>' +
      '<input type="range" min="0" max="31" step="1" value="15" class="cx-calc-range" data-cx-days aria-label="出勤天数">' +
      '<input type="number" min="0" max="31" step="1" value="15" class="cx-calc-num" data-cx-days-num aria-label="出勤天数">' +
      '<span class="cx-calc-out" data-cx-out>880 元</span></div>' +
      '<div class="cx-calc-meta" data-cx-meta>满勤 · 与满额计提一致</div>' +
      '<div class="cx-calc-note">规则来自源表：签合同满额 880 元 / 月、差一天扣 60 元；实习协议满额 400 元 / 月、差一天扣 30 元；出勤 6 天以下不做补贴。试算仅用于理解规则，实发以企业薪酬核算为准。</div>' +
      '</div>';

    return sec('用工与社保合规', '来源：社保补贴标准 · 人员合同台账',
      '<div class="bi-kpi-grid">' + cards + '</div>') +
      calc +
      sec('补贴标准与参保结构', '一队 ' + t1.length + ' 人',
        '<div class="bi-grid-2"><div><h3 class="bi-minor-title">社保补贴标准阶梯（按出勤天数）</h3>' + stdTable +
        fold('口径说明', note(E(S.note) + ' 校验社保支出时，应按每人实际出勤天数查表，而不是按满额统一计提。')) +
        '</div><div><h3 class="bi-minor-title">参保方式分布</h3>' +
        barRows(Object.keys(socialDist).map(function (k) { return { label: k, value: socialDist[k], detail: '' }; })) +
        fold('口径说明', note('「保险」与「补助」对应的成本与合规义务不同：参保需按月缴纳社保，补助按出勤天数发放。两类人员混在一起统计会掩盖成本结构。')) +
        '</div></div>') +
      sec('社保支出对照与合规缺口', '餐服项目部 2026 年',
        (function () {
          var g = X().group2026, u = g.units.filter(function (z) { return z.name === '餐服项目部'; })[0];
          if (!u || !u.social) return emptyBox('无社保数据', '');
          var mi = monthIdx(ctx.month), mf = rngFrom(ctx, mi), t = rngSum(u.social, mf, mi), w = rngSum(u.wage, mf, mi);
          return '<div class="bi-kpi-grid">' +
            kpi('社保支出（' + ytdTag(ctx) + '）', num(t), '万元', '源表「社保支出」行') +
            kpi('社保 / 工资', (t && w) ? pct(t / w) : '—', '', '社保支出 ÷ 应发工资') +
            kpi('社保 / 收入', (t && rngSum(u.revenue, mf, mi)) ? pct(t / rngSum(u.revenue, mf, mi)) : '—', '', '社保支出 ÷ 营业收入') +
            kpi('校验状态', '待补数据', '', '缺逐人出勤与缴费明细') +
            '</div>';
        })() +
        '<div class="bi2-chips" style="margin-top:16px">' +
        '<span class="bi2-chip ok">可做：参保 / 补助人数结构</span>' +
        '<span class="bi2-chip ok">可做：补贴阶梯试算（规则来自源表）</span>' +
        '<span class="bi2-chip ok">可做：合同配套文件缺项提示</span>' +
        '<span class="bi2-chip ok">可做：健康证与合同到期预警</span>' +
        '<span class="bi2-chip bad">待补：每人月度实际出勤天数</span>' +
        '<span class="bi2-chip bad">待补：社保缴费明细与缴费基数</span>' +
        '<span class="bi2-chip bad">待补：放弃参保承诺书扫描件状态</span>' +
        '</div>' +
        fold('缺口说明',
          note('源表提供的是<b>补贴标准</b>而非逐人出勤记录，因此本页<b>只提供规则试算器</b>（上方），不推算任何人的实发金额。补齐月度出勤与缴费明细后，可逐人校验“应发补贴 vs 实发”，并核对社保支出总额是否与利润表一致。') +
          note('总量比例仅用于判断社保支出是否异常波动；逐人合规校验需要企业提供月度出勤与缴费明细。')));

  }

  /* ================= P3 招投标获客 ================= */
  function bidding(ctx, d) {
    var x = X();
    if (!x || !x.bidding) return emptyBox('扩展数据集未加载', '请确认 data-extra.js 与 index.html 在同一文件夹。');
    var B = x.bidding;
    var teamTable = '<div class="bi-tablewrap"><table class="bi-table"><thead><tr><th>岗位</th><th>编制</th><th>主要职责</th></tr></thead><tbody>' +
      B.team.map(function (t) { return '<tr><td>' + E(t.role) + '</td><td>' + E(t.count) + '</td><td style="white-space:normal;text-align:left">' + E(t.duty) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
    var ruleTable = '<div class="bi-tablewrap"><table class="bi-table"><thead><tr><th>考核项</th><th>目标值</th><th>说明</th></tr></thead><tbody>' +
      B.rules.map(function (r) { return '<tr><td>' + E(r.item) + '</td><td>' + E(r.target) + '</td><td style="white-space:normal;text-align:left">' + E(r.note) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';

    return sec('招投标获客', '来源：云南思瑞达企业管理有限公司招投标管理制度',
      warn('数据边界：只有制度，没有业务数据',
        '企业提供了完整的《招投标管理制度》（岗位说明书、考核指标、奖惩规则），但<b>没有提供实际的招标线索台账与中标记录</b>。因此本模块<b>不生成任何数字</b>：只呈现制度规则与台账模板，企业录入线索后系统再自动计算中标率、有效线索率与成本降幅。') +
      '<div class="bi-kpi-grid">' +
      kpi('投标团队岗位', String(B.team.length), '类', '含主管 / 信息专员 / 标书 / 核算 / 审核') +
      kpi('考核指标', String(B.rules.length), '项', '来自制度原文') +
      kpi('线索台账', '待录入', '', '原型不编造业务数据') +
      kpi('制度核心目标', '获客 · 质量 · 转化 · 成本', '', '制度第一部分明确') +
      '</div>') +
      sec('投标团队与考核规则', '制度第二、三部分',
        '<div class="bi-grid-2"><div><h3 class="bi-minor-title">投标团队组织架构</h3>' + teamTable + '</div>' +
        '<div><h3 class="bi-minor-title">考核与奖惩规则</h3>' + ruleTable + '</div></div>' +
        fold('说明', note('这些参数可直接作为原型中的规则阈值：例如「中标率每降低 1% 罚 500 元」可在录入中标记录后自动计算应奖应罚。'))) +
      sec('线索台账（待企业录入）', '结构已就绪 · 无数据不展示',
        emptyBox('尚未提供招标线索数据',
          '原型不编造线索。企业按「线索日期 / 项目名称 / 甲方 / 预估金额 / 来源（老客户 / 盲投）/ 是否进入投标 / 是否中标」录入后，本页将自动计算有效线索率、中标率与投标成本，并对照制度目标值给出红绿灯。'));

  }

  /* ================= P3 客户与账期现金流 ================= */
  function cashflow(ctx, d) {
    var x = X();
    if (!x || !x.clients) return emptyBox('扩展数据集未加载', '请确认 data-extra.js 与 index.html 在同一文件夹。');
    var C = x.clients, g = x.group2026;
    var u = g.units.filter(function (z) { return z.name === '餐服项目部'; })[0];
    var mi = monthIdx(ctx.month), mf = rngFrom(ctx, mi);
    var wage = u ? rngSum(u.wage, mf, mi) : null;

    var cpTable = '<div class="bi-tablewrap"><table class="bi-table"><thead><tr><th>甲方 / 单位</th><th>依据</th></tr></thead><tbody>' +
      C.counterparties.map(function (c) { return '<tr><td>' + E(c.name) + '</td><td style="white-space:normal;text-align:left">' + E(c.basis) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';

    var termTable = '<div class="bi-tablewrap"><table class="bi-table"><thead><tr><th>计价项</th><th>单价</th><th>计量单位</th><th>数量</th><th>金额（元）</th></tr></thead><tbody>' +
      C.terms.map(function (t) { return '<tr><td>' + E(t.item) + '</td><td>' + num0(t.unitPrice) + '</td><td>' + E(t.unitName) + '</td><td>' + num0(t.qty) + '</td><td>' + num0(t.amount) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';

    return sec('客户与账期现金流', '来源：KTCB 外包合同 · 工资表抬头',
      warn('数据边界：账期数据未提供',
        '甲方与合同计价来自企业提供的昆铁项目部外包合同；<b>结算账期与回款数据企业尚未提供</b>，因此账期与现金流字段留空、<b>不估算</b>。下方“垫资规模”用应发工资作为代理口径，须由财务替换为真实账期。') +
      '<div class="bi-kpi-grid">' +
      kpi('应发工资（' + ytdTag(ctx) + '）', num(wage), '万元', '垫资规模代理口径') +
      kpi('合同管理费提取', pct(C.managementRate), '', '按营业收入') +
      kpi('风险准备金提取', pct(C.reserveRate), '', '按营业收入') +
      kpi('账期台账', '待录入', '', '企业未提供回款数据') +
      '</div>') +
      sec('甲方与合同计价结构', 'KTCB 外包项目（一年一签）',
        '<div class="bi-grid-2"><div><h3 class="bi-minor-title">甲方 / 用工单位</h3>' + cpTable + '</div>' +
        '<div><h3 class="bi-minor-title">合同计价结构</h3>' + termTable + '</div></div>' +
        fold('说明', note('合同人数 ' + num0(C.headcount) + ' 人。管理费与风险准备金按营业收入比例提取，是合同级盈亏的关键参数。'))) +
      sec('垫资规模测算与账期台账', '以应发工资为代理口径',
        (function () {
          if (wage == null) return emptyBox('无工资数据', '');
          var months = mi + 1, avg = wage / months;
          var r = [0.5, 1, 1.5, 2];
          return '<div class="bi-tablewrap"><table class="bi-table"><thead><tr><th>账期假设（月）</th><th>占用资金（万元）</th><th>按 3.5% 年化测算（万元）</th></tr></thead><tbody>' +
            r.map(function (m) {
              var occ = avg * m;
              return '<tr><td>' + m + ' 个月</td><td>' + num(occ) + '</td><td>' + num(occ * 0.035 * (m / 12) * (12 / m) / 12 * m) + '</td></tr>';
            }).join('') + '</tbody></table></div>' +
            fold('测算口径', note('月均应发工资 ' + num(avg) + ' 万元（' + months + ' 个月）。<b>3.5% 为演示假设利率</b>，占用资金与资金成本需由财务按真实账期与融资成本替换。此测算仅说明“先垫工资、后结算”的资金占用规模，不是财务结论。'));
        })() +
        emptyBox('尚未提供结算账期与回款数据',
          '企业提供结算账期、开票与回款记录后，本页可自动计算：平均回款天数、超期应收、账龄分布与各甲方回款表现，并与垫资测算联动，给出资金缺口预警。原型不编造回款数据。'));

  }

  /* ================= 交互：社保补贴试算器 + 合同到期档位筛选 =================
     事件委托注册一次；页面由 render() 反复重建，委托在 document 上持续有效。 */
  (function () {
    function subsidy(kind, days) {
      var S = X() && X().socialStandard;
      if (!S) return null;
      var ladder = kind === 'intern' ? (S.intern || []) : (S.contract || []);
      if (!ladder.length) return null;
      var full = ladder[0].full;
      if (days == null || !isFinite(days) || days < 6) return { amt: 0, full: full, hit: '出勤 6 天以下不做补贴' };
      if (days >= 15) return { amt: full, full: full, hit: '满勤' };
      var row = ladder.filter(function (z) { return z.days === days; })[0];
      return row ? { amt: row.actual, full: full, hit: '差 ' + (15 - days) + ' 天' } : { amt: full, full: full, hit: '满勤' };
    }
    function paintCalc(box, kind, days) {
      var out = box.querySelector('[data-cx-out]'), meta = box.querySelector('[data-cx-meta]');
      var range = box.querySelector('[data-cx-days]'), numI = box.querySelector('[data-cx-days-num]');
      var r = subsidy(kind, days);
      if (!out) return;
      if (!r) { out.textContent = '阶梯数据未加载'; return; }
      out.textContent = num0(r.amt) + ' 元';
      if (meta) meta.textContent = r.hit + (r.hit === '满勤' ? ' · 与满额计提一致' : (r.amt === 0 ? ' · 本月不计提补贴' : ' · 较满额少 ' + num0(r.full - r.amt) + ' 元'));
      if (range && document.activeElement !== range) range.value = days;
      if (numI && document.activeElement !== numI) numI.value = days;
    }
    function calcKind(box) {
      var b = box.querySelector('.cx-calc-type.active');
      return b && b.getAttribute('data-cx-type') === 'intern' ? 'intern' : 'contract';
    }
    function calcDays(box) {
      var n = box.querySelector('[data-cx-days-num]'), r = box.querySelector('[data-cx-days]');
      var v = n && document.activeElement === n ? n.value : (r ? r.value : 15);
      v = parseInt(v, 10);
      if (!isFinite(v)) v = 15;
      return Math.max(0, Math.min(31, v));
    }
    document.addEventListener('input', function (e) {
      var box = e.target && e.target.closest ? e.target.closest('[data-cx-calc]') : null;
      if (!box) return;
      paintCalc(box, calcKind(box), calcDays(box));
    });
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-cx-type]') : null;
      if (t) {
        var box = t.closest('[data-cx-calc]');
        Array.prototype.forEach.call(box.querySelectorAll('[data-cx-type]'), function (b) { b.classList.remove('active'); });
        t.classList.add('active');
        paintCalc(box, calcKind(box), calcDays(box));
        return;
      }
      /* 合同到期档位筛选 */
      var chip = e.target && e.target.closest ? e.target.closest('[data-cx-expiry]') : null;
      if (!chip) return;
      var on = chip.classList.toggle('active');
      var wrap = chip.closest('.bi-section');
      var key = chip.getAttribute('data-cx-expiry');
      Array.prototype.forEach.call(chip.parentNode.querySelectorAll('[data-cx-expiry]'), function (c) { if (c !== chip) c.classList.remove('active'); });
      if (!wrap) return;
      Array.prototype.forEach.call(wrap.querySelectorAll('tr[data-cx-bucket]'), function (tr) {
        tr.style.display = (!on || tr.getAttribute('data-cx-bucket') === key) ? '' : 'none';
      });
    });
    /* 页面重渲染后按默认值重绘试算器 */
    if (root.MutationObserver) {
      new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          for (var j = 0; j < list[i].addedNodes.length; j++) {
            var n = list[i].addedNodes[j];
            if (n.nodeType !== 1) continue;
            var boxes = n.matches && n.matches('[data-cx-calc]') ? [n] : [];
            if (n.querySelectorAll) Array.prototype.forEach.call(n.querySelectorAll('[data-cx-calc]'), function (b) { boxes.push(b); });
            boxes.forEach(function (b) { paintCalc(b, 'contract', 15); });
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    }
  })();

  var api = { group: group, yoy: yoy, contract: contract, quality: quality, compliance: compliance, bidding: bidding, cashflow: cashflow };
  root.CaiXinExtraPages = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
