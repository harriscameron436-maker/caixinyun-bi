/* ===== 才薪云 · 数据可视化交互增强层 =====
   只读增强：不改任何业务数字、不动 bi.js / bi2.js / app.js 逻辑。
   ① 浏览器原生 tooltip 换成跟随定位的深色提示卡  ② 折线绘制动画
   ③ 图例点击切换序列显隐  ④ 指标数字滚动  ⑤ MutationObserver 自动挂载 */
(function (root) {
  'use strict';
  var reduce = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- 1. 统一定位提示框 ---------- */
  var tip = document.createElement('div');
  tip.className = 'cx-tip'; tip.setAttribute('role', 'status'); tip.hidden = true;
  document.body.appendChild(tip);
  function place(x, y) {
    var w = tip.offsetWidth, h = tip.offsetHeight, vw = root.innerWidth, vh = root.innerHeight;
    if (x + 16 + w > vw - 8) x = Math.max(8, x - w - 16);
    if (y + 16 + h > vh - 8) y = Math.max(8, y - h - 16);
    tip.style.transform = 'translate3d(' + (x + 16) + 'px,' + (y + 16) + 'px,0)';
  }
  function openTip(html, x, y) { tip.innerHTML = html; tip.hidden = false; place(x, y); }
  function shutTip() { tip.hidden = true; }
  document.addEventListener('mouseover', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
    if (el) openTip(el.getAttribute('data-tip'), e.clientX, e.clientY);
  });
  document.addEventListener('mousemove', function (e) { if (!tip.hidden) place(e.clientX, e.clientY); });
  document.addEventListener('mouseout', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
    if (el) shutTip();
  });
  root.addEventListener('scroll', shutTip, true);

  /* ---------- 2. 图表武装：<title> → data-tip + 折线描绘动画 ---------- */
  function armChart(svg) {
    if (!svg || svg.dataset.armed) return;
    svg.dataset.armed = '1';
    Array.prototype.forEach.call(svg.querySelectorAll('title'), function (t) {
      var p = t.parentNode, txt = (t.textContent || '').trim();
      if (txt) { p.setAttribute('data-tip', txt); p.setAttribute('aria-label', txt); }
      if (t.parentNode) t.parentNode.removeChild(t);
    });
    if (reduce) return;
    Array.prototype.forEach.call(svg.querySelectorAll('path[stroke]'), function (p) {
      if ((p.getAttribute('fill') || '') !== 'none') return;
      var len = 0;
      try { len = p.getTotalLength ? p.getTotalLength() : 0; } catch (err) { len = 0; }
      if (!len) return;
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
      p.style.transition = 'stroke-dashoffset .9s cubic-bezier(.22,.61,.36,1)';
      requestAnimationFrame(function () { p.style.strokeDashoffset = '0'; });
    });
  }

  /* ---------- 3. 图例点击切换序列显隐 ---------- */
  function armLegend(lg) {
    if (lg.dataset.armed) return;
    lg.dataset.armed = '1';
    lg.removeAttribute('title');
    var i = lg.querySelector('i'), st = (i && i.getAttribute('style')) || '';
    var m = /#[0-9a-fA-F]{3,8}|rgba?$[^)]+$/.exec(st);
    if (m) lg.dataset.series = m[0];
    lg.setAttribute('role', 'button'); lg.tabIndex = 0;
  }
  document.addEventListener('click', function (e) {
    var lg = e.target.closest && e.target.closest('.bi2-legend .bi2-lg');
    if (!lg || !lg.dataset.series) return;
    var off = lg.classList.toggle('off');
    var svg = lg.nextElementSibling;
    if (!svg || svg.tagName.toLowerCase() !== 'svg') {
      var host = lg.closest('.bi-section') || lg.closest('.bi-root');
      svg = host && host.querySelector('svg.bi-chart');
    }
    if (!svg) return;
    Array.prototype.forEach.call(svg.querySelectorAll('rect[fill="' + lg.dataset.series + '"]'), function (r) {
      r.style.opacity = off ? '.12' : '';
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var lg = e.target.closest && e.target.closest('.bi2-legend .bi2-lg');
    if (!lg) return;
    e.preventDefault(); lg.click();
  });

  /* ---------- 4. 指标数字滚动 ---------- */
  function countUp(el) {
    if (reduce || el.dataset.counted) return;
    var raw = (el.textContent || '').trim();
    if (!/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(raw) && !/^-?\d+(\.\d+)?$/.test(raw)) return;
    el.dataset.counted = '1';
    var neg = raw.charAt(0) === '-';
    var dec = (raw.replace(/[-+]/g, '').split('.')[1] || '').length;
    var end = parseFloat(raw.replace(/,/g, ''));
    if (!isFinite(end) || end <= 0) { el.removeAttribute('data-counted'); return; }
    function fmt(v) {
      var s = Math.abs(v).toFixed(dec).split('.');
      s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return (neg ? '-' : '') + s.join('.');
    }
    var t0 = null, DUR = 620;
    (function frame(ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / DUR);
      el.textContent = fmt(end * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(frame); else el.textContent = raw;
    })(typeof performance !== 'undefined' ? performance.now() : 0);
  }

  /* ---------- 5. 视图变化自动武装 ---------- */
  function sweep(node) {
    if (!node || node.nodeType !== 1 || !node.querySelectorAll) return;
    if (node.matches && node.matches('svg.bi-chart')) armChart(node);
    Array.prototype.forEach.call(node.querySelectorAll('svg.bi-chart'), armChart);
    Array.prototype.forEach.call(node.querySelectorAll('.bi2-legend .bi2-lg'), armLegend);
    Array.prototype.forEach.call(node.querySelectorAll('.stat strong,.bi-card-value'), countUp);
  }
  var view = document.getElementById('view');
  if (root.MutationObserver) {
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++)
        for (var j = 0; j < list[i].addedNodes.length; j++) sweep(list[i].addedNodes[j]);
    }).observe(document.body, { childList: true, subtree: true });
  } else { setInterval(function () { sweep(view); }, 700); }
  sweep(view);

  root.CaiXinUI = { armChart: armChart, countUp: countUp, tip: openTip, hideTip: shutTip, sweep: sweep };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* 左侧导航手风琴：点击主模块标题展开/收起（事件委托，重渲染后仍有效）*/
