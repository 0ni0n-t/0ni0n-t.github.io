/* 홈의 VPC 구성도. 데이터는 _data/subnets.yml 과 글 목록에서 오고, 글 본문은 글의 고유 주소에서 불러온다.
   Three.js 를 불러오지 못하거나 WebGL 이 없으면 구성도 없이 카테고리와 내용 창만 동작한다. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var DATA = JSON.parse($('#vpc-data').textContent);
  var CATS = DATA.subnets;
  var POSTS = DATA.posts;
  var T = window.THREE;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var stage = $('#stage');
  var overlay = $('#labels');
  var sheet = $('#sheet');
  var aboutLink = $('#about-link');
  var catLinks = Array.prototype.slice.call(document.querySelectorAll('#cats .cat'));
  var state = { cat: 2, sub: null, inside: false, panel: 'closed', view: 'cat', post: null };
  var world = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function postsOf(c, s) {
    var cat = CATS[c];
    return POSTS.filter(function (p) {
      return p.cat === cat.slug && (s === null || p.sub === cat.subs[s].name);
    });
  }
  function countOf(c, s) { return postsOf(c, s).length; }

  /* ---------- 내용 창 ---------- */
  function applyMode() {
    if (state.panel === 'closed') { state.view = 'cat'; state.post = null; }
    document.body.dataset.panel = state.panel;
    stage.inert = state.panel === 'full';
    if (state.view === 'about' && state.panel !== 'closed') aboutLink.setAttribute('aria-current', 'true');
    else aboutLink.removeAttribute('aria-current');
    catLinks.forEach(function (a, i) {
      if (i === state.cat && state.view === 'cat') a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }
  var ICONS = {
    full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/></svg>',
    side: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16"/><path d="M14 4v16"/></svg>'
  };
  function sheetTools() {
    var row = el('div', 'sheet-tools');
    var toFull = state.panel !== 'full';
    if (state.post) {
      var back = el('button', 'sheet-btn sheet-back', '← 목록으로');
      back.type = 'button'; back.id = 'post-back';
      back.addEventListener('click', function () { state.post = null; sheet.scrollTop = 0; renderSheet(); });
      row.append(back);
    }
    var size = el('button', 'sheet-btn');
    size.type = 'button'; size.id = 'panel-size';
    size.innerHTML = toFull ? ICONS.full : ICONS.side;
    size.append(el('span', '', toFull ? '전체 화면으로 보기' : '사이드로 보기'));
    size.addEventListener('click', function () { state.panel = toFull ? 'full' : 'side'; applyMode(); renderSheet(); });
    var close = el('button', 'sheet-btn', '닫기');
    close.type = 'button'; close.id = 'panel-close';
    close.addEventListener('click', function () { state.panel = 'closed'; applyMode(); renderSheet(); });
    row.append(size, close);
    return row;
  }
  var pages = {};
  function loadPage(url) {
    if (!pages[url]) {
      pages[url] = fetch(url).then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      }).then(function (html) {
        return new DOMParser().parseFromString(html, 'text/html');
      }).catch(function (e) { delete pages[url]; throw e; });
    }
    return pages[url];
  }
  function failed(box, url) {
    box.replaceChildren(el('p', 'none', '내용을 불러오지 못했습니다. '));
    var a = el('a', '', '이 페이지로 이동');
    a.href = url;
    box.firstChild.append(a);
  }
  function renderAbout(box) {
    box.append(el('h2', '', '0ni0n__T'));
    var body = el('div', 'article-body', '불러오는 중입니다.');
    box.append(body);
    var url = aboutLink.href;
    loadPage(url).then(function (doc) {
      if (state.view !== 'about') return;
      var parts = [doc.querySelector('.about .sheet'), doc.querySelector('.about .policy-box')];
      body.replaceChildren();
      parts.forEach(function (part) {
        if (!part) return;
        Array.prototype.forEach.call(part.children, function (n) { body.append(document.importNode(n, true)); });
      });
    }).catch(function () { failed(body, url); });
  }
  function openPost(post) {
    var c = CATS.findIndex(function (x) { return x.slug === post.cat; });
    var s = CATS[c].subs.findIndex(function (x) { return x.name === post.sub; });
    pick(c, s < 0 ? null : s, true);
    state.post = post;
    sheet.scrollTop = 0;
    renderSheet();
  }
  function renderPost(box) {
    var post = state.post;
    var c = CATS[state.cat];
    var art = el('article', 'article');
    art.append(el('h2', '', post.title), el('p', 'article-meta', c.name + (post.sub ? ' / ' + post.sub : '') + ' · ' + post.date));
    var body = el('div', 'article-body', '불러오는 중입니다.');
    art.append(body);
    loadPage(post.url).then(function (doc) {
      if (state.post !== post) return;
      var source = doc.querySelector('article.post');
      if (!source) { failed(body, post.url); return; }
      var nav = source.querySelector('.post-nav');
      if (nav) nav.remove();
      body.replaceChildren();
      Array.prototype.forEach.call(source.children, function (n) { body.append(document.importNode(n, true)); });
    }).catch(function () { failed(body, post.url); });
    var list = postsOf(state.cat, null);
    var at = list.indexOf(post);
    var nav = el('nav', 'post-nav');
    nav.setAttribute('aria-label', '이전 글과 다음 글');
    [[at + 1, '이전 글'], [at - 1, '다음 글']].forEach(function (pair) {
      var target = list[pair[0]];
      if (!target) { nav.append(el('span')); return; }
      var b = el('button');
      b.type = 'button';
      b.append(el('small', '', pair[1]), el('span', '', target.title));
      b.addEventListener('click', function () { openPost(target); });
      nav.append(b);
    });
    art.append(nav);
    var page = el('a', 'article-url', '이 글의 주소로 열기');
    page.href = post.url;
    art.append(page);
    box.append(art);
  }
  function renderDetail(box) {
    var c = CATS[state.cat];
    var numbered = stage.clientWidth < 560;
    box.append(el('h2', '', c.name), el('p', 'sheet-sub', '서브넷 ' + c.cidr + ' · 세부 카테고리 ' + c.subs.length + '개'), el('p', 'sheet-text', c.about));
    box.append(el('h3', '', '세부 카테고리'));
    var subs = el('div', 'subs');
    c.subs.forEach(function (sub, i) {
      var b = el('button', 'subbtn');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(i === state.sub));
      b.append(el('span', '', numbered ? (i + 1) + '. ' + sub.name : sub.name), el('span', 'count', countOf(state.cat, i)));
      b.addEventListener('click', function () { pick(state.cat, i === state.sub ? null : i, true); });
      subs.append(b);
    });
    box.append(subs);
    if (state.sub === null) {
      box.append(el('p', 'sheet-tip', '세부 카테고리나 흰 블록을 누르면 어떤 글을 쓰는 곳인지 설명이 나옵니다.'));
    } else {
      var explain = el('div', 'sub-explain');
      explain.append(el('h3', 'sub-title', c.subs[state.sub].name), el('p', '', c.subs[state.sub].text));
      box.append(explain);
    }
    box.append(el('h3', '', state.sub === null ? '이 카테고리의 글' : c.subs[state.sub].name + ' 글'));
    var ps = postsOf(state.cat, state.sub);
    if (ps.length) {
      var ul = el('ul', 'posts');
      ps.forEach(function (p) {
        var li = el('li');
        var open = el('a', 'post-link', p.title);
        open.href = p.url;
        open.addEventListener('click', function (e) {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          openPost(p);
        });
        li.append(open, el('small', '', (p.sub ? p.sub + ' · ' : '') + p.date));
        ul.append(li);
      });
      box.append(ul);
    } else {
      box.append(el('p', 'none', '기록 없음. 아직 공개한 글은 없습니다.'));
    }
    box.append(el('h3', '', '올리는 글과 올리지 않는 글'));
    box.append(el('p', 'sheet-sub', '보안 그룹 sg-' + c.slug));
    var dl = el('dl', 'rules');
    var row = function (cls, word, text) {
      var d = el('div');
      d.append(el('dt', cls, word), el('dd', '', text));
      dl.append(d);
    };
    (c.allow || []).forEach(function (t) { row('allow', 'ALLOW', t); });
    (c.deny || []).forEach(function (t) { row('deny', 'DENY', t); });
    box.append(dl);
  }
  function renderSheet() {
    var top = sheet.scrollTop;
    sheet.replaceChildren();
    if (state.panel === 'closed') return;
    sheet.append(sheetTools());
    var box = el('div', 'sheet-body');
    sheet.append(box);
    if (state.view === 'about') renderAbout(box);
    else if (state.post) renderPost(box);
    else renderDetail(box);
    sheet.scrollTop = top;
  }
  function pick(c, s, inside) {
    if (c !== state.cat) sheet.scrollTop = 0;
    state.cat = c; state.sub = s;
    if (inside !== undefined) state.inside = inside;
    state.view = 'cat';
    state.post = null;
    if (inside === true && state.panel === 'closed') state.panel = 'side';
    applyMode();
    renderSheet();
    if (world) world.refresh();
  }
  var plainClick = function (e) { return !(e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0); };
  catLinks.forEach(function (a, i) {
    a.addEventListener('click', function (e) {
      if (!plainClick(e)) return;
      e.preventDefault();
      pick(i, null, true);
    });
  });
  aboutLink.addEventListener('click', function (e) {
    if (!plainClick(e)) return;
    e.preventDefault();
    state.view = 'about';
    state.post = null;
    if (state.panel === 'closed') state.panel = 'side';
    state.inside = false;
    applyMode();
    sheet.scrollTop = 0;
    renderSheet();
    if (world) world.refresh();
  });
  $('#overview').addEventListener('click', function () { state.panel = 'closed'; pick(state.cat, null, false); });
  addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || state.panel === 'closed') return;
    state.panel = state.panel === 'full' ? 'side' : 'closed';
    applyMode();
    renderSheet();
  });
  applyMode();

  /* ---------- 내용 창 너비 조절 ---------- */
  var handle = $('#sheet-resize');
  var PANEL_MIN = 360;
  var panelW = 512;
  function panelMax() { return Math.max(PANEL_MIN, window.innerWidth - 300); }
  function setPanelWidth(w, remember) {
    panelW = Math.round(Math.max(PANEL_MIN, Math.min(panelMax(), w)));
    document.documentElement.style.setProperty('--panel-w', panelW + 'px');
    handle.setAttribute('aria-valuenow', String(panelW));
    handle.setAttribute('aria-valuemin', String(PANEL_MIN));
    handle.setAttribute('aria-valuemax', String(panelMax()));
    if (remember) { try { localStorage.setItem('panelWidth', String(panelW)); } catch (e) { /* 저장하지 못해도 너비 조절은 동작한다 */ } }
  }
  var savedWidth = null;
  try { savedWidth = parseInt(localStorage.getItem('panelWidth'), 10); } catch (e) { savedWidth = null; }
  setPanelWidth(savedWidth > 0 ? savedWidth : 512, false);
  addEventListener('resize', function () { setPanelWidth(panelW, false); });
  handle.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
  });
  handle.addEventListener('pointermove', function (e) {
    if (document.body.classList.contains('resizing')) setPanelWidth(window.innerWidth - e.clientX, false);
  });
  function endResize() {
    if (!document.body.classList.contains('resizing')) return;
    document.body.classList.remove('resizing');
    setPanelWidth(panelW, true);
  }
  handle.addEventListener('pointerup', endResize);
  handle.addEventListener('pointercancel', endResize);
  handle.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setPanelWidth(panelW + 24, true); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setPanelWidth(panelW - 24, true); }
  });

  /* ---------- 3D ---------- */
  var renderer = null;
  try {
    if (!T) throw new Error('three');
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    stage.append(el('div', 'nogl', '이 브라우저에서는 3D 구성도를 표시할 수 없습니다. 카테고리와 글 목록은 그대로 쓸 수 있습니다.'));
    return;
  }
  var V = function (x, y, z) { return new T.Vector3(x, y, z); };
  var scene, camera;
  var W = 1, H = 1;
  var rig = { ox: 0, oy: 0, target: V(0, 0, 0), dist: 17, yaw: .42, pitch: .86, goal: { target: V(0, 0, 0), dist: 17, yaw: .42, pitch: .86 } };
  var user = { yaw: 0, pitch: 0, goalYaw: 0, goalPitch: 0 };
  var labels = [];
  var stepOf = function (dt, rate) { return reduce ? 1 : 1 - Math.exp(-dt * rate); };
  function aim(o) {
    if (o.target) rig.goal.target.copy(o.target);
    ['dist', 'yaw', 'pitch'].forEach(function (k) { if (o[k] !== undefined) rig.goal[k] = o[k]; });
  }
  function addLabel(text, cls, pos) {
    var node = el('div', 'lab ' + (cls || ''), text);
    overlay.append(node);
    var l = { el: node, pos: pos, show: true };
    labels.push(l);
    return l;
  }
  var tmp = V(0, 0, 0);
  function drawLabels() {
    labels.forEach(function (l) {
      tmp.copy(l.pos).project(camera);
      var show = l.show && tmp.z < 1;
      l.el.hidden = !show;
      if (show) l.el.style.transform = 'translate(' + ((tmp.x + 1) / 2 * W) + 'px, ' + ((1 - tmp.y) / 2 * H) + 'px) translate(-50%, -50%)';
    });
  }
  function mat(color, o) { return new T.MeshStandardMaterial(Object.assign({ color: color, roughness: .62, metalness: .08 }, o)); }
  function box(w, h, d, m, x, y, z) { var o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; }
  function beam(a, b, r, m) {
    var d = b.clone().sub(a);
    var o = new T.Mesh(new T.CylinderGeometry(r, r, Math.max(d.length(), .001), 8), m);
    o.position.copy(a).addScaledVector(d, .5);
    o.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
    return o;
  }
  function along(path, u) {
    var lens = [];
    var total = 0;
    var i;
    for (i = 1; i < path.length; i++) { var n = path[i].distanceTo(path[i - 1]); lens.push(n); total += n; }
    var t = Math.max(0, Math.min(1, u)) * total;
    for (i = 0; i < lens.length; i++) {
      if (t <= lens[i] || i === lens.length - 1) return path[i].clone().lerp(path[i + 1], lens[i] ? Math.min(1, t / lens[i]) : 0);
      t -= lens[i];
    }
    return path[0].clone();
  }
  function edgeOf(w, h, d, color) { return new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(w, h, d)), new T.LineBasicMaterial({ color: color })); }

  function buildWorld() {
    scene = new T.Scene();
    scene.add(new T.AmbientLight(0xffffff, .62));
    var key = new T.DirectionalLight(0xffe0c7, .85); key.position.set(4, 8, 6); scene.add(key);
    var fill = new T.DirectionalLight(0x9db4ff, .4); fill.position.set(-6, 2, -3); scene.add(fill);
    scene.add(box(12.4, .12, 7.6, mat(0x24348e, { transparent: true, opacity: .72 }), 0, 0, 0));
    scene.add(edgeOf(12.4, .12, 7.6, 0xffffff));
    var wireMat = mat(0xc4cff0);
    var hotMat = new T.MeshBasicMaterial({ color: 0xffb27a });
    scene.add(beam(V(0, .14, 3.8), V(0, .14, 0), .03, wireMat), beam(V(-4, .14, 0), V(4, .14, 0), .03, wireMat));
    scene.add(box(1.4, 1, .5, mat(0xffb27a), 0, .5, 4.4));
    addLabel('인터넷 게이트웨이 igw-0ni0n', 'hot', V(0, 1.25, 4.4));
    var visitor = new T.Mesh(new T.SphereGeometry(.2, 16, 16), mat(0xffffff)); visitor.position.set(0, 1.4, 6.4);
    scene.add(visitor, beam(V(0, 1.4, 6.4), V(0, .6, 4.4), .02, wireMat), beam(V(0, .4, 4.15), V(0, .14, 3.8), .03, wireMat));
    addLabel('방문자 0.0.0.0/0', '', V(0, 1.85, 6.4));
    addLabel('VPC 0ni0n__T 10.0.0.0/16', 'main', V(-4.6, .15, 3.95));

    var spots = [[-4, -1.95], [0, -1.95], [4, -1.95], [-4, 1.95], [0, 1.95], [4, 1.95]];
    var pickable = [];
    var nets = CATS.map(function (c, i) {
      var x = spots[i][0]; var z = spots[i][1];
      var netMat = mat(0x5a4aa8);
      var plate = box(3.7, .2, 3.1, netMat, x, .2, z);
      plate.userData = { cat: i, sub: null };
      scene.add(plate); pickable.push(plate);
      var edge = edgeOf(3.7, .2, 3.1, 0xc4cff0); edge.position.copy(plate.position); scene.add(edge);
      scene.add(beam(V(x, .14, 0), V(x, .14, z > 0 ? .4 : -.4), .022, wireMat));
      var main = addLabel(c.name + ' · ' + c.subs.length, 'main', V(x, .75, z - 1.72));
      var cols = c.subs.length > 4 ? 3 : 2;
      var rows = Math.ceil(c.subs.length / cols);
      var blocks = c.subs.map(function (sub, s) {
        var col = s % cols; var row = Math.floor(s / cols);
        var bx = x + (col - (cols - 1) / 2) * (3.2 / cols);
        var bz = z + (row - (rows - 1) / 2) * (2.6 / rows);
        var m = mat(0xffffff);
        var size = Math.min(.72, 3.2 / cols - .34);
        var mesh = box(size, 1, size, m, bx, 0, bz);
        mesh.userData = { cat: i, sub: s };
        scene.add(mesh); pickable.push(mesh);
        var label = addLabel(sub.name, 'sub', V(bx, 1, bz));
        return { mesh: mesh, m: m, label: label, bx: bx, bz: bz, height: .3, shown: .3 };
      });
      return { x: x, z: z, netMat: netMat, edge: edge, main: main, blocks: blocks };
    });

    var route = new T.Group(); scene.add(route);
    var sg = new T.Mesh(new T.BoxGeometry(3.95, 1.75, 3.35), new T.MeshBasicMaterial({ color: 0x7ee2a8, transparent: true, opacity: .1, depthWrite: false }));
    var sgEdge = edgeOf(3.95, 1.75, 3.35, 0x7ee2a8);
    scene.add(sg, sgEdge);
    var sgLabel = addLabel('', 'hot', V(0, 0, 0));
    var packet = new T.Mesh(new T.SphereGeometry(.11, 14, 14), new T.MeshBasicMaterial({ color: 0xffffff }));
    var denied = new T.Mesh(new T.SphereGeometry(.11, 14, 14), new T.MeshBasicMaterial({ color: 0xff5a4f }));
    scene.add(packet, denied);
    var path = []; var denyPath = null;

    function refresh() {
      var c = CATS[state.cat];
      var net = nets[state.cat];
      nets.forEach(function (n, i) {
        var on = i === state.cat;
        n.netMat.color.set(on ? 0x7a63c9 : 0x5a4aa8);
        n.edge.material.color.set(on ? 0xffb27a : 0xc4cff0);
        n.main.el.classList.toggle('hot', on);
        n.main.show = !state.inside || on;
        n.blocks.forEach(function (b, s) {
          var picked = on && s === state.sub;
          b.m.color.set(picked ? 0xffb27a : 0xffffff);
          b.height = .3 + Math.min(countOf(i, s), 8) * .2;
          b.label.el.classList.toggle('subon', picked);
          b.label.show = on && state.inside;
          b.label.el.textContent = W < 560 ? String(s + 1) : CATS[i].subs[s].name;
        });
      });
      while (route.children.length) { var o = route.children[0]; o.geometry.dispose(); route.remove(o); }
      var inner = net.z > 0 ? .4 : -.4;
      var hub = [V(0, 1.4, 6.4), V(0, .6, 4.4), V(0, .2, 3.8), V(0, .2, 0), V(net.x, .2, 0), V(net.x, .2, inner)];
      for (var n = 2; n < hub.length - 1; n++) route.add(beam(hub[n], hub[n + 1], .045, hotMat));
      var pickedBlock = state.sub === null ? null : net.blocks[state.sub];
      var endX = pickedBlock ? pickedBlock.bx : net.x;
      var endZ = pickedBlock ? pickedBlock.bz : net.z;
      var endY = pickedBlock ? .3 + pickedBlock.height + .16 : .45;
      var up = V(net.x, 1.35 + (pickedBlock ? Math.max(0, pickedBlock.height - .8) : 0), inner);
      var over = V(endX, up.y, endZ);
      var end = V(endX, endY, endZ);
      route.add(beam(hub[5], up, .03, hotMat), beam(up, over, .03, hotMat), beam(over, end, .03, hotMat));
      path = hub.concat([up, over, end]);
      var wall = net.z > 0 ? net.z - 1.67 : net.z + 1.67;
      denyPath = (c.deny || []).length ? [V(0, .2, 3.8), V(0, .2, 0), V(net.x + .6, .2, 0), V(net.x + .6, .32, wall)] : null;
      sg.position.set(net.x, .8, net.z); sgEdge.position.copy(sg.position);
      sgLabel.pos = V(net.x, 1.85, net.z - 1.68);
      sgLabel.el.textContent = 'sg-' + c.slug + ' ALLOW ' + (c.allow || []).length + ' · DENY ' + (c.deny || []).length;
      sgLabel.show = state.inside;
      if (state.inside) aim({ target: V(net.x, .5, net.z + .35), dist: W < 560 ? 12 : 11.5, yaw: .28 - net.x * .03, pitch: .86 });
      else aim({ target: V(0, 0, 1), dist: W < H ? 37 : 17, yaw: .42, pitch: .86 });
      user.goalYaw = 0; user.goalPitch = 0;
    }
    world = {
      refresh: refresh,
      pickable: pickable,
      update: function (dt, t) {
        nets.forEach(function (n) {
          n.blocks.forEach(function (b) {
            b.shown += (b.height - b.shown) * stepOf(dt, 5);
            b.mesh.scale.y = b.shown;
            b.mesh.position.y = .3 + b.shown / 2;
            b.label.pos.y = .3 + b.shown + .24;
          });
        });
        if (path.length) packet.position.copy(along(path, reduce ? 1 : (t * .24) % 1));
        denied.visible = !!denyPath && !reduce;
        if (denyPath && !reduce) {
          var d = (t * .3 + .35) % 1;
          denied.position.copy(along(denyPath, d * 1.15));
          denied.visible = d < .87;
        }
      }
    };
    refresh();
    rig.target.copy(rig.goal.target); rig.dist = rig.goal.dist; rig.yaw = rig.goal.yaw; rig.pitch = rig.goal.pitch;
  }

  function resize() {
    W = stage.clientWidth; H = stage.clientHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = W < H ? 50 : 36;
    camera.updateProjectionMatrix();
  }
  var ray = new T.Raycaster();
  function hit(e) {
    var r = stage.getBoundingClientRect();
    ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
    var found = ray.intersectObjects(world.pickable)[0];
    return found ? found.object.userData : null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  stage.prepend(renderer.domElement);
  camera = new T.PerspectiveCamera(36, 1, .05, 120);
  new ResizeObserver(function () {
    var narrow = W < 560;
    resize();
    if (world && narrow !== (W < 560)) { world.refresh(); renderSheet(); }
  }).observe(stage);
  resize();
  buildWorld();

  var drag = null;
  var canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
  addEventListener('pointermove', function (e) {
    if (!drag) {
      if (e.pointerType === 'mouse' && e.target === canvas) stage.classList.toggle('point', !!hit(e));
      return;
    }
    var dx = e.clientX - drag.x; var dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    user.goalYaw = Math.max(-1.2, Math.min(1.2, user.goalYaw - dx * .006));
    if (e.pointerType === 'mouse') user.goalPitch = Math.max(-.4, Math.min(.45, user.goalPitch - dy * .004));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  addEventListener('pointerup', function (e) {
    if (drag && drag.moved < 6 && e.target === canvas) {
      var h = hit(e);
      if (h) pick(h.cat, h.sub, true);
    }
    drag = null;
  });
  addEventListener('pointercancel', function () { drag = null; });

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(.05, (now - last) / 1000); last = now;
    var k = stepOf(dt, 2.4);
    rig.target.lerp(rig.goal.target, k);
    rig.dist += (rig.goal.dist - rig.dist) * k;
    rig.yaw += (rig.goal.yaw - rig.yaw) * k;
    rig.pitch += (rig.goal.pitch - rig.pitch) * k;
    user.yaw += (user.goalYaw - user.yaw) * stepOf(dt, 8);
    user.pitch += (user.goalPitch - user.pitch) * stepOf(dt, 8);
    var yaw = rig.yaw + user.yaw;
    var pitch = Math.max(.25, Math.min(1.35, rig.pitch + user.pitch));
    /* 내용 창과 카테고리에 가려지지 않도록 구성도를 남은 공간의 가운데로 옮긴다. */
    var goalX = 0; var goalY = 0;
    if (W > 760) goalX = ((state.panel === 'side' ? Math.min(panelW, W) : 0) - 232) / 2;
    else goalY = state.panel === 'side' ? H * .3 : 0;
    var slide = stepOf(dt, 5);
    rig.ox += (goalX - rig.ox) * slide;
    rig.oy += (goalY - rig.oy) * slide;
    camera.setViewOffset(W, H, rig.ox, rig.oy, W, H);
    camera.position.set(rig.target.x + Math.sin(yaw) * Math.cos(pitch) * rig.dist, rig.target.y + Math.sin(pitch) * rig.dist, rig.target.z + Math.cos(yaw) * Math.cos(pitch) * rig.dist);
    camera.lookAt(rig.target);
    camera.updateMatrixWorld();
    world.update(dt, now / 1000);
    if (state.panel !== 'full') { renderer.render(scene, camera); drawLabels(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
