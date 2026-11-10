/* ==========================================================================
   才薪云 · AI 经营助手
   --------------------------------------------------------------------------
   设计原则（与原型既有的"真实性边界"一致）：
   1. 默认走本地引擎：自然语言解析 → 真实数据计算 → 管理决策手册。
      所有数字都由本机按导入数据实时算出，并给出算式与口径，可人工复核。
   2. 不编造：字段缺失就明说缺什么、补齐后能算什么。
   3. 可选接入大模型（OpenAI 兼容接口）。失败或未配置时自动回退本地引擎，
      并在答案上标注实际作答引擎。断网不影响演示。
   ========================================================================== */
(function (root) {
  'use strict';

  /* ======================= 0. 基础工具 ======================= */
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var f2 = function (v) { return (v == null || !isFinite(v)) ? '—' : Number(v).toFixed(2); };
  var p2 = function (v) { return (v == null || !isFinite(v)) ? '—' : (v * 100).toFixed(2) + '%'; };
  var pad2 = function (n) { return String(n).padStart(2, '0'); };
  var norm = function (v) {
    return String(v == null ? '' : v).normalize('NFKC').trim().toLowerCase()
      .replace(/[\s_\-（）()【】\[\]·，,。？?！!：:；;、"'"'']/g, '');
  };
  var has = function (a, b) { return a.indexOf(b) >= 0; };

  /* ======================= 1. 字段词典 ======================= */
  // bi 字段说明"BI 看板上的呈现位置"，用于回答"哪些数据看板上看不到"
  var FIELDS = [
    { key: 'revenue', name: '营业收入', aliases: ['营业收入', '销售额', '销售收入', '营收', '营业额', '收入金额', '收入'], unit: '万元', bi: '关键KPI · 整体业绩' },
    { key: 'invoice', name: '开票金额', aliases: ['开票金额', '已开票金额', '发票金额', '开票收入', '开票'], unit: '万元', bi: '整体业绩明细 · 数据口径' },
    { key: 'wage', name: '应发工资', aliases: ['应发工资', '工资总额', '应付工资', '薪酬总额', '工资支出', '人工成本', '人力成本', '薪酬', '工资'], unit: '万元', bi: '关键KPI · 费用专题 · 人效专题' },
    { key: 'deduction', name: '扣款记录', aliases: ['扣款记录', '扣款合计', '两类扣款', '考核扣款', '报废扣款', '扣款金额', '罚款', '扣款'], unit: '万元', bi: '关键KPI 仅显示合计' },
    { key: 'profit', name: '原表净利润', aliases: ['原表净利润', '经营净利润', '净利润', '经营利润', '净利', '利润'], unit: '万元', bi: '关键KPI · 毛利专题 · 整体业绩' },
    { key: 'grossProfit', name: '毛利润', aliases: ['原表毛利润', '毛利润', '毛利额', '毛利'], unit: '万元', bi: '毛利专题' },
    { key: 'social', name: '社保支出', aliases: ['社保支出', '社保费用', '社保成本', '五险一金', '五险', '社保'], unit: '万元', bi: '费用专题（仅汇总条）' },
    { key: 'support', name: '综合保障支出', aliases: ['综合保障支出', '综合保障费', '保障支出', '综合保障'], unit: '万元', bi: '费用专题（仅汇总条）' },
    { key: 'vat', name: '增值税', aliases: ['增值税', '销项税额', '销项税'], unit: '万元', bi: '费用专题（仅汇总条）' },
    { key: 'surtax', name: '附加税', aliases: ['附加税', '税金及附加'], unit: '万元', bi: '费用专题（仅汇总条）' },
    { key: 'management', name: '总部管理费', aliases: ['总部管理费', '管理费用', '管理费'], unit: '万元', bi: '费用专题（仅汇总条）' },
    { key: 'reserve', name: '风险准备金', aliases: ['风险准备金', '风险准备', '准备金'], unit: '万元', bi: '费用专题（仅汇总条）' },
    { key: 'headcount', name: '员工数量', aliases: ['员工数量', '在岗人数', '员工数', '人数'], unit: '人', stock: true, bi: '人效专题' },
    { key: 'inventoryBalance', name: '库存金额', aliases: ['库存金额', '库存余额', '存货余额', '库存'], unit: '万元', stock: true, bi: '库存专题' },
    { key: 'inventoryDays', name: '库存周转天数', aliases: ['库存周转天数', '存货周转天数', '周转天数'], unit: '天', stock: true, bi: '库存专题' }
  ];
  var RATIOS = [
    { key: 'wageRatio', name: '工资收入比', aliases: ['工资收入比', '工资占收入比', '工资占收入', '工资占比', '人力成本率', '人工成本率'], num: ['wage'], den: ['revenue'], pct: true, bi: '关键KPI · 人效专题' },
    { key: 'grossRatio', name: '毛利率', aliases: ['毛利率', '毛利占收入比', '毛利占比'], num: ['grossProfit'], den: ['revenue'], pct: true, bi: '毛利专题' },
    { key: 'netRatio', name: '净利率', aliases: ['净利率', '净利润率', '销售净利率', '利润率'], num: ['profit'], den: ['revenue'], pct: true, bi: '整体业绩明细' },
    { key: 'deductRatio', name: '扣款占收入比', aliases: ['扣款率', '扣款占收入比', '扣款占比', '扣款比例'], num: ['deduction'], den: ['revenue'], pct: true, bi: '未单独展示' },
    { key: 'costRatio', name: '七类费用占收入比', aliases: ['费用率', '费用占收入比', '成本费用率', '费用占比'], num: ['wage', 'social', 'support', 'vat', 'surtax', 'management', 'reserve'], den: ['revenue'], pct: true, bi: '费用专题（费用/收入卡片）' },
    { key: 'perHead', name: '人均收入', aliases: ['人均收入', '人均产值', '人均创收', '人效'], num: ['revenue'], den: ['headcount'], pct: false, unit: '万元/人', bi: '人效专题（当前缺员工数）' }
  ];
  var AGGREGATES = [
    { key: 'costTotal', name: '七类费用合计', aliases: ['七类费用', '费用合计', '总费用', '费用总额', '成本合计', '总成本', '费用'], agg: ['wage', 'social', 'support', 'vat', 'surtax', 'management', 'reserve'], unit: '万元' },
    { key: 'costExWage', name: '工资以外费用合计', aliases: ['工资以外的费用', '除工资外的费用', '工资外费用', '其他费用'], agg: ['social', 'support', 'vat', 'surtax', 'management', 'reserve'], unit: '万元' }
  ];
  var NAME_OF = {};
  FIELDS.concat(RATIOS, AGGREGATES).forEach(function (d) { NAME_OF[d.key] = d.name; });
  var UNLOCK = {
    headcount: '人均收入、人均创收（人效）、单位人工成本产出，以及"工资收入比偏高是价格问题还是人效问题"的判断',
    inventoryBalance: '库存金额趋势、库存占收入比、与周转天数的联动',
    inventoryDays: '库存周转天数趋势、周转效率与呆滞风险提示',
    invoice: '收入与开票差额、结算与开票时点差异、垫资与回款节奏',
    deduction: '扣款占收入比、扣款月度趋势、高扣款月份与客户的定位',
    social: '社保支出占收入比、社保与工资的比例关系、政策调整的敏感性',
    grossProfit: '毛利率、毛利润趋势、毛利与净利的差异归因',
    profit: '净利率、亏损月份识别、盈亏归因'
  };

  /* ======================= 2. 数据集 ======================= */
  function buildData() {
    var c = root.CaiXinData || {};
    var records = (c.records || []).filter(function (r) { return r && r.period; });
    var months = records.map(function (r) { return r.period; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
    var entities = records.map(function (r) { return String(r.entity || '当前项目'); }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var byPeriod = new Map();
    months.forEach(function (p) { byPeriod.set(p, records.filter(function (r) { return r.period === p; })); });

    function recsOf(p, entity) {
      var a = byPeriod.get(p) || [];
      return entity ? a.filter(function (r) { return String(r.entity || '当前项目') === entity; }) : a;
    }
    function sumKeys(recs, keys) {
      var any = false, t = 0;
      for (var i = 0; i < keys.length; i++) {
        var v = recs.filter(function (r) { return r[keys[i]] != null && isFinite(Number(r[keys[i]])); });
        if (v.length) { any = true; t += v.reduce(function (a, r) { return a + Number(r[keys[i]]); }, 0); }
      }
      return any ? t : null;
    }
    function series(spec, ms, entity) {
      return ms.map(function (p) {
        var recs = recsOf(p, entity), v = null;
        if (spec.ratio) {
          var n = sumKeys(recs, spec.ratio.num), d = sumKeys(recs, spec.ratio.den);
          v = (n != null && d != null && d > 0) ? n / d : null;
        } else if (spec.agg) { v = sumKeys(recs, spec.agg); }
        else { v = sumKeys(recs, [spec.key]); }
        return { period: p, value: v };
      });
    }
    function ratioOf(def, ms, entity) {
      var all = [];
      ms.forEach(function (p) { all = all.concat(recsOf(p, entity)); });
      var n = sumKeys(all, def.num), d = sumKeys(all, def.den);
      return (n != null && d != null && d > 0) ? n / d : null;
    }
    var totals = {}, coverage = {}, monthCov = {};
    FIELDS.forEach(function (f) {
      var v = records.filter(function (r) { return r[f.key] != null && isFinite(Number(r[f.key])); });
      totals[f.key] = v.length ? v.reduce(function (a, r) { return a + Number(r[f.key]); }, 0) : null;
      coverage[f.key] = v.length;
      monthCov[f.key] = months.filter(function (p) {
        return recsOf(p, null).some(function (r) { return r[f.key] != null && isFinite(Number(r[f.key])); });
      }).length;
    });
    return {
      records: records, months: months, entities: entities, byPeriod: byPeriod,
      recsOf: recsOf, sumKeys: sumKeys, series: series, ratioOf: ratioOf,
      totals: totals, coverage: coverage, monthCov: monthCov,
      source: c.source || '', isSample: !!c.isSample, month: c.month || '',
      findings: c.findings || [], decisions: c.decisions || {},
      years: months.map(function (p) { return Number(p.slice(0, 4)); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort()
    };
  }

  /* ======================= 3. 自然语言解析 ======================= */
  var CN = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  function cnNum(s) {
    if (CN[s] != null) return CN[s];
    if (/^十[一二三四五六七八九]$/.test(s)) return 10 + CN[s[1]];
    if (/^[一二三四五六七八九]十$/.test(s)) return CN[s[0]] * 10;
    if (/^[一二三四五六七八九]十[一二三四五六七八九]$/.test(s)) return CN[s[0]] * 10 + CN[s[2]];
    return null;
  }

  // 命中所有字段/比率/合计项，去掉被更长别名包住的短命中
  function pickFields(n) {
    var hits = new Map();
    function scan(def, aliases, kind) {
      aliases.forEach(function (a) {
        var na = norm(a);
        if (!na) return;
        var i = n.indexOf(na);
        if (i < 0) return;
        // "占收入比 / 占营业收入" 里的"收入"是分母，不是要查的指标，跳过
        if (def.key === 'revenue' && i > 0 && n[i - 1] === '占') return;
        var cur = hits.get(def.key);
        if (!cur || na.length > cur.score) hits.set(def.key, { def: def, kind: kind, alias: a, score: na.length, index: i, len: na.length });
      });
    }
    RATIOS.forEach(function (r) { scan(r, r.aliases, 'ratio'); });
    FIELDS.forEach(function (f) { scan(f, f.aliases, 'field'); });
    AGGREGATES.forEach(function (a) { scan(a, a.aliases, 'agg'); });
    var arr = Array.from(hits.values());
    arr = arr.filter(function (h) {
      return !arr.some(function (o) {
        return o.def.key !== h.def.key && o.index <= h.index && (o.index + o.len) >= (h.index + h.len) && o.score > h.score;
      });
    });
    return arr.sort(function (a, b) { return a.index - b.index; });
  }

  function finalizeScope(o, D) {
    o.requested = o.months.slice();
    var set = {};
    D.months.forEach(function (p) { set[p] = 1; });
    o.available = o.months.filter(function (p) { return set[p]; });
    o.missing = o.requested.filter(function (p) { return !set[p]; });
    if (o.kind === 'all') { o.available = D.months.slice(); o.label = o.label || '全部已导入月份'; }
    if (!o.label) o.label = o.available.length ? o.available.join('、') : '所选范围';
    return o;
  }

  function parseScope(n, D) {
    var Y = D.years.length ? D.years[D.years.length - 1] : new Date().getFullYear();
    var yh = n.match(/(20\d{2})/);
    var YY = yh ? Number(yh[1]) : Y;
    var out = { months: [], label: '', kind: 'all', explicit: false };
    var add = function (y, a, b) { for (var m = a; m <= b; m++) out.months.push(y + '-' + pad2(m)); };
    var m;

    m = n.match(/(20\d{2})\s*年?\s*(\d{1,2})\s*月?\s*(?:到|至|—|–|~|～|-)\s*(\d{1,2})\s*月/);
    if (m) { add(Number(m[1]), Number(m[2]), Number(m[3])); out.explicit = true; out.kind = 'range'; out.label = m[1] + '年' + m[2] + '—' + m[3] + '月'; return finalizeScope(out, D); }

    m = n.match(/(?:^|[^\d])(\d{1,2})\s*月?\s*(?:到|至|—|–|~|～|-)\s*(\d{1,2})\s*月/);
    if (m) { add(YY, Number(m[1]), Number(m[2])); out.explicit = true; out.kind = 'range'; out.label = YY + '年' + m[1] + '—' + m[2] + '月'; return finalizeScope(out, D); }

    var re = /(20\d{2})\s*(?:年|[-/.])\s*(\d{1,2})\s*月?/g, hit = false;
    while ((m = re.exec(n))) {
      var mm = Number(m[2]);
      if (mm >= 1 && mm <= 12) { out.months.push(m[1] + '-' + pad2(mm)); hit = true; }
    }
    // 紧凑写法 202603 / 20263
    if (!hit) {
      m = n.match(/(20\d{2})(0?[1-9]|1[0-2])(?!\d)/);
      if (m) { out.months.push(m[1] + '-' + pad2(Number(m[2]))); hit = true; }
    }
    if (hit) { out.explicit = true; out.kind = 'month'; return finalizeScope(out, D); }

    if (/上半年|前半年|上半年度/.test(n)) { add(YY, 1, 6); out.explicit = true; out.kind = 'range'; out.label = YY + '年上半年'; return finalizeScope(out, D); }
    if (/下半年|后半年/.test(n)) { add(YY, 7, 12); out.explicit = true; out.kind = 'range'; out.label = YY + '年下半年'; return finalizeScope(out, D); }
    if (/全年|一整年|整年/.test(n)) { add(YY, 1, 12); out.explicit = true; out.kind = 'range'; out.label = YY + '年全年'; return finalizeScope(out, D); }

    m = n.match(/第?([1-4一二三四])\s*季度/);
    if (m) { var q = cnNum(m[1]) || Number(m[1]); add(YY, (q - 1) * 3 + 1, q * 3); out.explicit = true; out.kind = 'range'; out.label = YY + '年第' + q + '季度'; return finalizeScope(out, D); }

    m = n.match(/(?:^|[^\d])(\d{1,2})\s*月(?!份)/);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) { out.months.push(YY + '-' + pad2(Number(m[1]))); out.explicit = true; out.kind = 'month'; return finalizeScope(out, D); }

    m = n.match(/最近\s*([一二三四五六七八九十\d]{1,3})\s*个?月/);
    if (m) {
      var k = cnNum(m[1]) || Number(m[1]);
      if (k > 0) { out.months = D.months.slice(-k); out.explicit = true; out.kind = 'recent'; out.label = '最近' + k + '个月'; return finalizeScope(out, D); }
    }
    if (/今年|本年度|年度累计|年度|ytd|截至/.test(n)) { add(YY, 1, 12); out.explicit = true; out.kind = 'ytd'; out.label = YY + '年累计'; return finalizeScope(out, D); }

    return finalizeScope(out, D);
  }

  function pickEntity(n, D) {
    var best = null;
    D.entities.forEach(function (e) {
      var ne = norm(e);
      if (ne && has(n, ne)) { if (!best || ne.length > best.len) best = { name: e, len: ne.length }; }
    });
    if (!best) {
      D.entities.forEach(function (e) {
        var short = norm(e).replace(/(项目部|项目|子公司|公司|部)$/, '');
        if (short.length >= 2 && has(n, short)) { if (!best || short.length > best.len) best = { name: e, len: short.length }; }
      });
    }
    var all = /(各项目|所有项目|分项目|项目排名|哪个项目|哪些项目|项目对比|各子公司|各公司|按项目)/.test(n);
    return { name: best ? best.name : null, all: all };
  }

  function parseIntent(n) {
    var checks = [
      ['coverage', /(覆盖|字段|数据来源|数据口径|来源|缺什么|缺失|没有数据|没数据|未提供|有哪些数据|有什么数据|数据清单|能查什么|哪些字段)/],
      ['help', /(帮助|你会什么|能做什么|怎么用|使用说明|有什么功能)/],
      ['count', /(几个月|多少条|几条|记录数|有多少个月)/],
      ['mom', /(环比|比上月|上个月|较上月|同比|去年同期)/],
      ['rank', /(排名|排序|排行榜|前\s*\d|前三|前几|第几|top\s*\d)/i],
      ['max', /(最高|最大|最多|最好|最赚|峰值|最强)/],
      ['min', /(最低|最小|最少|最差|最亏|垫底)/],
      ['avg', /(平均|均值|月均)/],
      ['compare', /(对比|相比|比较|差异|差多少|差额|vs\b)/i],
      ['sum', /(合计|总共|一共|累计|加起来|总和|加总|共多少)/],
      ['trend', /(趋势|走势|变化|波动|逐月|增长|下滑|上升|下降|涨了|跌了)/],
      ['detail', /(明细|分别是|列出|列表|清单|各月|每个月|多少|是多少|具体|每一项)/]
    ];
    for (var i = 0; i < checks.length; i++) if (checks[i][1].test(n)) return checks[i][0];
    return null;
  }

  function fmtVal(def, v) {
    if (v == null || !isFinite(v)) return null;
    if (def.pct) return (v * 100).toFixed(2) + '%';
    if (def.unit === '人') return String(Math.round(v));
    if (def.unit === '天') return v.toFixed(1);
    return v.toFixed(2);
  }
  function specOf(hit) {
    if (hit.kind === 'ratio') return { ratio: { num: hit.def.num, den: hit.def.den } };
    if (hit.kind === 'agg') return { agg: hit.def.agg };
    return { key: hit.def.key };
  }
  function unitOf(def) { return def.pct ? '%' : (def.unit || '万元'); }
  // 带正负号的变化量文本（比率用"个百分点"，金额用单位）
  function deltaVal(def, d) {
    if (d == null || !isFinite(d)) return '—';
    return (d >= 0 ? '+' : '') + (def.pct ? (d * 100).toFixed(2) + ' 个百分点' : f2(d) + (def.unit || '万元'));
  }
  function magVal(def, d) {
    if (d == null || !isFinite(d)) return '—';
    return def.pct ? (Math.abs(d) * 100).toFixed(2) + ' 个百分点' : f2(Math.abs(d)) + (def.unit || '万元');
  }

  /* ======================= 4. 数据问答 ======================= */
  function answerData(P, D) {
    var sc = P.scope, months = sc.available, n = P.n;
    if (!D.records.length) {
      return { kind: 'error', title: '还没有导入数据', lead: E('请先在「核对工作台 → 导入数据」里加载示例或导入 Excel / CSV，我就能基于真实数据回答。') };
    }
    if (!months.length) {
      return {
        kind: 'error', title: '所选月份没有记录',
        lead: E('数据里没有 ' + (sc.requested.join('、') || sc.label) + ' 的记录。已导入的月份是 ' + D.months.join('、') + '。'),
        notes: ['来源：' + E(D.source)]
      };
    }
    var hit = P.fields[0];
    if (!hit) return answerCoverage(P, D);

    var def = hit.def, spec = specOf(hit), unitLabel = unitOf(def), unit = def.pct ? '' : unitLabel;
    var rows = D.series(spec, months, P.entity.name).filter(function (x) { return x.value != null; });

    // 字段整体缺失（如员工数量、库存）——诚实说明，不估算
    if (hit.kind === 'field' && D.monthCov[def.key] === 0) {
      return {
        kind: 'data', title: def.name + '：当前数据未提供',
        lead: E('导入的数据里没有「' + def.name + '」字段（覆盖 0/' + D.months.length + ' 个月），所以这个问题现在算不出来。原型不会用其他字段替它估算。'),
        blocks: [{
          t: '需要补什么', type: 'kv', items: [
            { k: '缺失字段', v: def.name + '（月度汇总即可，无需个人明细）' },
            { k: '补齐后能回答', v: UNLOCK[def.key] || '相关的月度对比与趋势问题' },
            { k: '现在能算的替代口径', v: altText(def.key, D) }
          ]
        }],
        notes: ['来源：' + E(D.source), '口径：缺失字段不补零、不估算；这是原型刻意保留的数据边界。'],
        followups: ['现在还有哪些字段没有数据？', '工资收入比最高的月份是几月？', '上半年哪个月扣款最高？']
      };
    }
    if (!rows.length) {
      return {
        kind: 'data', title: def.name + '：所选范围无有效值',
        lead: E('在 ' + months.join('、') + ' 这 ' + months.length + ' 个月里，「' + def.name + '」没有可用数值。'),
        notes: ['覆盖情况：' + D.monthCov[def.key] + '/' + D.months.length + ' 个月有值（全量）', '来源：' + E(D.source)],
        followups: ['现在还有哪些字段没有数据？']
      };
    }

    var vals = rows.map(function (x) { return x.value; });
    var sum = vals.reduce(function (a, b) { return a + b; }, 0);
    var stockNote = false;
    var avg = sum / vals.length;
    var sorted = rows.slice().sort(function (a, b) { return b.value - a.value; });
    var hi = sorted[0], lo = sorted[sorted.length - 1];
    var intent = P.intent || 'detail';
    var lead = '', table = null, blocks = [];
    var label = P.entity.name ? '（' + E(P.entity.name) + '）' : '';
    var title = def.name + ' · ' + (sc.label || (months.length === 1 ? months[0] : months.join('、'))) + label;

    function rowsFor(rs, withRank, withMom) {
      return rs.map(function (x, i) {
        var idx = months.indexOf(x.period);
        var prev = idx > 0 ? D.series(spec, [months[idx - 1]], P.entity.name)[0].value : null;
        var mom = (prev != null && prev !== 0 && x.value != null) ? ((x.value - prev) / Math.abs(prev)) : null;
        var cells = [];
        if (withRank) cells.push('<span class="ai-rank">' + (i + 1) + '</span>');
        cells.push(x.period);
        cells.push('<span class="' + (x.value < 0 ? 'ai-neg' : '') + '">' + fmtVal(def, x.value) + '</span>');
        if (withMom) cells.push(mom == null ? '<span class="ai-dim">—</span>' : (mom >= 0 ? '+' : '') + (mom * 100).toFixed(1) + '%');
        return cells;
      });
    }
    var cols = ['月份', def.name + '（' + unitLabel + '）', '环比'];
    var colsRank = ['#', '月份', def.name + '（' + unitLabel + '）'];

    if (P.entity.all && D.entities.length > 1) {
      // 按项目横向对比
      var per = D.entities.map(function (e) {
        var all = [], cov = 0;
        months.forEach(function (p) {
          var rs = D.recsOf(p, e);
          if (rs.some(function (r) { return r[def.key] != null || (hit.kind === 'ratio' && r[def.den[0]] != null); })) cov++;
          all = all.concat(rs);
        });
        var v = null;
        if (hit.kind === 'ratio') {
          var a = D.sumKeys(all, def.num), b = D.sumKeys(all, def.den);
          v = (a != null && b != null && b > 0) ? a / b : null;
        } else if (hit.kind === 'agg') { v = D.sumKeys(all, def.agg); }
        else { v = D.sumKeys(all, [def.key]); }
        return { entity: e, value: v, cov: cov };
      }).filter(function (x) { return x.value != null; })
        .sort(function (a, b) { return intent === 'min' ? a.value - b.value : b.value - a.value; });
      var top = per[0], bottom = per[per.length - 1];
      title = def.name + ' · 项目维度 · ' + sc.label;
      lead = per.length
        ? '按 ' + sc.label + ' 累计，<b>' + E(top.entity) + '</b> 的' + def.name + (intent === 'min' ? '最低' : '最高') + '，为 <b>' + fmtVal(def, top.value) + unit + '</b>；'
          + (per.length > 1 ? (intent === 'min' ? '最高是 ' : '最低是 ') + E(bottom.entity) + '（' + fmtVal(def, bottom.value) + unit + '）。' : '')
        : '这些月份里没有可比较的项目数据。';
      table = {
        caption: def.name + ' · 项目维度累计（' + sc.label + '）',
        columns: ['#', '项目 / 子公司', def.name + '（' + unitLabel + '）', def.pct ? '有值月份' : '占合计'],
        rows: per.map(function (x, i) {
          return ['<span class="ai-rank">' + (i + 1) + '</span>', E(x.entity),
            '<span class="' + (x.value < 0 ? 'ai-neg' : '') + '">' + fmtVal(def, x.value) + '</span>',
          def.pct ? (x.cov + '/' + months.length + '月') : (sum !== 0 ? (x.value / sum * 100).toFixed(1) + '%' : '—')];
        })
      };
      blocks.push({ t: '口径提示', type: 'bullets', items: ['项目排名是各项目在所选月份的累计对比，不代表集团合并口径；月份覆盖不同会影响可比性。', '比率类指标在项目维度用"先汇总再相除"计算，不能把各项目比率相加。'] });
    } else if (P.fields.length >= 2 && (intent === 'sum' || /占收入|占营业收入|收入比|合计|加起来/.test(n))) {
      // 多字段求和（可选"占收入比"）
      var defs3 = P.fields.slice(0, 6), allRecs = [];
      months.forEach(function (p) { allRecs = allRecs.concat(P.entity.name ? D.recsOf(p, P.entity.name) : D.recsOf(p, null)); });
      var parts3 = defs3.map(function (h) {
        var v;
        if (h.kind === 'agg') v = D.sumKeys(allRecs, h.def.agg);
        else if (h.kind === 'ratio') { var a = D.sumKeys(allRecs, h.def.num), b = D.sumKeys(allRecs, h.def.den); v = (a != null && b != null && b > 0) ? a / b : null; }
        else v = D.sumKeys(allRecs, [h.def.key]);
        return { name: h.def.name, v: v, pct: !!h.def.pct, unit: unitOf(h.def) };
      });
      var tot3 = parts3.reduce(function (a, x) { return a + (x.v || 0); }, 0);
      var rev3 = D.sumKeys(allRecs, ['revenue']);
      var ratio3 = (rev3 != null && rev3 > 0) ? tot3 / rev3 : null;
      title = defs3.map(function (h) { return h.def.name; }).join(' + ') + ' · ' + sc.label;
      lead = defs3.map(function (h) { return E(h.def.name); }).join(' + ') + ' 合计 <b>' + f2(tot3) + ' 万元</b>'
        + (ratio3 != null ? '，占营业收入 <b>' + p2(ratio3) + '</b>（营业收入 ' + f2(rev3) + ' 万元）' : '') + '。';
      blocks.push({
        t: '构成与占比', type: 'kv', items: parts3.map(function (x) {
          return { k: x.name, v: (x.pct ? fmtVal({ pct: true }, x.v) : f2(x.v) + ' 万元') + (ratio3 != null && !x.pct && tot3 ? '　占收入 ' + p2(x.v / rev3) : '') };
        }).concat([
          { k: '合计', v: '<b>' + f2(tot3) + ' 万元</b>' + (ratio3 != null ? '，占营业收入 ' + p2(ratio3) : '') },
          { k: '计算范围', v: months.join('、') + '（' + months.length + ' 个月）' }
        ])
      });
    } else if (P.fields.length >= 2) {
      // 多字段对照
      var defs = P.fields.slice(0, 4);
      title = defs.map(function (h) { return h.def.name; }).join(' / ') + ' · ' + sc.label;
      var seriesAll = defs.map(function (h) { return { def: h.def, rows: D.series(specOf(h), months, P.entity.name) }; });
      table = {
        caption: defs.map(function (h) { return h.def.name; }).join(' / ') + ' 对照（' + months.join('、') + '）',
        columns: ['月份'].concat(defs.map(function (h) { return h.def.name + '（' + unitOf(h.def) + '）'; })),
        rows: months.map(function (p) {
          return [p].concat(seriesAll.map(function (s) {
            var x = s.rows.filter(function (r) { return r.period === p; })[0];
            var v = x ? x.value : null;
            return v == null ? '<span class="ai-dim">—</span>' : '<span class="' + (v < 0 ? 'ai-neg' : '') + '">' + fmtVal(s.def, v) + '</span>';
          }));
        })
      };
      if (months.length === 1) {
        lead = months[0] + '：' + seriesAll.map(function (s) {
          var x = s.rows.filter(function (r) { return r.period === months[0]; })[0];
          var v = x ? x.value : null;
          return E(s.def.name) + ' <b>' + (v == null ? '当前未提供' : fmtVal(s.def, v) + (s.def.pct ? '' : unitOf(s.def))) + '</b>';
        }).join('，') + '。';
      } else {
        var allMoney = defs.every(function (h) { return !h.def.pct; });
        lead = '已按月份列出 ' + defs.map(function (h) { return E(h.def.name); }).join('、') + ' 的对照表。'
          + (allMoney ? '这些字段都是金额口径，可以直接比较差额。' : '金额与比率口径不同，只能横向观察走势，不能直接相减。');
      }
    } else if (intent === 'rank') {
      lead = def.name + '从高到低：<b>' + hi.period + ' ' + fmtVal(def, hi.value) + unit + '</b> 最高，' + lo.period + ' ' + fmtVal(def, lo.value) + unit + ' 最低。';
      table = { caption: def.name + ' · 月度排名', columns: colsRank, rows: rowsFor(sorted, true, false) };
    } else if (intent === 'max') {
      lead = rows.length > 1
        ? '<b>' + hi.period + '</b> 的' + def.name + '最高，为 <b>' + fmtVal(def, hi.value) + unit + '</b>；其次是 ' + sorted[1].period + '（' + fmtVal(def, sorted[1].value) + unit + '）。'
        : def.name + '为 <b>' + fmtVal(def, hi.value) + unit + '</b>。';
      table = { caption: def.name + ' · 从高到低', columns: colsRank, rows: rowsFor(sorted.slice(0, 6), true, false) };
    } else if (intent === 'min') {
      lead = rows.length > 1
        ? '<b>' + lo.period + '</b> 的' + def.name + '最低，为 <b>' + fmtVal(def, lo.value) + unit + '</b>。'
        : def.name + '为 <b>' + fmtVal(def, lo.value) + unit + '</b>。';
      table = { caption: def.name + ' · 从低到高', columns: colsRank, rows: rowsFor(sorted.slice().reverse().slice(0, 6), true, false) };
    } else if (intent === 'sum' && def.stock) {
      var hiS = rows[0], loS = rows[rows.length - 1];
      lead = '「' + def.name + '」是时点值，' + months.length + ' 个月不能相加：它在 ' + rows.length + ' 个有值月份里，最高 ' + E(hiS.period) + '（<b>' + fmtVal(def, hiS.val) + unit + '</b>），最低 ' + E(loS.period) + '（<b>' + fmtVal(def, loS.val) + unit + '</b>）。';
      table = { caption: def.name + ' · 月度明细（时点值，跨月不相加）', columns: cols, rows: rowsFor(rows, false, true) };
      stockNote = true;
    } else if (intent === 'sum') {
      lead = def.pct
        ? '所选 ' + months.length + ' 个月的' + def.name + '（区间口径：先分别汇总再相除）为 <b>' + fmtVal(def, D.ratioOf(def, months, P.entity.name)) + '</b>。'
        : '所选 ' + months.length + ' 个月的' + def.name + '合计 <b>' + fmtVal(def, sum) + unit + '</b>。';
      table = { caption: def.name + ' · 月度明细', columns: cols, rows: rowsFor(rows, false, true) };
    } else if (intent === 'avg') {
      lead = '所选 ' + months.length + ' 个月的' + def.name + '月均 <b>' + fmtVal(def, avg) + unit + '</b>。';
      table = { caption: def.name + ' · 月度明细', columns: cols, rows: rowsFor(rows, false, true) };
    } else if (intent === 'mom') {
      var last = rows[rows.length - 1], prevIdx = months.indexOf(last.period) - 1;
      var prevV = prevIdx >= 0 ? D.series(spec, [months[prevIdx]], P.entity.name)[0].value : null;
      if (/同比|去年同期/.test(n)) {
        lead = E('当前导入数据只有 ' + D.years.join('、') + ' 年，没有上年同口径数据，<b>无法计算同比</b>。原型不估算同比，下面给的是环比。');
      } else {
        lead = '最新月份 <b>' + last.period + '</b> 的' + def.name + '为 <b>' + fmtVal(def, last.value) + unit + '</b>，'
          + (prevV == null ? '上月没有同口径数据。' : '上月（' + months[prevIdx] + '）为 ' + fmtVal(def, prevV) + unit + '，变化 <b>' + deltaVal(def, last.value - prevV) + '</b>。');
      }
      table = { caption: def.name + ' · 月度明细', columns: cols, rows: rowsFor(rows, false, true) };
      blocks.push({ t: '关于同比', type: 'bullets', items: ['企业提供的是单年数据，缺少上年同期同口径值，所以同比留空而不是用估算值填充。'] });
    } else if (intent === 'trend') {
      var first = rows[0], lastR = rows[rows.length - 1];
      var delta = lastR.value - first.value;
      lead = months.length > 1
        ? '从 ' + first.period + ' 的 ' + fmtVal(def, first.value) + unit + ' 到 ' + lastR.period + ' 的 <b>' + fmtVal(def, lastR.value) + unit + '</b>，累计' + (delta >= 0 ? '增加' : '减少') + ' <b>' + magVal(def, delta) + '</b>；区间最高 ' + hi.period + '（' + fmtVal(def, hi.value) + unit + '），最低 ' + lo.period + '（' + fmtVal(def, lo.value) + unit + '）。'
        : def.name + '为 ' + fmtVal(def, first.value) + unit + '，只有一个月份，看不出趋势。';
      table = { caption: def.name + ' · 月度走势', columns: cols, rows: rowsFor(rows, false, true) };
    } else if (intent === 'compare') {
      lead = months.length > 1
        ? months[months.length - 1] + ' 与 ' + months[0] + ' 相比：' + def.name + '由 ' + fmtVal(def, rows[0].value) + unit + ' 变为 <b>' + fmtVal(def, rows[rows.length - 1].value) + unit + '</b>。'
        : def.name + '为 ' + fmtVal(def, rows[0].value) + unit + '。';
      table = { caption: def.name + ' · 月度对照', columns: cols, rows: rowsFor(rows, false, true) };
    } else {
      var leadSum;
      if (def.pct) { leadSum = def.name + '（区间口径：先分别汇总再相除）为 <b>' + fmtVal(def, D.ratioOf(def, months, P.entity.name)) + '</b>'; }
      else { leadSum = def.name + '合计 <b>' + fmtVal(def, sum) + unit + '</b>'; }
      lead = def.stock
        ? (rows.length > 1
          ? '「' + def.name + '」是时点值，' + months.length + ' 个月不能相加：它在 ' + rows.length + ' 个有值月份里，最高 ' + hi.period + '（<b>' + fmtVal(def, hi.value) + unit + '</b>），最低 ' + lo.period + '（<b>' + fmtVal(def, lo.value) + unit + '</b>）。'
          : (months[0] + ' 的' + def.name + '为 <b>' + fmtVal(def, rows[0].value) + unit + '</b>。'))
        : (rows.length > 1
          ? '所选 ' + months.length + ' 个月的' + leadSum + '；最高 ' + hi.period + '（' + fmtVal(def, hi.value) + unit + '），最低 ' + lo.period + '（' + fmtVal(def, lo.value) + unit + '）。'
          : (months[0] + ' 的' + def.name + '为 <b>' + fmtVal(def, rows[0].value) + unit + '</b>。'));
      table = { caption: def.name + (def.stock ? ' · 月度明细（时点值，跨月不相加）' : ' · 月度明细'), columns: cols, rows: rowsFor(rows, false, true) };
      if (def.stock) stockNote = true;
    }

    // 问题里问"占收入比"时，单字段答案补一段占比（比率类指标本身已是占比，不重复）
    if (P.fields.length === 1 && hit.kind !== 'ratio' && /占收入|占营业收入|收入占比/.test(n)) {
      var rvAll = [];
      months.forEach(function (p) { rvAll = rvAll.concat(P.entity.name ? D.recsOf(p, P.entity.name) : D.recsOf(p, null)); });
      var rvSum = D.sumKeys(rvAll, ['revenue']);
      var numSum = hit.kind === 'agg' ? D.sumKeys(rvAll, def.agg) : D.sumKeys(rvAll, [def.key]);
      if (rvSum && rvSum > 0 && numSum != null) {
        blocks.push({
          t: '占收入比', type: 'kv', items: [
            { k: def.name + '合计', v: f2(numSum) + ' 万元' },
            { k: '营业收入合计', v: f2(rvSum) + ' 万元' },
            { k: '占比', v: '<b>' + p2(numSum / rvSum) + '</b>' }
          ]
        });
        lead += ' 占营业收入 <b>' + p2(numSum / rvSum) + '</b>。';
      }
    }

    return {
      kind: 'data', title: title, lead: lead, table: table, blocks: blocks,
      notes: [
        '口径：' + caliberOf(hit),
        '范围：' + months.join('、') + '（' + months.length + ' 个月）' + (P.entity.name ? '，项目：' + P.entity.name : ''),
        '单位：' + unitLabel + '；数据来源：' + D.source,
        'BI 看板位置：' + (def.bi || '未单独展示') + '。问答可以按任意月份 / 项目 / 字段组合查询，并给出算式。'
      ].concat(stockNote ? ['时点值口径：「' + def.name + '」只在编制时点有意义，跨月不相加、也不给区间合计；只看趋势与结构。'] : []),
      followups: followupsFor(hit, D, P)
    };
  }

  function caliberOf(hit) {
    if (hit.kind === 'ratio') return hit.def.name + ' = ' + hit.def.num.map(function (k) { return NAME_OF[k]; }).join(' + ') + ' ÷ ' + hit.def.den.map(function (k) { return NAME_OF[k]; }).join(' + ') + '（先分别汇总再相除，仅在分子分母都有值的月份参与）';
    if (hit.kind === 'agg') return hit.def.name + ' = ' + hit.def.agg.map(function (k) { return NAME_OF[k]; }).join(' + ');
    return hit.def.name + '直接取自导入源表的对应字段，未做调整';
  }
  function altText(key, D) {
    if (key === 'headcount') return '目前只能用「工资收入比」看人力成本压力（当前 ' + p2(D.ratioOf(RATIOS[0], D.months, null)) + '），但无法判断是价格问题还是人效问题';
    if (key === 'inventoryDays') return '库存周转天数无法用经营利润表推算，需要月度库存汇总表';
    return '暂时没有替代口径，原型不做推算';
  }
  function followupsFor(hit, D, P) {
    var out = [];
    var name = hit.def.name;
    if (hit.kind !== 'ratio') out.push(name + '最高的月份是几月？');
    if (hit.def.key !== 'revenue') out.push(name + '和营业收入对比');
    out.push('上半年哪个月扣款最高？');
    out.push('如果工资整体上涨 5%，净利率会掉到多少？');
    return out.slice(0, 3);
  }

  function answerCoverage(P, D) {
    if (!D.records.length) {
      return { kind: 'error', title: '还没有导入数据', lead: E('请先导入数据，我再告诉你哪些字段有值、哪些还缺。') };
    }
    var rows = FIELDS.map(function (f) {
      var cov = D.monthCov[f.key];
      var bar = cov === 0 ? '<span class="ai-dim">无数据</span>' : cov + '/' + D.months.length + ' 个月';
      return [f.name, bar, f.bi, cov === 0 ? '<span class="ai-neg">需补数据</span>' : '可问答'];
    });
    var missing = FIELDS.filter(function (f) { return D.monthCov[f.key] === 0; }).map(function (f) { return f.name; });
    var partly = FIELDS.filter(function (f) { return D.monthCov[f.key] > 0 && D.monthCov[f.key] < D.months.length; }).map(function (f) { return f.name + '（' + D.monthCov[f.key] + '/' + D.months.length + '）'; });
    return {
      kind: 'data', title: '数据覆盖与可查询范围',
      lead: '当前导入 <b>' + D.records.length + '</b> 条月度记录，覆盖 <b>' + D.months.length + '</b> 个月（' + D.months[0] + ' — ' + D.months[D.months.length - 1] + '）'
        + (D.entities.length > 1 ? '、<b>' + D.entities.length + '</b> 个项目。' : '，只有 1 个项目。')
        + (missing.length ? '其中 <b>' + E(missing.join('、')) + '</b> 完全没有数据。' : '全部字段都有数据。'),
      table: { caption: '字段覆盖与 BI 展示位置', columns: ['字段', '覆盖', 'BI 看板位置', '问答可用性'], rows: rows },
      blocks: [{
        t: '可以这样问', type: 'bullets', items: [
          '按任意月份查单项：<b>3月社保支出和总部管理费各是多少</b>',
          '极值与排名：<b>上半年哪个月扣款最高</b>、<b>各月毛利率排名</b>',
          '组合对比：<b>收入和工资对比</b>、<b>费用合计占收入比是多少</b>',
          '跨字段推导：<b>工资收入比最高的月份</b>、<b>扣款率是多少</b>'
        ]
      }],
      notes: [
        'BI 看板按固定专题展示汇总值；问答可以按任意月份 / 项目 / 字段组合取数，并给出算式与口径。',
        partly.length ? '部分月份有值的字段：' + partly.join('、') + '；缺的月份不会补零。' : '所有有值字段都是整期覆盖。',
        '来源：' + D.source
      ],
      followups: ['3月社保支出和总部管理费各是多少？', '上半年哪个月扣款最高？', '现在还有哪些字段没有数据？']
    };
  }

  /* ======================= 5. 管理决策手册 ======================= */
  function seriesSorted(D, key, months) {
    return D.series({ key: key }, months, null).filter(function (x) { return x.value != null; });
  }

  // 注意：不能用裸的"利率"，否则"净利率 / 毛利率 / 利润率"会被误判为利率情景
  var RATE_RE = /(^|[^净毛润])利率|lpr|融资成本|资金成本|贷款利率|利息/;

  var PLAYBOOKS = [
    /* ---- 利率上升 ---- */
    {
      id: 'rate-up', title: '利率上行 / 融资成本上升：管理动作',
      test: function (n) { return RATE_RE.test(n) && /(上升|上调|上涨|走高|上行|变高|提高|涨)/.test(n); },
      head: function (D) { return '利率上行直接推高垫资成本，而你所在的人力外包业务是"先垫工资社保、后向客户结算"，<b>垫资规模越大，冲击越明显</b>。当前应发工资合计 ' + f2(D.totals.wage) + ' 万元，就是主要的垫资源头。'; },
      chain: [
        ['融资利率上行', '垫资资金成本上升', '工资、社保按月先付，客户按账期后结，中间的资金缺口要自己承担'],
        ['资金成本上升', '单位经济性被侵蚀', '同样的合同价，账期越长、亏得越多'],
        ['客户侧', '延付倾向上升', '客户融资也变贵，回款账期容易被进一步拉长，形成双杀'],
        ['应对重心', '从"抢规模"转向"管账期"', '垫资型业务的胜负手从价格变成回款速度']
      ],
      sens: function (D) {
        var out = [], w = D.totals.wage, n = D.months.length;
        if (w != null && n) {
          var mw = w / n, adv = mw * 1.5, cost = adv * 0.0025;
          out.push({ label: '垫资规模代理（月均）', value: f2(mw) + ' 万元', calc: '应发工资合计 ' + f2(w) + ' ÷ ' + n + ' 个月', note: '以应发工资作为垫资源头的代理变量，不是企业实际融资余额。' });
          out.push({ label: '利率上行 25BP 的额外资金成本（估算）', value: f2(cost) + ' 万元/年', calc: f2(mw) + ' × 账期 1.5 个月 × 0.25%', note: '账期 1.5 个月为演示假设，需用企业实际平均账期替换。' });
          if (D.totals.profit != null && D.totals.profit > 0) out.push({ label: '相当于本年已导入净利润的', value: (cost / D.totals.profit * 100).toFixed(1) + '%', calc: f2(cost) + ' ÷ ' + f2(D.totals.profit), note: '用来判断账期管理该投入多少精力。' });
        }
        var wr = D.ratioOf(RATIOS[0], D.months, null);
        if (wr != null) out.push({ label: '当前工资收入比', value: p2(wr), calc: '应发工资合计 ÷ 营业收入合计', note: '比例越高，垫资强度越大，对利率越敏感。' });
        return out.length ? out : [{ label: '暂无可测算数据', value: '—', calc: '需要应发工资与营业收入字段', note: '导入后可自动测算。' }];
      },
      actions: [
        { t: '把"账期 × 资金成本"写进合同报价模型', d: '给每个客户按实际账期单独定价，账期超过基准的按新利率加成，不再沿用统一报价。', h: '30天内', kpi: '新签合同资金占用条款覆盖率' },
        { t: '建立应收账款账龄台账并按周盯', d: '把开票、结算、回款三个时点分开记录，识别"收入已确认但钱没到"的月份。', h: '本月起', kpi: '逾期应收占比、平均回款天数' },
        { t: '对垫资型项目设准入门槛', d: '无回款保障、无历史履约记录的项目，不接或要求预付/缩短账期。', h: '本季度', kpi: '垫资型项目占比、坏账准备' },
        { t: '压缩非必要规模扩张', d: '利率上行期，规模扩张的边际收益下降，优先保住现有项目的回款质量。', h: '持续', kpi: '收入增长与应收增长是否同步' }
      ],
      metrics: ['工资收入比', '应收账款周转天数', '开票与收入差额', '净利率'],
      risks: [
        '<b>不要用降价换回款</b>：降价会让本已变薄的利润进一步承压，优先用账期和结算条款谈判。',
        '利率上行时客户延付更常见，需把"客户经营状况"纳入续约评审，而不是只看合同金额。',
        '以上测算基于应发工资的代理假设，实际影响取决于企业融资结构、存量利率与实际账期，须由财务确认。'
      ],
      followups: ['如果利率下降 25 个基点，我们该做什么管理决策？', '开票金额和营业收入差多少？', '上半年工资收入比是多少？']
    },
    /* ---- 利率下降 ---- */
    {
      id: 'rate-down', title: '利率下行：管理动作与红利分配',
      test: function (n) { return RATE_RE.test(n); },
      head: function (D) { return '利率下行对人力外包是<b>双刃剑</b>：一方面直接降低"先垫工资、后结算"的资金成本；另一方面降息通常伴随需求走弱，客户更容易拖长账期，可能把降息红利吃掉。当前应发工资合计 ' + f2(D.totals.wage) + ' 万元，是主要垫资源头。'; },
      chain: [
        ['外部利率下行', '公司融资 / 保理成本下降', '人力外包与派遣是"先垫付工资社保、后向客户结算"的模式'],
        ['资金成本下降', '垫资型业务的单位经济性改善', '相同账期下，占用资金的成本变低'],
        ['客户需求走弱', '回款账期被拉长', '降息常伴随需求下行，客户延付倾向上升'],
        ['收益分配选择', '决定"让利换规模"还是"留存改利润"', '全部让给客户则净利率不变；留存下来则直接改善净利率']
      ],
      sens: function (D) {
        var out = [], w = D.totals.wage, n = D.months.length;
        if (w != null && n) {
          var mw = w / n, adv = mw * 1.5, save = adv * 0.0025;
          out.push({ label: '垫资规模代理（月均）', value: f2(mw) + ' 万元', calc: '应发工资合计 ' + f2(w) + ' ÷ ' + n + ' 个月', note: '应发工资是主要垫资源头，这里作为代理变量，不是企业实际融资余额。' });
          out.push({ label: '降息 25BP 对应年化资金成本节约（估算）', value: f2(save) + ' 万元', calc: f2(mw) + ' × 账期 1.5 个月 × 0.25%', note: '账期 1.5 个月为演示假设；实际节约取决于融资结构与存量利率。' });
          if (D.totals.profit != null && D.totals.profit > 0) out.push({ label: '相当于本年已导入净利润的', value: (save / D.totals.profit * 100).toFixed(1) + '%', calc: f2(save) + ' ÷ ' + f2(D.totals.profit), note: '这是"要不要把红利让给客户"的判断基准。' });
        }
        var wr = D.ratioOf(RATIOS[0], D.months, null), nr = D.ratioOf(RATIOS[2], D.months, null);
        if (wr != null) out.push({ label: '当前工资收入比', value: p2(wr), calc: '应发工资合计 ÷ 营业收入合计', note: '比例越高说明垫资强度越大，降息对你的影响也越大。' });
        if (nr != null) out.push({ label: '当前净利率', value: p2(nr), calc: '原表净利润合计 ÷ 营业收入合计', note: '降息省下的资金成本相当于在净利率上"加"了多厚的一层缓冲。' });
        return out.length ? out : [{ label: '暂无可测算数据', value: '—', calc: '需要应发工资与营业收入字段', note: '导入后可自动测算。' }];
      },
      actions: [
        { t: '重算合同里的资金占用条款', d: '把"账期 × 资金成本"显式写进报价模型，利率下行后按新利率重算，避免沿用过时报价。', h: '30天内', kpi: '新签合同资金占用条款覆盖率' },
        { t: '明确红利分配原则，别默认让利', d: '先决定节约的资金成本是"留存改善利润"还是"部分让给客户换规模"，并写下决策依据。', h: '本季度', kpi: '资金成本节约的留存比例' },
        { t: '优先扩大"有回款保障"的垫资型业务', d: '利率下行期资金便宜，但只对回款有保障的客户扩张；对账期不明确的客户维持原规模。', h: '持续', kpi: '新增业务平均回款天数' },
        { t: '把降息红利投向回款管理而不是降价', d: '用节约的成本投入对账、催收与结算系统，缩短回款周期，收益比直接降价更持久。', h: '本季度', kpi: '平均回款天数、逾期率' },
        { t: '盯住社保公积金代缴的资金池', d: '代缴资金进出频繁，利率变化会放大其时间价值，需单独核算资金占用。', h: '本月起', kpi: '代缴资金月均占用额' }
      ],
      metrics: ['工资收入比', '净利率', '平均回款天数', '开票与收入差额'],
      risks: [
        '<b>降息常伴随需求走弱</b>：客户延付带来的损失可能大于资金成本节约，必须同步看回款数据。',
        '本测算是<b>代理口径</b>，未使用企业实际融资余额与合同账期，不能作为财务结论。',
        '不要因为资金便宜就放宽客户准入，规模扩张必须与回款能力匹配。'
      ],
      followups: ['如果利率上升 25 个基点呢？', '开票金额和营业收入差多少？', '上半年净利率是多少？']
    },
    /* ---- 工资上涨 ---- */
    {
      id: 'wage-up', title: '工资上涨 / 最低工资调整：管理动作',
      test: function (n) { return /(工资|薪酬|人工成本|人力成本|最低工资|用工成本|涨薪)/.test(n) && /(上涨|上调|提高|增加|涨|上升|变高)/.test(n); },
      head: function (D) {
        var wr = D.ratioOf(RATIOS[0], D.months, null);
        return '工资是本业务<b>最大的成本项</b>' + (wr != null ? '，当前工资收入比 ' + p2(wr) : '') + '。工资上涨如果不能同步转嫁到服务价格，会直接吃掉净利率——而且杠杆效应很明显。';
      },
      chain: [
        ['工资标准 / 最低工资上调', '应发工资刚性上升', '人力外包的成本结构里工资占比最高'],
        ['成本上升', '工资收入比抬升', '收入不变时，比率同步被推高'],
        ['若不能转嫁', '净利率被等比例压缩', '净利率的降幅 ≈ 工资收入比 × 涨幅'],
        ['管理重心', '从"压成本"转向"调价格 + 提人效"', '降薪既不合规也不可持续']
      ],
      sens: function (D) {
        var out = [], wr = D.ratioOf(RATIOS[0], D.months, null), nr = D.ratioOf(RATIOS[2], D.months, null), w = D.totals.wage;
        if (wr != null) {
          [0.03, 0.05, 0.08].forEach(function (p) {
            var dWr = wr * p;
            var nr2 = nr != null ? nr - dWr : null;
            out.push({
              label: '工资整体上涨 ' + (p * 100).toFixed(0) + '%',
              value: nr2 != null ? '净利率 ' + p2(nr) + ' → ' + p2(nr2) : '工资收入比升至 ' + p2(wr + dWr),
              calc: '净利率下降 ≈ 工资收入比 ' + p2(wr) + ' × ' + (p * 100).toFixed(0) + '% = ' + (dWr * 100).toFixed(2) + ' 个百分点',
              note: '工资收入比同时升至 ' + p2(wr * (1 + p)) + '。前提是服务价格与业务量不变、成本无法转嫁。'
            });
          });
          out.push({ label: '本年已导入工资总额', value: f2(w) + ' 万元', calc: D.months.length + ' 个月合计', note: '基数越大，同样涨幅带来的绝对金额越大。' });
        }
        return out.length ? out : [{ label: '暂无可测算数据', value: '—', calc: '需要应发工资与营业收入字段', note: '导入后可自动测算。' }];
      },
      actions: [
        { t: '在服务合同里建立价格联动条款', d: '把最低工资、社保基数调整列为调价触发条件，写明调整幅度与生效方式，避免"成本涨、价格不动"。', h: '本季度', kpi: '含调价条款的合同占比' },
        { t: '按岗位重算服务单价，不做一刀切', d: '区分高频重复岗与技能岗，前者用标准化与排班优化，后者用单价上调体现价值。', h: '60天内', kpi: '分岗位毛利贡献' },
        { t: '把工资收入比设为项目准入红线', d: '新项目报价测算时，工资收入比超过设定值的需单独审批，并说明如何转嫁。', h: '本季度', kpi: '超红线项目数、审批记录' },
        { t: '优化用工结构与排班，而非降薪', d: '通过班次合并、跨项目共享用工、旺季弹性用工降低单位人工成本。', h: '90天内', kpi: '人均创收、加班工时' },
        { t: '对高工资收入比的项目单独立项复核', d: '逐项判断是价格偏低、工作量不足还是配置冗余，给出整改或退出意见。', h: '60天内', kpi: '复核覆盖率、整改完成率' }
      ],
      metrics: ['工资收入比', '净利率', '人均创收（需员工数）', '分项目毛利贡献'],
      risks: [
        '<b>不得建议降低员工应得工资</b>：合规与用工风险高于短期成本收益，只能从定价、结构与工作量入手。',
        '工资上涨往往伴随最低工资与社保基数同步调整，实际成本增幅可能高于名义涨幅，需两项合并测算。',
        '净利率敏感性是"其他条件不变"的静态测算，未考虑业务量与客户结构的联动。'
      ],
      followups: ['如果社保基数上调 10% 呢？', '上半年工资收入比是多少？', '工资和收入对比']
    },
    /* ---- 社保 / 公积金政策 ---- */
    {
      id: 'social-up', title: '社保基数 / 公积金政策调整：管理动作',
      test: function (n) { return /(社保|公积金|五险|参保)/.test(n) && /(基数|上调|上涨|调整|政策|变化|提高|改)/.test(n); },
      head: function (D) {
        var so = D.totals.social, rev = D.totals.revenue;
        return '社保支出是人力外包的<b>第二大人力成本</b>' + (so != null && rev ? '，当前合计 ' + f2(so) + ' 万元，占收入 ' + p2(so / rev) : '') + '。基数调整的影响是"按人头放大"的，人越多、影响越大。';
      },
      chain: [
        ['社保 / 公积金基数上调', '单位缴费部分增加', '按参保人数与基数直接计算，与业务量无关'],
        ['成本上升', '社保支出占收入比抬升', '若合同约定"包干价"，成本由公司承担'],
        ['合同口径差异', '据实结算 vs 包干价，影响完全不同', '据实结算可转嫁，包干价需自行消化'],
        ['管理重心', '核对参保人数与结算口径', '先确认"人"对不对，再谈"钱"怎么分']
      ],
      sens: function (D) {
        var out = [], so = D.totals.social, rev = D.totals.revenue, w = D.totals.wage;
        if (so != null && rev) {
          var sr = so / rev;
          [0.05, 0.10].forEach(function (p) {
            out.push({
              label: '社保基数整体上调 ' + (p * 100).toFixed(0) + '%',
              value: '净利率下降 ' + (sr * p * 100).toFixed(2) + ' 个百分点',
              calc: '社保占收入比 ' + p2(sr) + ' × ' + (p * 100).toFixed(0) + '% = ' + (sr * p * 100).toFixed(2) + ' 个百分点',
              note: '社保支出增加约 ' + f2(so * p) + ' 万元（按当前规模估算）。'
            });
          });
          out.push({ label: '社保支出合计', value: f2(so) + ' 万元', calc: D.months.length + ' 个月合计', note: '占收入 ' + p2(sr) + '。' });
          if (w) out.push({ label: '社保 ÷ 应发工资', value: p2(so / w), calc: f2(so) + ' ÷ ' + f2(w), note: '用于快速判断社保口径是否异常（比例突变往往意味着参保人数或基数变化）。' });
        }
        return out.length ? out : [{ label: '暂无可测算数据', value: '—', calc: '需要社保支出与营业收入字段', note: '导入后可自动测算。' }];
      },
      actions: [
        { t: '核对参保人数与在岗人数是否一致', d: '人数不一致是社保成本异常最常见的原因，先做人头核对再谈金额。', h: '本月内', kpi: '参保人数 / 在岗人数差异' },
        { t: '按客户区分"据实结算"与"包干价"两类合同', d: '据实结算的可在结算单中同步调整；包干价的需提前协商补充协议。', h: '30天内', kpi: '两类合同占比与毛利差异' },
        { t: '建立社保支出占收入比的月度预警', d: '比例环比波动超过设定幅度即触发复核，避免基数调整被淹没在总成本里。', h: '本季度', kpi: '预警触发次数与处理时效' },
        { t: '把社保口径写进新签合同模板', d: '明确基数、缴费比例、调整机制与结算方式，减少事后争议。', h: '本季度', kpi: '新签合同口径完整率' }
      ],
      metrics: ['社保支出占收入比', '社保 ÷ 应发工资', '净利率', '参保人数一致性'],
      risks: [
        '社保基数调整通常与最低工资调整同期发生，两项需合并测算，不能只看其一。',
        '按人数计算的成本受用工规模影响，业务量下降时社保成本不会同比例下降，需注意"规模收缩但成本刚性"。',
        '测算为静态口径，未考虑客户结算方式的实际转嫁能力。'
      ],
      followups: ['如果工资整体上涨 5% 呢？', '3月社保支出是多少？', '七类费用合计占收入比是多少？']
    },
    /* ---- 扣款上升 ---- */
    {
      id: 'deduction-up', title: '客户扣款上升：管理动作',
      test: function (n) { return /(扣款|罚款|考核扣款|报废)/.test(n) && /(上升|增加|变多|变高|太高|过高|偏多|越来越多|怎么办|应对|控制|管理|治理|压降|归因)/.test(n); },
      head: function (D) {
        var ded = D.totals.deduction, rev = D.totals.revenue;
        return '扣款是可管理的<b>利润漏损</b>' + (ded != null && rev ? '：当前合计 ' + f2(ded) + ' 万元，占收入 ' + p2(ded / rev) : '') + '。关键是分清"可避免的"（质量、报废）和"条款性的"（考核约定），两者对策完全不同。';
      },
      chain: [
        ['服务质量 / 报废问题', '可避免扣款', '冷链盒饭报废这类，靠流程与排班能压下来'],
        ['合同考核条款', '条款性扣款', '销售不达标考核这类，属于商务约定，只能靠谈判与定价覆盖'],
        ['两类混在一起', '看不清真实原因', '总扣款上升时无法判断该改流程还是改合同'],
        ['管理重心', '拆开台账 + 逐单对应', '先能归因，才能谈控制']
      ],
      sens: function (D) {
        var out = [], ded = D.totals.deduction, rev = D.totals.revenue, ms = D.months;
        var s = seriesSorted(D, 'deduction', ms);
        if (ded != null) out.push({ label: '扣款合计', value: f2(ded) + ' 万元', calc: ms.length + ' 个月合计', note: '含销售考核与报废等已映射的扣款项。' });
        if (ded != null && rev) out.push({ label: '扣款占收入比', value: p2(ded / rev), calc: f2(ded) + ' ÷ ' + f2(rev), note: '这个比例是判断"扣款是否失控"的第一指标。' });
        if (s.length) {
          var top = s.slice().sort(function (a, b) { return b.value - a.value; })[0];
          out.push({ label: '扣款最高的月份', value: top.period + '（' + f2(top.value) + ' 万元）', calc: '各月扣款对比', note: '建议先复盘这个月的客户扣款通知与结算单。' });
          if (s.length > 1) {
            var delta = s[s.length - 1].value - s[0].value;
            out.push({ label: '首末月变化', value: s[0].period + ' → ' + s[s.length - 1].period + '：' + (delta >= 0 ? '+' : '') + f2(delta) + ' 万元', calc: '末期扣款 − 首期扣款', note: delta > 0 ? '扣款在上升，需要归因。' : '扣款在下降，可固化现有做法。' });
          }
        }
        return out.length ? out : [{ label: '暂无可测算数据', value: '—', calc: '需要扣款字段', note: '导入后可自动测算。' }];
      },
      actions: [
        { t: '把扣款拆成"可避免"与"条款性"两本台账', d: '报废、质量类归一本；考核、罚则类归另一本。前者抓执行，后者抓合同。', h: '30天内', kpi: '两类扣款占比与月度趋势' },
        { t: '建立逐单对应关系', d: '每笔扣款对应到客户通知、结算单与服务记录，没有单据的挂"待补证"。', h: '60天内', kpi: '扣款单据完整率' },
        { t: '对高扣款客户重做商务评审', d: '把历史扣款率计入报价，必要时提高单价或调整考核条款。', h: '本季度', kpi: '高扣款客户续约毛利率' },
        { t: '把扣款条款纳入合同评审清单', d: '新签合同必须评估考核扣款的触发条件与上限，避免无上限罚则。', h: '本季度', kpi: '合同评审通过率' },
        { t: '用扣款月度趋势做流程整改效果验证', d: '整改后盯扣款率是否下降，而不是只看绝对值。', h: '持续', kpi: '扣款率环比变化' }
      ],
      metrics: ['扣款占收入比', '扣款月度趋势', '单客户扣款率', '净利率'],
      risks: [
        '<b>口径提醒</b>：扣款是否已在原表利润中体现尚未核验，因此不能把扣款金额再从利润里扣一次，也不能直接宣称已造成损失。',
        '扣款可能部分已由收入或其他科目体现，重复计算会高估影响。',
        '报废类扣款与业务量相关，旺季上升不一定是管理恶化，需与业务量同看。'
      ],
      followups: ['上半年哪个月扣款最高？', '扣款率是多少？', '为什么扣款不能直接从原表利润里再扣一次？']
    },
    /* ---- 收入下滑 ---- */
    {
      id: 'revenue-down', title: '收入下滑 / 客户流失：管理动作',
      test: function (n) { return (/(收入|营收|营业额|业务量)/.test(n) && /(下降|下滑|减少|下跌|萎缩|掉了|降低)/.test(n)) || /(客户流失|单一客户|大客户依赖|客户集中|丢单)/.test(n); },
      head: function (D) {
        var s = seriesSorted(D, 'revenue', D.months), d = s.length > 1 ? (s[s.length - 1].value - s[0].value) : null;
        return '收入下滑时最怕的是<b>用降价保规模</b>。先要分清是"量降价未降"还是"量价齐跌"' + (d != null ? '：当前数据显示 ' + s[0].period + ' → ' + s[s.length - 1].period + '，收入变化 ' + (d >= 0 ? '+' : '') + f2(d) + ' 万元。' : '。');
      },
      chain: [
        ['客户需求下降 / 丢单', '营业收入减少', '但工资、社保等成本下降更慢'],
        ['收入下降快于成本', '毛利与净利同时承压', '工资收入比被动抬升'],
        ['若用降价换单', '毛利被二次侵蚀', '规模回来了，利润不一定回来'],
        ['管理重心', '保毛利优先于保规模', '按项目算贡献，设止损线']
      ],
      sens: function (D) {
        var out = [], s = seriesSorted(D, 'revenue', D.months), rev = D.totals.revenue;
        if (s.length > 1) {
          var first = s[0], last = s[s.length - 1], delta = last.value - first.value;
          out.push({ label: '首末月收入变化', value: first.period + ' → ' + last.period + '：' + (delta >= 0 ? '+' : '') + f2(delta) + ' 万元', calc: '末期收入 − 首期收入', note: '区间口径，未剔除季节性。' });
          var worst = null;
          for (var i = 1; i < s.length; i++) { var d2 = s[i].value - s[i - 1].value; if (!worst || d2 < worst.d) worst = { d: d2, period: s[i].period }; }
          if (worst) out.push({ label: '最大单月降幅', value: worst.period + '：' + f2(worst.d) + ' 万元', calc: '环比差额最大的月份', note: '建议优先复盘这个月的客户与业务量变化。' });
        }
        var gr = D.ratioOf(RATIOS[1], D.months, null), nr = D.ratioOf(RATIOS[2], D.months, null), wr = D.ratioOf(RATIOS[0], D.months, null);
        if (gr != null) out.push({ label: '毛利率', value: p2(gr), calc: '毛利润合计 ÷ 营业收入合计', note: '收入下滑期毛利率若同步下降，说明是"量价齐跌"，需重定报价策略。' });
        if (nr != null) out.push({ label: '净利率', value: p2(nr), calc: '原表净利润合计 ÷ 营业收入合计', note: '净利率跌破 0 就意味着规模越大亏得越多。' });
        if (wr != null) out.push({ label: '工资收入比', value: p2(wr), calc: '应发工资合计 ÷ 营业收入合计', note: '收入下滑但工资刚性，这个比例会被动抬升。' });
        if (rev != null) out.push({ label: '营业收入合计', value: f2(rev) + ' 万元', calc: D.months.length + ' 个月合计', note: '作为后续测算的基数。' });
        return out.length ? out : [{ label: '暂无可测算数据', value: '—', calc: '需要营业收入字段', note: '导入后可自动测算。' }];
      },
      actions: [
        { t: '按项目算贡献，识别亏损项目', d: '收入、毛利、净利三张表按项目拆开，亏损项目单独立项，设整改期与退出条件。', h: '30天内', kpi: '亏损项目数与整改完成率' },
        { t: '把"保毛利"设为优先级高于"保规模"', d: '价格下限写进审批规则，低于下限的订单需说明战略理由。', h: '本季度', kpi: '低价订单占比' },
        { t: '区分客户流失原因并分类处置', d: '价格原因 vs 服务原因 vs 客户自身经营原因，对策分别是报价、质量、风险退出。', h: '30天内', kpi: '流失原因分类覆盖率' },
        { t: '做 6 个月现金流压力测试', d: '按收入再降 10%/20% 两种情形，测算工资与社保刚性支出的缺口。', h: '30天内', kpi: '最低现金安全垫月数' },
        { t: '控制客户集中度', d: '单一客户收入占比过高的，主动拓展新客户或调整服务组合。', h: '本季度', kpi: '前三大客户收入占比' }
      ],
      metrics: ['毛利率', '净利率', '工资收入比', '前三大客户收入占比'],
      risks: [
        '收入下滑期最容易犯的错是降价保规模，可能把可控的利润问题变成结构性亏损。',
        '当前数据按项目汇总，无法定位到具体客户，客户集中度分析需要补充客户维度数据。',
        '首末月对比未剔除季节性，正式结论需结合业务量的季节规律。'
      ],
      followups: ['上半年营业收入是多少？', '各月营业收入排名', '如果工资整体上涨 5%，净利率会掉到多少？']
    },
    /* ---- 净利率下降 / 亏损 ---- */
    {
      id: 'profit-down', title: '净利率下降 / 出现亏损：管理动作',
      test: function (n) { return (/(净利|利润|毛利|盈利)/.test(n) && /(下降|下滑|亏损|减少|变差|降低|为负|不行|恶化)/.test(n)) || /(亏损|不赚钱|亏钱)/.test(n); },
      head: function (D) {
        var loss = seriesSorted(D, 'profit', D.months).filter(function (x) { return x.value < 0; });
        var nr = D.ratioOf(RATIOS[2], D.months, null);
        return '当前净利率 ' + p2(nr) + (loss.length ? '，其中 <b>' + loss.map(function (x) { return x.period; }).join('、') + '</b> 原表净利润为负。' : '。') + '先做归因（毛利问题还是费用问题），再决定动作，避免直接砍成本伤到业务。';
      },
      chain: [
        ['收入 / 价格端', '毛利被压缩', '看毛利率是否同步下降'],
        ['费用端', '毛利被费用吃掉', '工资、社保、总部管理费等刚性支出'],
        ['扣款与一次性因素', '利润进一步漏损', '报废、考核扣款等'],
        ['管理重心', '先归因再开方', '毛利问题改定价，费用问题改结构']
      ],
      sens: function (D) {
        var out = [], rev = D.totals.revenue, gp = D.totals.grossProfit, np = D.totals.profit, w = D.totals.wage;
        var loss = seriesSorted(D, 'profit', D.months).filter(function (x) { return x.value < 0; });
        if (np != null) out.push({ label: '原表净利润合计', value: f2(np) + ' 万元', calc: D.months.length + ' 个月合计', note: '源表口径，未做调整。' });
        if (rev) out.push({ label: '净利率', value: p2(np / rev), calc: f2(np) + ' ÷ ' + f2(rev), note: '与毛利率对照即可判断是毛利问题还是费用问题。' });
        if (gp != null && np != null) out.push({ label: '毛利 → 净利的差额（被费用与扣款吃掉）', value: f2(gp - np) + ' 万元', calc: f2(gp) + ' − ' + f2(np), note: '这个差额就是各项费用与扣款的合计影响。' });
        if (w != null && rev) out.push({ label: '工资占收入比', value: p2(w / rev), calc: f2(w) + ' ÷ ' + f2(rev), note: '人力成本是本业务最大的费用项。' });
        if (loss.length) out.push({ label: '亏损月份', value: loss.map(function (x) { return x.period + '（' + f2(x.value) + '）'; }).join('、'), calc: '逐月净利润筛选 < 0', note: '建议优先复盘这些月的成本与结算口径。' });
        return out.length ? out : [{ label: '暂无可测算数据', value: '—', calc: '需要净利润与营业收入字段', note: '导入后可自动测算。' }];
      },
      actions: [
        { t: '按项目 / 月份做盈亏归因表', d: '把亏损拆到"毛利不足"和"费用过高"两类，分别给出整改方向。', h: '30天内', kpi: '亏损项归因完成率' },
        { t: '给亏损项目设整改期与止损线', d: '明确整改期限、责任人和退出条件，避免长期用盈利项目补贴。', h: '本季度', kpi: '亏损项目扭亏数' },
        { t: '区分一次性因素与趋势性因素', d: '报废、扣款等一次性影响单列，不要用一次性因素掩盖趋势性恶化。', h: '30天内', kpi: '一次性因素金额占比' },
        { t: '把净利率纳入月度经营例会固定议题', d: '固定看"毛利率 → 费用率 → 扣款率 → 净利率"的传导链。', h: '本月起', kpi: '例会闭环事项数' }
      ],
      metrics: ['毛利率', '净利率', '费用占收入比', '扣款占收入比'],
      risks: [
        '净利率下降的原因可能是价格、业务量、成本结构或一次性因素，必须先归因再行动。',
        '原表净利润为负不一定等于经营亏损，需核对成本与期间的确认口径。',
        '不要用"降低员工应得工资"作为改善净利率的手段，合规风险不可控。'
      ],
      followups: ['哪个月净利润为负？', '上半年净利率是多少？', '毛利率和净利率分别是多少？']
    },
    /* ---- 开票 / 垫资 / 回款 ---- */
    {
      id: 'invoice-gap', title: '开票与收入差额 / 垫资与回款：管理动作',
      test: function (n) { return /(开票|发票|应收|回款|账期|垫资|资金占用|现金流)/.test(n); },
      head: function (D) {
        var pairs = D.months.map(function (p) {
          var recs = D.recsOf(p, null);
          var a = D.sumKeys(recs, ['revenue']), b = D.sumKeys(recs, ['invoice']);
          return (a != null && b != null) ? { period: p, gap: a - b } : null;
        }).filter(Boolean);
        return '人力外包是"<b>先垫工资、后收钱</b>"的模式，收入与开票的差额往往对应垫资与回款节奏' + (pairs.length ? '。当前可比月份（两项都有值）的差额合计 ' + f2(pairs.reduce(function (a, x) { return a + x.gap; }, 0)) + ' 万元。' : '。');
      },
      chain: [
        ['工资社保按月先付', '资金先流出', '人力成本刚性，不会等客户付款'],
        ['收入确认与开票时点不同', '产生时间差', '收入已确认但尚未开票结算'],
        ['开票 → 客户审批 → 回款', '账期决定资金占用时长', '账期越长，占用成本越高'],
        ['管理重心', '管住"收入—开票—回款"三个时点', '三者差异要能逐月对账']
      ],
      sens: function (D) {
        var out = [], pairs = [];
        D.months.forEach(function (p) {
          var recs = D.recsOf(p, null);
          var a = D.sumKeys(recs, ['revenue']), b = D.sumKeys(recs, ['invoice']);
          if (a != null && b != null) pairs.push({ period: p, rev: a, inv: b, gap: a - b });
        });
        if (pairs.length) {
          pairs.forEach(function (x) {
            out.push({ label: x.period + ' 收入与开票差额', value: f2(x.gap) + ' 万元', calc: '营业收入 ' + f2(x.rev) + ' − 开票金额 ' + f2(x.inv), note: '差额不等于漏记收入，需核对开票时点与结算口径。' });
          });
        }
        var cov = D.monthCov.invoice;
        out.push({ label: '开票字段覆盖', value: cov + '/' + D.months.length + ' 个月', calc: '有开票金额的月份数', note: cov < D.months.length ? '多数月份没有开票数据，差额只能比较同时有值的月份，不能全期相加。' : '全期覆盖，可做完整对账。' });
        var w = D.totals.wage, n = D.months.length;
        if (w != null && n) {
          var mw = w / n;
          out.push({ label: '月均垫资规模代理', value: f2(mw) + ' 万元', calc: '应发工资合计 ÷ ' + n + ' 个月', note: '工资是主要垫资源头；账期每延长 1 个月，占用规模约增加这么多。' });
          out.push({ label: '账期延长 1 个月的额外资金占用（估算）', value: f2(mw) + ' 万元', calc: '月均工资 × 1 个月', note: '按年化 3% 估算，年化资金成本约增加 ' + f2(mw * 0.03) + ' 万元。' });
        }
        return out;
      },
      actions: [
        { t: '建立"收入—开票—回款"三时点对账表', d: '按月记录三个数字及差异原因，差异需逐条说明，不允许留白。', h: '本月起', kpi: '三时点对账完成率' },
        { t: '把开票进度纳入业务人员考核', d: '收入确认后未及时开票的，明确责任人与时限，避免"干完活不开票"。', h: '30天内', kpi: '收入确认到开票的平均天数' },
        { t: '做应收账款账龄分析', d: '按 30/60/90 天分档，识别长期挂账客户并制定催收计划。', h: '30天内', kpi: '各账龄段金额占比' },
        { t: '账期与合同定价联动', d: '对账期超过基准的客户按资金成本加成，或在合同中约定逾期利息。', h: '本季度', kpi: '含账期条款的合同占比' },
        { t: '补齐开票字段的月度数据', d: '当前多数月份没有开票数据，补齐后才能做完整的垫资与回款分析。', h: '下次数据报送', kpi: '开票字段覆盖率' }
      ],
      metrics: ['收入与开票差额', '平均回款天数', '逾期应收占比', '月均垫资规模'],
      risks: [
        '收入与开票的差额<b>不等于漏记收入</b>，需核对结算单、发票期间与确认规则后才能定性。',
        '开票字段覆盖不全，当前只能比较同时有值的月份，不能把差额全期相加。',
        '垫资规模用应发工资作代理变量，未包含其他垫付成本，实际占用需财务确认。'
      ],
      followups: ['开票金额和营业收入差多少？', '如果利率下降 25 个基点，我们该做什么管理决策？', '现在还有哪些字段没有数据？']
    },
    /* ---- 费用管控 ---- */
    {
      id: 'cost-control', title: '费用管控：管理动作',
      test: function (n) { return /(费用|成本)/.test(n) && /(控制|管控|压降|降本|优化|管理|太高|上升|怎么降|压缩)/.test(n); },
      head: function (D) {
        var ct = D.sumKeys(D.records, ['wage', 'social', 'support', 'vat', 'surtax', 'management', 'reserve']);
        var rev = D.totals.revenue;
        return '费用管控要先看清<b>结构</b>再动手' + (ct != null && rev ? '：当前七类费用合计 ' + f2(ct) + ' 万元，占收入 ' + p2(ct / rev) + '。' : '。') + '人力类费用（工资 + 社保）通常是最大头，其次是税费。';
      },
      chain: [
        ['七类费用', '工资、社保、综合保障、增值税、附加税、总部管理费、风险准备金', '不同费用的可控性完全不同'],
        ['人力类（工资 + 社保）', '与业务量强相关，可控性中等', '只能通过定价、结构、人效改善'],
        ['税费类（增值税 + 附加税）', '与收入规模相关，可控性低', '重点在合规与筹划，不在压缩'],
        ['管理费 / 准备金', '相对可控', '是压降见效最快的部分']
      ],
      sens: function (D) {
        var out = [], rev = D.totals.revenue;
        var items = [
          ['应发工资', 'wage'], ['社保支出', 'social'], ['综合保障支出', 'support'],
          ['增值税', 'vat'], ['附加税', 'surtax'], ['总部管理费', 'management'], ['风险准备金', 'reserve']
        ];
        var total = 0, list = [];
        items.forEach(function (it) {
          var v = D.totals[it[1]];
          if (v != null) { total += v; list.push({ name: it[0], v: v }); }
        });
        list.sort(function (a, b) { return b.v - a.v; });
        list.forEach(function (x) {
          out.push({
            label: x.name, value: f2(x.v) + ' 万元',
            calc: total ? '占七类费用 ' + p2(x.v / total) + '，占收入 ' + (rev ? p2(x.v / rev) : '—') : '占收入 ' + (rev ? p2(x.v / rev) : '—'),
            note: x.name === '应发工资' || x.name === '社保支出' ? '人力类费用：可控性中等，靠定价与结构优化，不能靠降薪。' : (x.name === '增值税' || x.name === '附加税' ? '税费类：可控性低，重点是合规与筹划。' : '相对可控，是压降见效最快的部分。')
          });
        });
        if (total && rev) out.push({ label: '七类费用合计', value: f2(total) + ' 万元', calc: '各项相加；占收入 ' + p2(total / rev), note: '与净利率对照可判断费用挤压程度。' });
        return out.length ? out : [{ label: '暂无可测算数据', value: '—', calc: '需要费用类字段', note: '导入后可自动测算。' }];
      },
      actions: [
        { t: '按"可控性"给费用分类，不要一刀切压降', d: '税费类抓合规、人力类抓定价与结构、管理费与准备金抓预算。', h: '30天内', kpi: '各类费用占比变化' },
        { t: '建立费用预算与实际对比机制', d: '总部管理费、综合保障支出按季度预算，超支需说明原因。', h: '本季度', kpi: '预算执行偏差率' },
        { t: '核查风险准备金计提口径', d: '确认计提比例是否与合同风险匹配，避免长期挂账或计提不足。', h: '60天内', kpi: '计提比例与坏账匹配度' },
        { t: '把费用率纳入项目报价模型', d: '报价时同步测算费用分摊，避免"看着有毛利、算完费用就亏"。', h: '本季度', kpi: '含费用分摊的报价覆盖率' }
      ],
      metrics: ['七类费用占收入比', '人力类费用占比', '净利率', '预算执行偏差率'],
      risks: [
        '费用压降不能以牺牲服务质量或员工权益为代价，否则会转化为扣款与人员流失。',
        '增值税、附加税属税负，压缩空间有限，重点是合规与业务模式优化。',
        '费用口径需与企业财务保持一致，原型按导入字段汇总。'
      ],
      followups: ['七类费用合计占收入比是多少？', '3月社保支出和总部管理费各是多少？', '上半年毛利率是多少？']
    },
    /* ---- 数据缺口 ---- */
    {
      id: 'data-gap', title: '还缺哪些数据：补齐优先级',
      test: function (n) { return /(缺|补|还需要|要哪些|补充)/.test(n) && /(数据|字段|指标|口径|资料)/.test(n); },
      head: function (D) {
        var missing = FIELDS.filter(function (f) { return D.monthCov[f.key] === 0; });
        return '当前 <b>' + D.months.length + '</b> 个月里有 <b>' + missing.length + '</b> 个字段完全没有数据。补齐数据不是越多越好，应该按"能解锁什么分析"排序。';
      },
      chain: [
        ['月度员工数', '解锁人均创收与人效', '现在只能看工资收入比，无法判断是价格问题还是人效问题'],
        ['月度开票金额', '解锁垫资与回款分析', '收入与开票的差额是资金占用的直接线索'],
        ['应收账款账龄', '解锁资金成本与坏账风险', '与利率情景直接联动'],
        ['客户维度', '解锁客户集中度与单客户盈利', '现在只能到项目/子公司层级']
      ],
      sens: function (D) {
        var out = [];
        FIELDS.forEach(function (f) {
          if (D.monthCov[f.key] === 0) {
            out.push({ label: f.name, value: '0/' + D.months.length + ' 个月', calc: '当前无数据', note: '补齐后能回答：' + (UNLOCK[f.key] || '相关月度对比') + '。' });
          }
        });
        FIELDS.forEach(function (f) {
          if (D.monthCov[f.key] > 0 && D.monthCov[f.key] < D.months.length) {
            out.push({ label: f.name + '（部分月份缺失）', value: D.monthCov[f.key] + '/' + D.months.length + ' 个月', calc: '缺 ' + (D.months.length - D.monthCov[f.key]) + ' 个月', note: '补齐后可做全期对比；缺失月份目前不会补零。' });
          }
        });
        return out.length ? out : [{ label: '字段覆盖完整', value: '全部有值', calc: '—', note: '可以进一步补充客户维度、账龄维度数据。' }];
      },
      actions: [
        { t: '优先补月度员工数（脱敏汇总即可）', d: '只要每月总人数，不需要个人明细，即可解锁人均创收与人效分析。', h: '下次数据报送', kpi: '员工数字段覆盖率' },
        { t: '补齐开票金额的月度数据', d: '现在多数月份没有开票值，垫资与回款分析做不完整。', h: '下次数据报送', kpi: '开票字段覆盖率' },
        { t: '增加应收账款账龄汇总', d: '按 30/60/90 天分档的应收余额，是资金成本测算的必需输入。', h: '30天内', kpi: '账龄表提供率' },
        { t: '增加客户维度标识', d: '在月度表中加入客户或合同编号，可做客户集中度与单客户盈利分析。', h: '本季度', kpi: '客户维度覆盖率' }
      ],
      metrics: ['字段覆盖率', '人均创收（补齐后）', '平均回款天数（补齐后）', '客户集中度（补齐后）'],
      risks: [
        '补充数据须经企业授权并脱敏，不应引入员工个人工资明细等敏感信息。',
        '缺失字段一律留空，不用其他字段推算替代值，避免产生误导性结论。',
        '字段口径应与现有源表一致，否则跨月对比会失真。'
      ],
      followups: ['现在还有哪些字段没有数据？', '员工数量为什么没有？', '上半年营业收入是多少？']
    },
    /* ---- 通用决策兜底 ---- */
    {
      id: 'general', title: '基于当前数据：最该做的三件事',
      test: function (n) { return /(怎么办|该做什么|管理决策|怎么应对|如何应对|有什么建议|给点建议|对策|措施|经营建议|下一步)/.test(n); },
      head: function (D) {
        var nr = D.ratioOf(RATIOS[2], D.months, null), wr = D.ratioOf(RATIOS[0], D.months, null);
        return '没有指定具体情景时，我先按当前数据给出优先级最高的动作。当前净利率 ' + p2(nr) + '、工资收入比 ' + p2(wr) + '，这两条是判断经营质量的主线。';
      },
      chain: [
        ['先看利润', '净利率与亏损月份', '决定"要不要救"'],
        ['再看成本结构', '工资收入比与费用率', '决定"从哪里救"'],
        ['最后看资金', '开票差额与账期', '决定"能不能撑住"'],
        ['落到动作', '归因 → 定价 / 结构 / 账期', '避免无差别砍成本']
      ],
      sens: function (D) {
        var out = [], rev = D.totals.revenue, np = D.totals.profit, w = D.totals.wage, ded = D.totals.deduction;
        var loss = seriesSorted(D, 'profit', D.months).filter(function (x) { return x.value < 0; });
        var revS = seriesSorted(D, 'revenue', D.months);
        if (rev) out.push({ label: '净利率', value: p2(np / rev), calc: f2(np) + ' ÷ ' + f2(rev), note: '经营质量主线一：利润还剩多少。' });
        if (rev && w) out.push({ label: '工资收入比', value: p2(w / rev), calc: f2(w) + ' ÷ ' + f2(rev), note: '经营质量主线二：人力成本吃掉多少收入。' });
        if (loss.length) out.push({ label: '亏损月份', value: loss.map(function (x) { return x.period; }).join('、'), calc: '逐月净利润 < 0', note: '建议列入本月复盘清单。' });
        if (ded != null && rev) out.push({ label: '扣款占收入比', value: p2(ded / rev), calc: f2(ded) + ' ÷ ' + f2(rev), note: '利润漏损中相对可控的一项。' });
        if (revS.length > 1) {
          var d = revS[revS.length - 1].value - revS[0].value;
          out.push({ label: '收入首末月变化', value: (d >= 0 ? '+' : '') + f2(d) + ' 万元', calc: revS[0].period + ' → ' + revS[revS.length - 1].period, note: '判断规模是在扩张还是在收缩。' });
        }
        return out.length ? out : [{ label: '暂无可测算数据', value: '—', calc: '需要收入与利润字段', note: '导入后可自动测算。' }];
      },
      actions: [
        { t: '把"净利率 → 毛利率 → 费用率 → 扣款率"做成固定看板', d: '每月固定看这条传导链，能快速定位利润是被哪一环吃掉的。', h: '本月起', kpi: '四率月度看板' },
        { t: '对亏损月份与高扣款月份单独立项', d: '每项写明原因、责任人、整改动作和期限。', h: '30天内', kpi: '立项数与闭环率' },
        { t: '把工资收入比设成项目准入红线', d: '新项目报价必须测算该比例，超标需单独审批。', h: '本季度', kpi: '超红线项目数' },
        { t: '补齐员工数与开票数据', d: '这两项能解锁人效与资金占用分析，是当前最大的数据缺口。', h: '下次数据报送', kpi: '字段覆盖率' }
      ],
      metrics: ['净利率', '工资收入比', '扣款占收入比', '费用占收入比'],
      risks: [
        '所有结论都基于当前导入字段，未涵盖合同条款、客户账龄等关键信息。',
        '规则识别出的事项属于"待核查"，不是已确认的差错或损失。',
        '管理动作需结合企业实际授权与流程，本回答不构成财务或法律意见。'
      ],
      followups: ['如果利率下降 25 个基点，我们该做什么管理决策？', '如果工资整体上涨 5%，净利率会掉到多少？', '现在还有哪些字段没有数据？']
    }
  ];

  function matchPlaybook(n) {
    for (var i = 0; i < PLAYBOOKS.length; i++) if (PLAYBOOKS[i].test(n)) return PLAYBOOKS[i];
    return null;
  }

  function answerDecision(pb, D) {
    var blocks = [];
    blocks.push({ t: '传导路径', type: 'chain', items: pb.chain });
    blocks.push({ t: '用当前数据做的测算', type: 'sens', items: pb.sens(D) });
    blocks.push({ t: '建议动作', type: 'actions', items: pb.actions });
    blocks.push({ t: '要盯住的指标', type: 'bullets', items: pb.metrics });
    blocks.push({ t: '风险与边界', type: 'bullets', items: pb.risks, risk: true });
    return {
      kind: 'decision', title: pb.title, lead: pb.head(D), blocks: blocks,
      notes: [
        '测算口径：全部数字由本机按当前导入数据实时计算（' + D.source + '，' + D.months.length + ' 个月），算式已逐条列出。',
        '假设说明：凡涉及账期、融资利率等未提供的参数，均在测算中标注为"演示假设"，需由企业财务替换为真实值。',
        '边界：本回答是管理建议而非财务结论；涉及金额的最终判断应以合同、结算单与财务凭证为准。'
      ],
      followups: pb.followups || []
    };
  }

  /* ======================= 6. 口径解释 ======================= */
  var EXPLAINS = [
    {
      test: function (n) { return /(为什么|为何)/.test(n) && /(扣款|罚款)/.test(n) && /(利润|再扣|重复|体现|路径)/.test(n); },
      title: '为什么扣款不能直接从原表利润里再扣一次',
      lead: '因为扣款是否已经体现在原表利润中<b>尚未核验</b>。直接再扣一次等于把同一笔影响计算两遍，会系统性高估损失。',
      items: [
        '<b>已核验的事实</b>：两类扣款合计金额可以从源表读出，原始工作簿中 B18、B21 的利润公式<b>没有直接引用</b>扣款行。',
        '<b>待核验的部分</b>：扣款可能已通过收入减少、其他成本科目或结算单价调整间接体现，路径不同，结论完全不同。',
        '<b>正确做法</b>：取得客户扣款通知、结算单与收入凭证，逐单对应后再判断是否需要在利润上调整。',
        '<b>原型的处理</b>：只提示"待补证"，把扣款金额作为观察值，不并入利润重算，也不宣称已造成损失。'
      ]
    },
    {
      test: function (n) { return /工资收入比|人力成本率/.test(n) && /(怎么算|什么是|是什么|口径|定义|含义|为什么)/.test(n); },
      title: '工资收入比的口径与使用边界',
      lead: '工资收入比 = <b>应发工资 ÷ 营业收入</b>，用于观察人力成本对收入的挤压程度。',
      items: [
        '<b>算法</b>：先把所选月份的收入与工资分别汇总，再相除（不是把每月比率简单平均）。',
        '<b>只有成对月份参与</b>：某月缺收入或缺工资，该月不参与计算，也不补零。',
        '<b>能说明什么</b>：比例越高，说明人力成本对收入的挤压越强，议价空间越薄。',
        '<b>不能说明什么</b>：不能据此建议降低员工应得工资。偏高可能是报价偏低、工作量不足、配置冗余或季节性波动，需要结合服务量与岗位结构判断。'
      ]
    },
    {
      test: function (n) { return /(同比|去年同期|去年同)/.test(n); },
      title: '为什么没有同比数据',
      lead: '当前导入的是<b>单一年度</b>的月度数据，没有上年同期同口径值，所以同比留空而不是估算。',
      items: [
        '<b>已导入</b>：' + '月份范围为所选数据集覆盖的月份。',
        '<b>缺少</b>：上年同期同口径的收入、成本与利润。',
        '<b>为什么不用估算</b>：估算同比会引入不可核验的假设，在经营核对场景里比"没有"更危险。',
        '<b>替代做法</b>：可以先看环比与月度趋势，等取得上年同口径数据后再补同比。'
      ]
    },
    {
      test: function (n) { return /(预算|目标|达成率|完成率|计划)/.test(n); },
      title: '为什么没有预算达成率',
      lead: '企业提供的是<b>实际经营数据</b>，没有提供预算或目标值，因此达成率无法计算。',
      items: [
        '达成率 = 实际 ÷ 预算，缺少分母就无法计算。',
        '原型不使用参考图片或外部资料中的演示数值代替企业预算。',
        '若企业提供经确认的月度预算表，可以映射后自动生成达成率专题。'
      ]
    },
    {
      test: function (n) { return /(库存|存货)/.test(n) && /(为什么|没有|缺|未提供)/.test(n); },
      title: '为什么没有库存数据',
      lead: '库存余额与周转天数<b>无法从经营利润表推算</b>，需要单独的月度库存汇总表。',
      items: [
        '参考图中的库存余额、周转天数、呆滞金额和 TOP5 品类不能从餐服经营利润表得出。',
        '若取得经授权的月度库存汇总表，可映射"库存金额"和"库存周转天数"两列。',
        '缺少呆滞品类明细时，不能自动生成 TOP5 呆滞品类。'
      ]
    },
    {
      test: function (n) { return /(数据.*(来源|从哪|哪来)|来源是|数据来源)/.test(n); },
      title: '数据来源与处理方式',
      lead: '数据来自你导入的文件，<b>全程在本机浏览器内解析，不上传服务器</b>。',
      items: [
        '<b>来源</b>：导入的 Excel / CSV / TSV 或粘贴区域；当前数据集为「' + '见下方来源' + '」。',
        '<b>处理</b>：自动识别工作表、表头、月份写法与字段，金额统一换算为万元。',
        '<b>不做的处理</b>：缺失值不补零；同项目同月多行不自动求和；不做未提供字段的推算。',
        '<b>可追溯</b>：每个数值都能回到源单元格位置，可在核对工作台"追溯依据"里查看。'
      ]
    },
    {
      test: function (n) { return /(可信|准确|对不对|有没有错|能直接下结论|可以下结论|能当结论|能定性)/.test(n); },
      title: '这些数字能直接用来下结论吗',
      lead: '数字可以用于<b>发现问题和定位线索</b>，但不能直接当作差错认定或损失金额。',
      items: [
        '<b>可以</b>：判断趋势、发现异常月份、定位需要核对的字段与项目。',
        '<b>不可以</b>：认定漏记收入、认定损失金额、替代财务审批。',
        '<b>原因</b>：公式、合同与逐单单据不会自动核验；部分字段覆盖不完整。',
        '<b>正确姿势</b>：把问答结果当作"待核查清单"，到核对工作台留痕后再定论。'
      ]
    },
    {
      test: function (n) { return /(员工.*(工资|薪酬).*(明细|个人)|个人.*工资|隐私|敏感)/.test(n); },
      title: '有没有员工个人工资数据',
      lead: '没有。原型<b>不包含员工姓名或个人工资明细</b>，只使用月度汇总值。',
      items: [
        '当前所有指标都基于月度汇总金额计算。',
        '人均收入需要"员工数量"（总人数），不需要个人明细。',
        '如需人效分析，提供脱敏的月度总人数即可。'
      ]
    }
  ];

  function answerExplain(item, D) {
    var items = item.items.map(function (x) {
      if (typeof x === 'string' && has(x, '见下方来源')) return '来源：' + D.source;
      return x;
    });
    return {
      kind: 'explain', title: item.title, lead: item.lead,
      blocks: [{ t: '要点', type: 'bullets', items: items }],
      notes: ['当前数据来源：' + D.source + '；覆盖 ' + D.months.length + ' 个月。'],
      followups: ['现在还有哪些字段没有数据？', '工资收入比是怎么算的？', '上半年哪个月扣款最高？']
    };
  }

  /* ======================= 7. 帮助与兜底 ======================= */
  function answerHelp(D) {
    return {
      kind: 'explain', title: '我能做什么',
      lead: '我是<b>本地规则引擎</b>驱动的经营数据助手：所有数字由本机按你导入的数据实时计算，并给出算式与口径，可人工复核。',
      blocks: [{
        t: '四类问题', type: 'kv', items: [
          { k: '查数据', v: '按任意月份 / 项目 / 字段组合取数，包括 BI 看板未单独展示的社保、增值税、附加税、总部管理费、风险准备金、开票金额、扣款分月明细等。' },
          { k: '算指标', v: '工资收入比、毛利率、净利率、扣款率、费用率、人均收入等，会说明算法与参与月份。' },
          { k: '做测算', v: '如"工资上涨 5% 净利率会掉到多少"，用当前数据做敏感性测算并列出算式。' },
          { k: '给决策', v: '利率变动、社保基数调整、扣款上升、收入下滑、亏损等情景，按"传导路径 → 测算 → 动作 → 指标 → 风险"给出管理建议。' }
        ]
      }],
      notes: [
        '数据边界：字段缺失时我会明说缺什么、补齐后能算什么，不会用其他字段推算替代。',
        '结论边界：涉及金额定性的判断（如是否漏记收入、是否造成损失）需要人工复核，我不会越界下结论。',
        '当前数据：' + D.months.length + ' 个月，' + D.records.length + ' 条记录，来源 ' + D.source
      ],
      followups: ['现在还有哪些字段没有数据？', '3月社保支出和总部管理费各是多少？', '如果利率下降 25 个基点，我们该做什么管理决策？']
    };
  }

  function answerFallback(q, D) {
    return {
      kind: 'fallback', title: '没太理解这个问题',
      lead: E('我按「经营数据查询」和「管理决策建议」两类问题来理解。换个说法，或者直接点下面的例子试试。'),
      blocks: [{
        t: '可以这样问', type: 'bullets', items: [
          '<b>查单项数据</b>：3月社保支出是多少 / 上半年总部管理费合计',
          '<b>找极值</b>：哪个月扣款最高 / 收入最低的月份是几月',
          '<b>算比率</b>：工资收入比是多少 / 各月毛利率排名',
          '<b>做对比</b>：收入和工资对比 / 各项目净利润排名',
          '<b>情景决策</b>：如果利率下降 25 个基点该做什么 / 工资上涨 5% 净利率会怎样',
          '<b>看边界</b>：现在还有哪些字段没有数据 / 为什么没有同比'
        ]
      }],
      notes: ['当前数据：' + D.months.length + ' 个月（' + (D.months[0] || '—') + ' — ' + (D.months[D.months.length - 1] || '—') + '），来源 ' + D.source],
      followups: ['现在还有哪些字段没有数据？', '上半年哪个月扣款最高？', '如果利率下降 25 个基点，我们该做什么管理决策？']
    };
  }

  /* ======================= 8. 本地作答主入口 ======================= */
  function localAnswer(q) {
    var D = buildData();
    var n = norm(q);
    if (!n) return answerFallback(q, D);
    if (!D.records.length) {
      return {
        kind: 'error', title: '还没有导入数据',
        lead: E('请先在「核对工作台 → 导入数据」里点击"加载30个月示例（2024—2026）"，或导入你自己的 Excel / CSV，我就能基于真实数据回答。'),
        followups: ['你会什么？']
      };
    }
    // 帮助
    if (/(帮助|你会什么|能做什么|怎么用|使用说明|有什么功能)/.test(n)) return answerHelp(D);
    // 管理决策手册（优先于数据查询，因为情景词更具体）
    var pb = matchPlaybook(n);
    if (pb) return answerDecision(pb, D);
    // 口径解释
    for (var i = 0; i < EXPLAINS.length; i++) if (EXPLAINS[i].test(n)) return answerExplain(EXPLAINS[i], D);
    // 数据查询
    var fields = pickFields(n);
    // 月份解析要用保留分隔符的版本，否则 "2026-03" 会被规范化成 "202603"
    var nSep = String(q || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
    var scope = parseScope(nSep, D);
    var entity = pickEntity(n, D);
    var intent = parseIntent(n);
    // 问了数据类问题但没点明指标时，默认看营业收入
    if (!fields.length && intent && ['rank', 'max', 'min', 'sum', 'avg', 'trend', 'compare', 'mom'].indexOf(intent) >= 0) {
      fields = [{ def: FIELDS[0], kind: 'field', alias: '营业收入', score: 0, index: 0, len: 0 }];
    }
    if (fields.length || scope.explicit || intent || /覆盖|字段|数据|月份|项目|排名|趋势/.test(n)) {
      return answerData({ n: n, nSep: nSep, fields: fields, scope: scope, entity: entity, intent: intent, raw: q }, D);
    }
    return answerFallback(q, D);
  }

  /* ======================= 9. 可选大模型桥 ======================= */
  var CFG_KEY = 'caixinyun-ai-cfg-v1';
  var PRESETS = [
    { id: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { id: 'qwen', name: '通义千问（DashScope 兼容模式）', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { id: 'zhipu', name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    { id: 'moonshot', name: 'Kimi（Moonshot）', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    { id: 'openai', name: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { id: 'custom', name: '自定义 OpenAI 兼容接口', base: '', model: '' }
  ];
  var SYS_PROMPT = [
    '你是"才薪云"人力资源外包企业的经营分析助手，服务对象是云南思瑞达这类人力服务企业的项目与财务人员。',
    '',
    '硬性规则（必须遵守）：',
    '1. 只能使用【数据集】中给出的数字。需要但未提供的数据，必须明确写"当前数据未提供"，并说明需要补什么字段；严禁编造或估算企业未提供的数据。',
    '2. 任何金额或比率都要写出算式和用到的字段，便于人工复核。',
    '3. 涉及"扣款"时，必须说明扣款是否已体现在原表利润中尚未核验，不得声称已造成损失，也不得把扣款再从利润里扣一次。',
    '4. 涉及员工薪酬时，不得建议降低员工应得工资；只能从合同定价、用工结构、服务量、人效等角度给建议。',
    '5. 管理决策类问题按"判断 → 传导路径 → 可执行动作（含责任部门/时间/衡量指标） → 风险与边界"组织，动作要具体可落地。',
    '6. 用简体中文回答，多用短句、清单和表格，简洁不啰嗦。不确定就说不确定。',
    '7. 单位统一为万元（人数为"人"、周转为"天"）。'
  ].join('\n');

  function buildContext(D) {
    var lines = [];
    lines.push('【数据集】');
    lines.push('来源：' + (D.source || '未标注'));
    lines.push('月份：' + (D.months[0] || '—') + ' 至 ' + (D.months[D.months.length - 1] || '—') + '，共 ' + D.months.length + ' 个月');
    lines.push('项目/实体：' + D.entities.join('、'));
    lines.push('');
    lines.push('【字段覆盖】（有值月份数 / 总月份数）');
    lines.push(FIELDS.map(function (f) { return f.name + ' ' + D.monthCov[f.key] + '/' + D.months.length; }).join('；'));
    lines.push('');
    lines.push('【月度明细】单位：万元；— 表示无数据');
    lines.push(['月份'].concat(FIELDS.map(function (f) { return f.name; })).join(','));
    D.months.forEach(function (p) {
      var recs = D.recsOf(p, null);
      var cells = [p].concat(FIELDS.map(function (f) {
        var v = D.sumKeys(recs, [f.key]);
        return v == null ? '—' : Number(v).toFixed(2);
      }));
      lines.push(cells.join(','));
    });
    lines.push('');
    lines.push('【派生指标】（区间口径：先汇总再相除）');
    RATIOS.forEach(function (r) {
      var v = D.ratioOf(r, D.months, null);
      if (v != null) lines.push(r.name + '：' + (r.pct ? (v * 100).toFixed(2) + '%' : Number(v).toFixed(2)));
    });
    if (D.findings.length) {
      lines.push('');
      lines.push('【本地规则已识别的待核查事项】（属待核查，不是已确认差错）');
      D.findings.slice(0, 8).forEach(function (x) { lines.push('- ' + x.period + ' ' + x.title + '（' + x.metric + '）'); });
    }
    lines.push('');
    lines.push('【重要边界】缺失字段不补零、不推算；无上年同期数据，不能算同比；无预算数据，不能算达成率。');
    return lines.join('\n');
  }

  function askLLM(q, D) {
    var cfg = S.cfg;
    var base = String(cfg.base || '').replace(/\/+$/, '');
    if (!base) return Promise.reject(new Error('未填写接口地址'));
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 60000);
    return fetch(base + '/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (cfg.key || '') },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        stream: false,
        messages: [
          { role: 'system', content: SYS_PROMPT },
          { role: 'user', content: buildContext(D) + '\n\n【问题】' + q }
        ]
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.text().catch(function () { return ''; }).then(function (t) {
          throw new Error('接口返回 ' + res.status + (t ? '：' + t.slice(0, 140) : ''));
        });
      }
      return res.json();
    }).then(function (j) {
      var text = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      if (!String(text).trim()) throw new Error('模型返回为空');
      return {
        kind: 'llm', engine: { mode: 'llm', label: cfg.model || '大模型' },
        title: '', lead: mdToHtml(text),
        notes: [
          '本次回答由外部大模型（' + E(cfg.model || '') + '）生成，随问题一起提交了当前数据摘要。',
          '数字请以 BI 看板与核对工作台的本地计算为准；大模型输出可能存在偏差，需人工复核。'
        ],
        followups: ['现在还有哪些字段没有数据？', '如果工资整体上涨 5%，净利率会掉到多少？']
      };
    }).finally(function () { clearTimeout(timer); });
  }

  function mdToHtml(md) {
    var lines = String(md || '').replace(/\r/g, '').split('\n');
    var out = [], i = 0, listOpen = false;
    function inline(s) {
      return E(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    }
    function splitRow(l) { return l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (s) { return s.trim(); }); }
    function closeList() { if (listOpen) { out.push('</ul>'); listOpen = false; } }
    while (i < lines.length) {
      var L = lines[i];
      if (/^\s*\|/.test(L) && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] || '')) {
        closeList();
        var head = splitRow(L), rows = [];
        i += 2;
        while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
        out.push('<div class="ai-table-wrap"><table class="ai-table"><thead><tr>' + head.map(function (h) { return '<th>' + inline(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>');
        continue;
      }
      if (/^\s*#{1,6}\s+/.test(L)) { closeList(); out.push('<div class="ai-a-sub">' + inline(L.replace(/^\s*#{1,6}\s+/, '')) + '</div>'); i++; continue; }
      if (/^\s*[-*·]\s+/.test(L) || /^\s*\d+[.、)]\s+/.test(L)) {
        if (!listOpen) { out.push('<ul class="ai-list">'); listOpen = true; }
        out.push('<li>' + inline(L.replace(/^\s*[-*·]\s+/, '').replace(/^\s*\d+[.、)]\s+/, '')) + '</li>');
        i++; continue;
      }
      if (!L.trim()) { closeList(); i++; continue; }
      closeList();
      out.push('<p style="margin:0 0 9px">' + inline(L) + '</p>');
      i++;
    }
    closeList();
    return out.join('');
  }

  /* ======================= 10. 渲染 ======================= */
  function tableHTML(t) {
    if (!t) return '';
    return '<div class="ai-table-wrap"><table class="ai-table"><thead><tr>'
      + t.columns.map(function (c) { return '<th>' + E(c) + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + t.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('')
      + '</tbody></table></div>'
      + (t.caption ? '<div class="ai-notes" style="margin-top:-4px">' + E(t.caption) + '</div>' : '');
  }
  function blockHTML(b) {
    var h = '<div class="ai-a-sub">' + E(b.t) + '</div>';
    if (b.type === 'chain') {
      return h + '<div class="ai-chain">' + b.items.map(function (it) {
        return '<div class="ai-chain-item"><div class="ai-chain-head"><span>' + it[0] + '</span><span class="ai-arrow">→</span><span>' + it[1] + '</span></div><p>' + it[2] + '</p></div>';
      }).join('') + '</div>';
    }
    if (b.type === 'sens') {
      return h + '<div class="ai-sens">' + b.items.map(function (it) {
        return '<div class="ai-sens-item"><div class="ai-sens-top"><span class="ai-sens-label">' + it.label + '</span><span class="ai-sens-value">' + it.value + '</span></div>'
          + (it.calc ? '<div class="ai-sens-calc">' + E(it.calc) + '</div>' : '')
          + (it.note ? '<div class="ai-sens-note">' + it.note + '</div>' : '') + '</div>';
      }).join('') + '</div>';
    }
    if (b.type === 'actions') {
      return h + '<div class="ai-actions">' + b.items.map(function (it) {
        return '<div class="ai-act"><div class="ai-act-t">' + it.t + '</div><div class="ai-act-d">' + it.d + '</div>'
          + '<div class="ai-act-meta">' + (it.h ? '<span>时间 <b>' + it.h + '</b></span>' : '') + (it.kpi ? '<span>衡量 <b>' + it.kpi + '</b></span>' : '') + '</div></div>';
      }).join('') + '</div>';
    }
    if (b.type === 'kv') {
      return h + '<div class="ai-kv">' + b.items.map(function (it) {
        return '<div class="ai-kv-row"><dt>' + E(it.k) + '</dt><dd>' + it.v + '</dd></div>';
      }).join('') + '</div>';
    }
    return h + '<ul class="ai-list' + (b.risk ? ' risk' : '') + '">' + b.items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>';
  }
  function answerHTML(a) {
    var parts = [];
    if (a.title) parts.push('<div class="ai-a-title">' + E(a.title) + '</div>');
    if (a.lead) parts.push('<div class="ai-a-lead">' + a.lead + '</div>');
    if (a.table) parts.push(tableHTML(a.table));
    (a.blocks || []).forEach(function (b) { parts.push(blockHTML(b)); });
    if (a.notes && a.notes.length) {
      parts.push('<div class="ai-notes"><b>口径与依据</b><ul>' + a.notes.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>');
    }
    if (a.followups && a.followups.length) {
      parts.push('<div class="ai-follow">' + a.followups.map(function (x) { return '<button type="button" data-ai-ask="' + E(x) + '">' + E(x) + '</button>'; }).join('') + '</div>');
    }
    return parts.join('');
  }
  function engineBadge(a) {
    var e = a.engine || { mode: 'local', label: '本地引擎' };
    var cls = e.mode === 'llm' ? 'llm' : (e.fallback ? 'fallback' : '');
    var label = e.mode === 'llm' ? ('大模型作答 · ' + (e.label || '')) : '本地引擎作答 · 数字由本机实时计算';
    if (e.fallback) label = '已回退本地引擎' + (e.reason ? '（' + e.reason.slice(0, 60) + '）' : '');
    return '<span class="ai-badge ' + cls + '"><span class="ai-badge-dot"></span>' + E(label) + '</span>';
  }
  function plainText(a) {
    var out = [];
    if (a.title) out.push(a.title);
    if (a.lead) out.push(String(a.lead).replace(/<[^>]+>/g, ''));
    if (a.table) {
      out.push(a.table.columns.join('\t'));
      a.table.rows.forEach(function (r) { out.push(r.map(function (c) { return String(c).replace(/<[^>]+>/g, ''); }).join('\t')); });
    }
    (a.blocks || []).forEach(function (b) {
      out.push('【' + b.t + '】');
      b.items.forEach(function (it) {
        if (b.type === 'chain') out.push(it[0] + ' → ' + it[1] + '：' + it[2]);
        else if (b.type === 'sens') out.push(it.label + '：' + it.value + (it.calc ? '（' + it.calc + '）' : ''));
        else if (b.type === 'actions') out.push('· ' + it.t + ' —— ' + it.d + (it.h ? '（' + it.h + '）' : ''));
        else if (b.type === 'kv') out.push(it.k + '：' + String(it.v).replace(/<[^>]+>/g, ''));
        else out.push('· ' + String(it).replace(/<[^>]+>/g, ''));
      });
    });
    if (a.notes) { out.push('【口径与依据】'); a.notes.forEach(function (x) { out.push('· ' + String(x).replace(/<[^>]+>/g, '')); }); }
    return out.join('\n');
  }

  /* ======================= 11. UI ======================= */
  var S = { open: false, msgs: [], busy: false, hosts: [], showSettings: false, cfg: loadCfg() };

  var CHIPS = [
    '3月社保支出和总部管理费各是多少？',
    '上半年哪个月扣款最高？',
    '工资收入比最高的月份是几月？',
    '如果利率下降 25 个基点，我们该做什么管理决策？',
    '如果工资整体上涨 5%，净利率会掉到多少？',
    '现在还有哪些字段没有数据？',
    '为什么扣款不能直接从原表利润里再扣一次？',
    '各项目净利润排名'
  ];

  function loadCfg() {
    var cfg = { on: false, preset: 'deepseek', base: PRESETS[0].base, model: PRESETS[0].model, key: '' };
    try {
      var raw = root.localStorage.getItem(CFG_KEY);
      if (raw) cfg = Object.assign(cfg, JSON.parse(raw) || {});
    } catch (e) { }
    return cfg;
  }
  function saveCfg() {
    try { root.localStorage.setItem(CFG_KEY, JSON.stringify(S.cfg)); } catch (e) { }
  }

  function welcomeHTML(D) {
    return '<div class="ai-welcome"><h4>AI 经营助手 · 已接入当前数据集</h4>'
      + '<ul>'
      + '<li><b>查数据</b>：任意月份 / 项目 / 字段组合，包括 BI 看板未单独展示的社保、增值税、附加税、总部管理费、风险准备金、开票金额、扣款分月明细。</li>'
      + '<li><b>算指标</b>：工资收入比、毛利率、净利率、扣款率、费用率等，给出算式与参与月份。</li>'
      + '<li><b>做测算与决策</b>：如"工资上涨 5% 净利率会怎样""利率下降该做什么管理决策"。</li>'
      + '</ul>'
      + '<div class="ai-welcome-foot">当前数据：' + (D.months.length ? D.months[0] + ' — ' + D.months[D.months.length - 1] + '，' + D.months.length + ' 个月，' + D.records.length + ' 条记录' : '尚未导入数据')
      + '。所有数字由本机实时计算，可追溯到源字段；结论性判断需人工复核。</div></div>';
  }

  function msgsHTML() {
    var D = buildData();
    var out = [welcomeHTML(D)];
    S.msgs.forEach(function (m) {
      if (m.role === 'user') {
        out.push('<div class="ai-msg ai-user"><div class="ai-bubble">' + E(m.text) + '</div></div>');
        return;
      }
      var a = m.answer || {};
      if (a.kind === 'error') {
        out.push('<div class="ai-msg ai-bot">' + engineBadge(a) + '<div class="ai-bubble ai-err">' + (a.title ? '<b>' + E(a.title) + '</b><br>' : '') + (a.lead || '') + '</div></div>');
        return;
      }
      out.push('<div class="ai-msg ai-bot">' + engineBadge(a) + '<div class="ai-bubble">' + answerHTML(a) + '</div>'
        + '<div class="ai-answer-actions"><button type="button" class="ai-mini" data-ai-copy="' + S.msgs.indexOf(m) + '">复制回答</button></div></div>');
    });
    if (S.busy) out.push('<div class="ai-typing"><i></i><i></i><i></i><span>正在计算…</span></div>');
    return out.join('');
  }

  function renderMsgs() {
    S.hosts = S.hosts.filter(function (r) { return root.document.body.contains(r.host); });
    S.hosts.forEach(function (r) {
      r.scroll.innerHTML = msgsHTML();
      r.scroll.scrollTop = r.scroll.scrollHeight;
    });
    updateFab();
  }
  function updateFab() {
    var fab = root.document.getElementById('aiFab');
    if (!fab) return;
    var dot = fab.querySelector('.ai-fab-dot');
    if (dot) dot.className = 'ai-fab-dot' + (S.cfg.on && S.cfg.key ? ' llm' : '');
  }

  function skeleton(variant) {
    var suggest = '<div class="ai-suggest">' + CHIPS.map(function (c) { return '<button type="button" data-ai-ask="' + E(c) + '">' + E(c) + '</button>'; }).join('') + '</div>';
    var chat = '<div class="ai-chat"><div class="ai-scroll"></div>'
      + '<div class="ai-inputbar">' + suggest
      + '<div class="ai-inputrow"><textarea rows="1" placeholder="输入你的问题，例如：3月社保支出是多少" aria-label="提问"></textarea>'
      + '<select class="ai-model" aria-label="选择作答模型" title="选择作答模型">'
      + '<option value="local">本地引擎</option>'
      + PRESETS.map(function (p) {
          var sel = (S.cfg.on && S.cfg.key && S.cfg.preset === p.id) ? ' selected' : '';
          return '<option value="' + p.id + '"' + sel + '>' + E(p.name) + '</option>';
        }).join('')
      + '</select>'
      + '<button type="button" class="ai-send">发送</button></div>'

      + '<div class="ai-inputhint">回车发送，Shift+回车换行。回答中的数字由本机按当前导入数据实时计算；管理建议需人工复核。</div>'
      + '</div></div>';
    if (variant === 'page') {
      var side = '<aside class="ai-side">'
        + '<div class="ai-side-card"><h3><span class="ai-side-ico">1</span>能查什么</h3><p>当前数据集里的<b>全部字段</b>都可以按月份 / 项目自由组合查询，不限于 BI 看板上已展示的专题。</p>'
        + '<ul><li>社保支出、综合保障、增值税、附加税、总部管理费、风险准备金</li><li>开票金额、扣款分月明细</li><li>工资收入比、毛利率、净利率、扣款率、费用率</li></ul></div>'
        + '<div class="ai-side-card"><h3><span class="ai-side-ico">2</span>能算什么</h3><p>用当前数据做敏感性测算，例如：</p>'
        + '<ul><li>工资上涨 3% / 5% / 8% 对净利率的影响</li><li>社保基数上调 5% / 10% 的影响</li><li>利率变动 25BP 的资金成本测算</li></ul></div>'
        + '<div class="ai-side-card"><h3><span class="ai-side-ico">3</span>试试这些</h3><div class="ai-side-ask">'
        + ['3月社保支出和总部管理费各是多少？', '上半年哪个月扣款最高？', '如果利率下降 25 个基点，我们该做什么管理决策？', '现在还有哪些字段没有数据？']
          .map(function (c) { return '<button type="button" data-ai-ask="' + E(c) + '">' + E(c) + '</button>'; }).join('')
        + '</div></div>'
        + '<div class="ai-side-card"><h3><span class="ai-side-ico">4</span>边界</h3><p class="ai-side-note">默认由<b>本地规则引擎</b>作答，全程离线、数字可追溯到源字段。可在右下角悬浮球或齿轮里可选接入大模型；未配置或调用失败时自动回退本地引擎。</p></div>'
        + '</aside>';
      return '<div class="ai-page-grid">' + side + chat + '</div>';
    }
    return chat;
  }

  function mount(host, variant) {
    if (!host || host.dataset.aiMounted) return;
    host.dataset.aiMounted = '1';
    host.innerHTML = skeleton(variant);
    var refs = {
      host: host,
      scroll: host.querySelector('.ai-scroll'),
      input: host.querySelector('.ai-inputrow textarea'),
      send: host.querySelector('.ai-send'),
      modelSel: host.querySelector('.ai-model'),
      suggest: host.querySelector('.ai-suggest')
    };
    var doSend = function () {
      var v = refs.input.value;
      if (!v.trim()) return;
      applyModelChoice(refs.modelSel ? refs.modelSel.value : 'local');
      refs.input.value = '';
      ask(v);
    };

    refs.send.addEventListener('click', doSend);
    refs.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
    host.addEventListener('click', function (e) {
      var askBtn = e.target.closest('[data-ai-ask]');
      if (askBtn) { ask(askBtn.dataset.aiAsk); return; }
      var copyBtn = e.target.closest('[data-ai-copy]');
      if (copyBtn) {
        var m = S.msgs[Number(copyBtn.dataset.aiCopy)];
        if (m && m.answer) copyText(plainText(m.answer), copyBtn);
      }
    });
    S.hosts.push(refs);
    renderMsgs();
  }

  function copyText(text, btn) {
    var done = function () {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = old; }, 1400);
    };
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else { fallbackCopy(text, done); }
  }
  function fallbackCopy(text, done) {
    try {
      var ta = root.document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      root.document.body.appendChild(ta);
      ta.select();
      root.document.execCommand('copy');
      root.document.body.removeChild(ta);
      done();
    } catch (e) { }
  }
    /* 发送前读取输入区的模型下拉：local=本地引擎；其余按 PRESETS id 切换大模型 */
  function applyModelChoice(id) {
    if (!id || id === 'local') { S.cfg.on = false; saveCfg(); updateFab(); return; }
    var p = null;
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === id) { p = PRESETS[i]; break; }
    }
    if (!p) { S.cfg.on = false; saveCfg(); updateFab(); return; }
    S.cfg.preset = p.id;
    if (p.base) S.cfg.base = p.base;
    if (p.model) S.cfg.model = p.model;
    S.cfg.on = true;   /* 未填 API Key 时 ask() 会自动回退本地引擎，与现有逻辑一致 */
    saveCfg();         /* 写回 localStorage，刷新后仍生效 */
    updateFab();       /* 同步右下角悬浮球的指示灯状态 */
  }

  function ask(text) {
    var q = String(text || '').trim();
    if (!q || S.busy) return;
    S.msgs.push({ role: 'user', text: q });
    S.busy = true;
    renderMsgs();
    S.hosts.forEach(function (r) { if (r.input) r.input.value = ''; });

    var D = buildData();
    var finish = function (a) {
      S.msgs.push({ role: 'ai', answer: a });
      S.busy = false;
      renderMsgs();
    };
    if (S.cfg.on && S.cfg.key && S.cfg.base && S.cfg.model) {
      askLLM(q, D).then(function (a) { finish(a); }, function (err) {
        var local = localAnswer(q);
        local.engine = { mode: 'local', label: '本地引擎', fallback: true, reason: (err && err.message) || '调用失败' };
        finish(local);
      });
      return;
    }
    setTimeout(function () { finish(localAnswer(q)); }, 260);
  }

  /* ---------- 悬浮球与抽屉 ---------- */
  function buildShell() {
    var doc = root.document;
    if (doc.getElementById('aiFab')) return;
    var fab = doc.createElement('button');
    fab.id = 'aiFab';
    fab.type = 'button';
    fab.className = 'ai-fab';
    fab.setAttribute('aria-label', '打开 AI 经营助手');
    fab.innerHTML = '<span class="ai-fab-icon">✦</span><span class="ai-fab-dot"></span><span class="ai-fab-label">AI 助手</span>';

    var scrim = doc.createElement('div');
    scrim.id = 'aiScrim';
    scrim.className = 'ai-scrim';

    var drawer = doc.createElement('div');
    drawer.id = 'aiDrawer';
    drawer.className = 'ai-drawer';
    drawer.innerHTML = '<div class="ai-drawer-head">'
      + '<div class="ai-drawer-title"><span class="ai-live"></span>AI 经营助手<small>才薪云 · 交互原型</small></div>'
      + '<div class="ai-drawer-actions"><button type="button" class="ai-icon-btn" id="aiSettingsBtn" title="模型设置" aria-label="模型设置">⚙</button><button type="button" class="ai-icon-btn" id="aiCloseBtn" title="收起" aria-label="收起">✕</button></div>'
      + '</div>'
      + '<div class="ai-host" id="aiDrawerHost"></div>'
      + '<div class="ai-settings" id="aiSettings"></div>';

    doc.body.appendChild(fab);
    doc.body.appendChild(scrim);
    doc.body.appendChild(drawer);

    fab.addEventListener('click', function () { toggleDrawer(true); });
    scrim.addEventListener('click', function () { toggleDrawer(false); });
    doc.getElementById('aiCloseBtn').addEventListener('click', function () { toggleDrawer(false); });
    doc.getElementById('aiSettingsBtn').addEventListener('click', function () { openSettings(); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.open) toggleDrawer(false); });

    mount(doc.getElementById('aiDrawerHost'), 'drawer');
  }

  function toggleDrawer(open) {
    var doc = root.document;
    S.open = !!open;
    var d = doc.getElementById('aiDrawer'), s = doc.getElementById('aiScrim');
    if (!d) return;
    d.classList.toggle('open', S.open);
    s.classList.toggle('open', S.open);
    if (S.open) {
      S.hosts = S.hosts.filter(function (r) { return doc.body.contains(r.host); });
      renderMsgs();
      var r = S.hosts.filter(function (x) { return x.host.id === 'aiDrawerHost'; })[0];
      if (r && r.input) setTimeout(function () { r.input.focus(); }, 280);
    }
  }

  /* ---------- 设置面板 ---------- */
  function openSettings() {
    var doc = root.document, box = doc.getElementById('aiSettings');
    if (!box) return;
    S.showSettings = true;
    var cfg = S.cfg;
    box.innerHTML = '<h3>模型设置（可选）</h3>'
      + '<p class="ai-set-lead">默认使用<b>本地规则引擎</b>：完全离线、数字由本机实时计算。填写下面的信息后，问题会连同当前数据摘要一起提交给你指定的大模型；未配置、断网或调用失败时，会自动回退本地引擎并在回答上标注。</p>'
      + '<div class="ai-set-toggle"><input type="checkbox" id="aiCfgOn" ' + (cfg.on ? 'checked' : '') + '><div><b>启用大模型作答</b>关闭后全部走本地引擎（答辩推荐保持关闭）</div></div>'
      + '<div class="ai-set-msg" id="aiSetMsg"></div>'
      + '<div class="ai-set-row"><b>服务商</b><select id="aiCfgPreset">' + PRESETS.map(function (p) { return '<option value="' + p.id + '" ' + (cfg.preset === p.id ? 'selected' : '') + '>' + E(p.name) + '</option>'; }).join('') + '</select><small>选择后会自动填入接口地址与模型名，可再手工修改</small></div>'
      + '<div class="ai-set-row"><b>接口地址（Base URL）</b><input id="aiCfgBase" type="text" value="' + E(cfg.base) + '" placeholder="https://api.deepseek.com/v1"><small>需兼容 OpenAI 的 <code>/chat/completions</code> 接口</small></div>'
      + '<div class="ai-set-row"><b>模型名</b><input id="aiCfgModel" type="text" value="' + E(cfg.model) + '" placeholder="deepseek-chat"></div>'
      + '<div class="ai-set-row"><b>API Key</b><input id="aiCfgKey" type="password" value="' + E(cfg.key) + '" placeholder="sk-..."><small>只保存在本机浏览器（localStorage），不会随原型文件分发</small></div>'
      + '<div class="ai-set-actions"><button type="button" class="ai-primary" id="aiCfgSave">保存</button><button type="button" class="ai-ghost" id="aiCfgTest">测试连接</button><button type="button" class="ai-ghost" id="aiCfgCopy">复制数据摘要</button><button type="button" class="ai-ghost" id="aiCfgClear">清除</button><button type="button" class="ai-ghost" id="aiCfgBack">返回对话</button></div>'
      + '<div class="ai-set-block"><b>为什么默认关闭？</b>原型需要能在<b>断网、无密钥</b>的答辩环境双击运行。本地引擎覆盖了数据查询、敏感性测算与管理决策手册，不依赖网络；大模型只是"可选增强"。'
      + '<ul><li>直接双击打开 <code>index.html</code>（file:// 协议）时，浏览器可能拦截跨域请求，导致大模型调用失败——此时会自动回退本地引擎。</li>'
      + '<li>若要用大模型，建议用本地静态服务打开（例如在文件夹里执行 <code>python3 -m http.server 8000</code>，再访问 <code>http://localhost:8000</code>）。</li>'
      + '<li>不想配置密钥时，可以点"复制数据摘要"，把当前数据与提问粘贴到任意外部大模型里。</li></ul></div>';

    box.classList.add('open');
    box.querySelector('#aiCfgBack').addEventListener('click', closeSettings);
    box.querySelector('#aiCfgPreset').addEventListener('change', function (e) {
      var p = PRESETS.filter(function (x) { return x.id === e.target.value; })[0];
      if (p && p.id !== 'custom') {
        box.querySelector('#aiCfgBase').value = p.base;
        box.querySelector('#aiCfgModel').value = p.model;
      }
    });
    box.querySelector('#aiCfgSave').addEventListener('click', function () {
      S.cfg = {
        on: box.querySelector('#aiCfgOn').checked,
        preset: box.querySelector('#aiCfgPreset').value,
        base: box.querySelector('#aiCfgBase').value.trim(),
        model: box.querySelector('#aiCfgModel').value.trim(),
        key: box.querySelector('#aiCfgKey').value.trim()
      };
      saveCfg();
      setMsg('已保存。' + (S.cfg.on && S.cfg.key ? '下次提问将使用大模型，失败自动回退本地引擎。' : '当前使用本地引擎作答。'), 'ok');
      updateFab();
    });
    box.querySelector('#aiCfgClear').addEventListener('click', function () {
      S.cfg = { on: false, preset: 'deepseek', base: PRESETS[0].base, model: PRESETS[0].model, key: '' };
      saveCfg();
      openSettings();
      setMsg('已清除并恢复为本地引擎。', 'ok');
      updateFab();
    });
    box.querySelector('#aiCfgCopy').addEventListener('click', function () {
      var D = buildData();
      copyText(buildContext(D) + '\n\n【我的问题】\n（请把问题写在这里，然后把以上内容整段粘贴给任意大模型）', box.querySelector('#aiCfgCopy'));
    });
    box.querySelector('#aiCfgTest').addEventListener('click', function () {
      var btn = box.querySelector('#aiCfgTest');
      S.cfg = {
        on: true,
        preset: box.querySelector('#aiCfgPreset').value,
        base: box.querySelector('#aiCfgBase').value.trim(),
        model: box.querySelector('#aiCfgModel').value.trim(),
        key: box.querySelector('#aiCfgKey').value.trim()
      };
      if (!S.cfg.base || !S.cfg.model || !S.cfg.key) { setMsg('请先填写接口地址、模型名和 API Key。', 'err'); return; }
      btn.disabled = true; btn.textContent = '测试中…';
      askLLM('请用一句话确认你能读到数据，并说出当前有几个月的记录。', buildData()).then(function () {
        setMsg('连接成功，模型可正常返回内容。', 'ok');
      }, function (err) {
        setMsg('调用失败：' + ((err && err.message) || '未知错误') + '　（提示：file:// 打开时可能被跨域拦截，可改用本地静态服务；也可点"复制数据摘要"粘贴到外部模型。）', 'err');
      }).finally(function () {
        btn.disabled = false; btn.textContent = '测试连接';
      });
    });
  }
  function setMsg(text, kind) {
    var el = root.document.getElementById('aiSetMsg');
    if (!el) return;
    el.className = 'ai-set-msg show ' + (kind || 'ok');
    el.textContent = text;
  }
  function closeSettings() {
    var box = root.document.getElementById('aiSettings');
    if (box) box.classList.remove('open');
    S.showSettings = false;
  }

  /* ======================= 12. 对外接口 ======================= */
  function afterRender() {
    var doc = root.document;
    if (!doc) return;
    if (!doc.getElementById('aiFab')) buildShell();
    S.hosts = S.hosts.filter(function (r) { return doc.body.contains(r.host); });
    var pageHost = doc.getElementById('aiPageHost');
    if (pageHost) mount(pageHost, 'page');
    var drawerHost = doc.getElementById('aiDrawerHost');
    if (drawerHost && !drawerHost.dataset.aiMounted) mount(drawerHost, 'drawer');
    renderMsgs();
  }

  root.CaiXinAI = {
    ask: function (q) { ask(q); },
    localAnswer: localAnswer,
    buildData: buildData,
    buildContext: buildContext,
    openDrawer: function () { toggleDrawer(true); },
    afterRender: afterRender,
    _internal: { pickFields: pickFields, parseScope: parseScope, parseIntent: parseIntent, pickEntity: pickEntity, PLAYBOOKS: PLAYBOOKS, FIELDS: FIELDS, RATIOS: RATIOS, EXPLAINS: EXPLAINS, norm: norm }
  };

  if (root.document) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', afterRender);
    } else {
      afterRender();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