document.addEventListener('click', function (e) {
  var cap = e.target.closest('[data-rail-toggle]');
  if (!cap) return;
  var group = cap.closest('.bi-rail-group');
  if (!group) return;
  var open = group.classList.toggle('open');
  cap.setAttribute('aria-expanded', open ? 'true' : 'false');
});

/* ===== KPI 卡 sparkline 装饰器 =====
   零侵入：渲染后自动给 .bi-kpi-card[data-bi-metric] 注入微型趋势 SVG。
   数据源 = app.js 每个 render 后写入的 window.CaiXinData（原始 records + 当前月份）。
   口径与平台一致：同月多项目先汇总；比率卡（标题含"率/比"）先汇总再相除。 */
(function(){
  function inRange(rows, upto){
    var out=[];
    for (var i=0;i<rows.length;i++){
      var r=rows[i];
      if (r && r.period && r.period<=upto) out.push(r);
    }
    out.sort(function(a,b){return a.period<b.period?-1:a.period>b.period?1:0});
    return out;
  }
  /* 绝对值序列：同月多项目求和 */
  function absSeries(metric, records, upto){
    var rows=inRange(records.filter(function(r){return r[metric]!=null&&isFinite(Number(r[metric]))}),upto);
    var order=[],sum={};
    for (var i=0;i<rows.length;i++){var p=rows[i].period;if(sum[p]==null){sum[p]=0;order.push(p)}sum[p]+=Number(rows[i][metric])}
    return order.map(function(p){return {period:p,value:sum[p]}});
  }
  /* 比率序列：先汇总分子分母再相除（×100） */
  function ratioSeries(metric, records, upto){
    var rows=inRange(records,upto);
    var order=[],m={},rev={};
    for (var i=0;i<rows.length;i++){
      var r=rows[i],p=r.period;
      if(order.indexOf(p)<0)order.push(p);
      if(r[metric]!=null&&isFinite(Number(r[metric])))m[p]=(m[p]||0)+Number(r[metric]);
      if(r.revenue!=null&&isFinite(Number(r.revenue))&&Number(r.revenue)>0)rev[p]=(rev[p]||0)+Number(r.revenue);
    }
    return order.filter(function(p){return m[p]!=null&&rev[p]!=null}).map(function(p){return {period:p,value:m[p]/rev[p]*100}});
  }
  function sparkSVG(pts){
    if(pts.length<2)return '';
    var W=200,H=34,PAD=4,n=pts.length;
    var vals=pts.map(function(p){return p.value});
    var min=Math.min.apply(null,vals.concat([0])),max=Math.max.apply(null,vals.concat([0]));
    if(max-min<1e-9)max=min+1;
    var x=function(i){return PAD+i*(W-PAD*2)/(n-1)};
    var y=function(v){return H-PAD-(v-min)/(max-min)*(H-PAD*2)};
    var line='';
    for(var i=0;i<n;i++)line+=(i?'L':'M')+x(i).toFixed(1)+' '+y(pts[i].value).toFixed(1)+' ';
    var area=line+'L'+x(n-1).toFixed(1)+' '+(H-PAD)+' L'+x(0).toFixed(1)+' '+(H-PAD)+' Z';
    var zeroY=(min<0&&max>0)?y(0).toFixed(1):'';
    var last=pts[n-1];
    return '<svg class="bi-kpi-spark" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img" aria-label="近'+n+'个月趋势">'
      +'<path class="spark-area" d="'+area+'"/>'
      +(zeroY!==''?'<line class="spark-zero" x1="'+PAD+'" y1="'+zeroY+'" x2="'+(W-PAD)+'" y2="'+zeroY+'" vector-effect="non-scaling-stroke"/>':'')
      +'<path class="spark-line" d="'+line+'" vector-effect="non-scaling-stroke"/>'
      +'<circle class="spark-end" cx="'+x(n-1).toFixed(1)+'" cy="'+y(last.value).toFixed(1)+'" r="2.8" fill="'+(last.value<0?'#bf5348':'#277d78')+'"/>'
      +'</svg>';
  }
  function decorate(){
    var D=window.CaiXinData;
    if(!D||!D.records||!D.records.length)return;
    var cards=document.querySelectorAll('.bi-kpi-card[data-bi-metric]');
    for(var i=0;i<cards.length;i++){
      var c=cards[i];
      if(c.getAttribute('data-sparked')==='1')continue;
      var metric=c.getAttribute('data-bi-metric');
      var title=(c.querySelector('.bi-card-title')||{}).textContent||'';
      var pts=/[率比]/.test(title)?ratioSeries(metric,D.records,D.month):absSeries(metric,D.records,D.month);
      var svg=sparkSVG(pts);
      c.setAttribute('data-sparked','1');
      if(!svg)continue;
      var note=c.querySelector('.bi-card-note');
      if(note)note.insertAdjacentHTML('beforebegin',svg);
      else c.insertAdjacentHTML('beforeend',svg);
    }
  }
  var view=document.getElementById('view');
  if(view&&window.MutationObserver){
    new MutationObserver(function(){decorate()}).observe(view,{childList:true,subtree:true});
  }
  if(document.readyState!=='loading')decorate();
  else window.addEventListener('DOMContentLoaded',decorate);
})();

/* ===== 明暗主题切换：固定按钮 + localStorage 持久化（事件委托，重渲染不受影响）===== */
(function(){
  var KEY='caixinyun-theme';
  var SUN='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.3M12 19.1v2.3M2.6 12h2.3M19.1 12h2.3M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/></svg>';
  var MOON='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.2 14.6A8.5 8.5 0 0 1 9.4 3.8 8.5 8.5 0 1 0 20.2 14.6Z"/></svg>';
  function current(){return document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light';}
  function paint(){
    var btn=document.getElementById('themeToggle');
    if(!btn)return;
    var dark=current()==='dark';
    btn.innerHTML='<span class="tt-ico">'+(dark?SUN:MOON)+'</span><span>'+(dark?'日间模式':'夜间模式')+'</span>';
    btn.setAttribute('aria-label',dark?'切换到日间模式':'切换到夜间模式');
    btn.title=dark?'切换到日间模式':'切换到夜间模式';
  }
  function apply(t){
    var html=document.documentElement;
    html.classList.add('theme-swap');
    html.setAttribute('data-theme',t);
    try{localStorage.setItem(KEY,t);}catch(e){}
    paint();
    setTimeout(function(){html.classList.remove('theme-swap');},280);
  }
  document.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('#themeToggle'):null;
    if(!b)return;
    apply(current()==='dark'?'light':'dark');
  });
  /* 未手动选择过时跟随系统主题变化 */
  try{
    var mq=window.matchMedia('(prefers-color-scheme: dark)');
    var onChange=function(ev){
      var saved=null;try{saved=localStorage.getItem(KEY);}catch(e){}
      if(saved)return;
      document.documentElement.setAttribute('data-theme',ev.matches?'dark':'light');paint();
    };
    if(mq.addEventListener)mq.addEventListener('change',onChange);
    else if(mq.addListener)mq.addListener(onChange);
  }catch(e){}
  paint();
})();

/* ===== 悬浮球拖拽：#themeToggle（夜间模式）与 .ai-fab（AI 助手）可拖动 =====
   指针事件实现：位移未超 5px 视为点击（不触发拖动）；首次真正移动时把
   right/bottom 锚定一次性换算为 left/top；移动中钳制在视口内（留 8px 边距，
   拖不飞出屏幕）；松手后吞掉紧随的那次 click，避免误触发开关 / 抽屉；
   窗口缩放后对已拖动的球重新钳位。事件委托，ai-fab 动态创建后自动生效。 */
(function(){
  var SEL='#themeToggle, .ai-fab';
  var MARGIN=8, THRESHOLD=5;
  function clamp(v,min,max){return v<min?min:(v>max?max:v);}
  function reClamp(){
    var els=document.querySelectorAll(SEL);
    for(var i=0;i<els.length;i++){
      var el=els[i];
      if(!el.style.left)continue;
      var w=el.offsetWidth,h=el.offsetHeight;
      el.style.left=clamp(parseFloat(el.style.left)||0,MARGIN,window.innerWidth-w-MARGIN)+'px';
      el.style.top=clamp(parseFloat(el.style.top)||0,MARGIN,window.innerHeight-h-MARGIN)+'px';
    }
  }
  document.addEventListener('pointerdown',function(e){
    var el=e.target&&e.target.closest?e.target.closest(SEL):null;
    if(!el)return;
    if(e.pointerType==='mouse'&&e.button!==0)return;
    var rect=el.getBoundingClientRect();
    var startX=e.clientX,startY=e.clientY;
    var originLeft=rect.left,originTop=rect.top;
    var moved=false;
    function localize(){
      el.style.right='auto';el.style.bottom='auto';
      el.style.left=originLeft+'px';el.style.top=originTop+'px';
    }
    function onMove(ev){
      var dx=ev.clientX-startX,dy=ev.clientY-startY;
      if(!moved){
        if(Math.abs(dx)<THRESHOLD&&Math.abs(dy)<THRESHOLD)return;
        moved=true;localize();
        try{el.setPointerCapture(ev.pointerId);}catch(err){}
        document.body.style.userSelect='none';
      }
      var w=el.offsetWidth,h=el.offsetHeight;
      el.style.left=clamp(originLeft+dx,MARGIN,window.innerWidth-w-MARGIN)+'px';
      el.style.top=clamp(originTop+dy,MARGIN,window.innerHeight-h-MARGIN)+'px';
    }
    function onUp(){
      document.removeEventListener('pointermove',onMove);
      document.removeEventListener('pointerup',onUp);
      document.removeEventListener('pointercancel',onUp);
      document.body.style.userSelect='';
      if(moved){
        var swallow=function(ce){
          ce.preventDefault();ce.stopPropagation();
          document.removeEventListener('click',swallow,true);
        };
        document.addEventListener('click',swallow,true);
        setTimeout(function(){document.removeEventListener('click',swallow,true);},400);
      }
    }
    document.addEventListener('pointermove',onMove);
    document.addEventListener('pointerup',onUp);
    document.addEventListener('pointercancel',onUp);
  });
  window.addEventListener('resize',reClamp);
})();

/* ===== 文案统一：JS 动态生成的"智能问答 / 智能助手"替换为"问问ai / ai助手" =====
   静态文案已在 HTML 内直接改正；这里兜底 bi.js 等渲染出的文本，
   MutationObserver 跟随每次重渲染，粘贴本文件即可生效、无需改 JS。 */
(function(){
  var MAP=[['智能问答','问问ai'],['智能助手','ai助手']];
  function patchTextNode(node){
    var v=node.nodeValue;
    if(!v||v.indexOf('智能')<0)return;
    var p=node.parentNode;
    if(p&&(p.nodeName==='SCRIPT'||p.nodeName==='STYLE'||p.nodeName==='TEXTAREA'))return;
    for(var i=0;i<MAP.length;i++)v=v.split(MAP[i][0]).join(MAP[i][1]);
    node.nodeValue=v;
  }
  function patch(node){
    if(!node)return;
    if(node.nodeType===3){patchTextNode(node);return;}
    if(node.nodeType!==1)return;
    if(node.nodeName==='SCRIPT'||node.nodeName==='STYLE')return;
    var kids=node.childNodes;
    for(var j=0;j<kids.length;j++)patch(kids[j]);
  }
  function boot(){
    patch(document.body);
    if(window.MutationObserver){
      new MutationObserver(function(list){
        for(var i=0;i<list.length;i++){
          var added=list[i].addedNodes;
          for(var j=0;j<added.length;j++)patch(added[j]);
        }
      }).observe(document.body,{childList:true,subtree:true});
    }
  }
  if(document.readyState!=='loading')boot();
  else window.addEventListener('DOMContentLoaded',boot);
})();
(() => {
  'use strict';
  const app = document.querySelector('.app');
  const view = document.querySelector('#view');
  const menu = document.querySelector('#cxMenu');
  const backdrop = document.querySelector('#cxBackdrop');
  const theme = document.querySelector('#cxTheme');
  const themeBox = document.querySelector('#cxThemeBox');
  const narrow = matchMedia('(max-width: 900px)');
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const KEY = 'caixinyun-theme';
  let open = false;

  function closeMenu(restoreFocus = false) {
    open = false;
    document.querySelector('.bi-root')?.classList.remove('cx-nav-open');
    menu.setAttribute('aria-expanded', 'false');
    backdrop.hidden = true;
    syncRail();
    if (restoreFocus && !menu.hidden) menu.focus();
  }
  function syncRail() {
    const rail = view.querySelector('.bi-rail');
    if (!rail) return;
    rail.id = 'cxBiRail';
    const concealed = narrow.matches && !open;
    rail.inert = concealed;
    if (concealed) rail.setAttribute('aria-hidden', 'true');
    else rail.removeAttribute('aria-hidden');
  }
  function enhance() {
    const bi = app.classList.contains('bi-mode');
    const themeHost = bi ? view.querySelector('.bi-header') : app.querySelector('.topbar-meta');
    if (themeHost && themeBox.parentElement !== themeHost) themeHost.append(themeBox);
    menu.hidden = !bi || !narrow.matches;
    if (!bi || !narrow.matches) closeMenu(false);
    syncRail();
    view.querySelectorAll('.bi-table').forEach((table) => {
      if (!table.querySelector('caption')) {
        const caption = document.createElement('caption');
        caption.className = 'cx-sr-only';
        caption.textContent = table.closest('.bi-section')?.querySelector('h2')?.textContent?.trim() || '经营分析明细';
        table.prepend(caption);
      }
      table.querySelectorAll('thead th').forEach((th) => th.setAttribute('scope', 'col'));
      const wrap = table.closest('.bi-tablewrap');
      if (wrap && !wrap.hasAttribute('tabindex')) {
        wrap.tabIndex = 0;
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', `${table.caption.textContent}，可横向滚动`);
      }
    });
    view.querySelectorAll('.bi-chart .bi-clickable[data-bi-point]').forEach((point) => {
      point.setAttribute('role', 'button');
      point.setAttribute('tabindex', '0');
      point.setAttribute('aria-label', point.querySelector('title')?.textContent || `查看 ${point.dataset.biPoint}`);
    });
  }
  menu.addEventListener('click', () => {
    open = !open;
    const root = view.querySelector('.bi-root');
    root?.classList.toggle('cx-nav-open', open);
    menu.setAttribute('aria-expanded', String(open));
    backdrop.hidden = !open;
    syncRail();
    if (open) root?.querySelector('.bi-rail-nav .active')?.focus();
  });
  backdrop.addEventListener('click', () => closeMenu(true));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) closeMenu(true);
    const point = event.target.closest?.('.bi-chart .bi-clickable[data-bi-point]');
    if (point && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      point.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    }
  });
  view.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-bi-tab]')) closeMenu(false);
  });
  narrow.addEventListener('change', enhance);
  new MutationObserver(enhance).observe(view, {childList: true});
  new MutationObserver(enhance).observe(app, {attributes: true, attributeFilter: ['class']});

  function selectedTheme() {
    try { return localStorage.getItem(KEY) || 'system'; }
    catch { return 'system'; }
  }
  function applyTheme(value, save = false) {
    document.documentElement.dataset.theme = value === 'system' ? (dark.matches ? 'dark' : 'light') : value;
    theme.value = value;
    if (save) try { localStorage.setItem(KEY, value); } catch {}
  }
  const initial = selectedTheme();
  applyTheme(['light', 'dark', 'system'].includes(initial) ? initial : 'system');
  theme.addEventListener('change', () => applyTheme(theme.value, true));
  dark.addEventListener('change', () => {
    if (theme.value === 'system') applyTheme('system');
  });
  enhance();
})();
