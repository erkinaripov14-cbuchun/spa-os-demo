/* SPA OS — localStorage database for GitHub Pages.
   Mimics the small Firestore-style API the schedule page uses
   (collection/doc/where/orderBy/limit/onSnapshot/get/add/set/update/delete)
   and stores everything in this browser's localStorage. */
(function () {
  "use strict";
  if (window.claude && window.claude.use) return; // running inside Claude: use the real db

  var KEY = "spaos_deerspa_db_v1";
  var store;
  try { store = JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { store = null; }
  if (!store) store = JSON.parse(JSON.stringify(window.SPAOS_SEED || {}));
  var listeners = [];

  function persist() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
  function coll(name) { return store[name] || (store[name] = {}); }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function notify() { persist(); listeners.slice().forEach(function (l) { try { l(); } catch (e) { console.error(e); } }); }
  function ok(v) { return Promise.resolve(v); }

  function Query(name, filters, order, lim) {
    this._n = name; this._f = filters || []; this._o = order || null; this._l = lim || 0;
  }
  Query.prototype.where = function (field, op, value) {
    return new Query(this._n, this._f.concat([[field, op, value]]), this._o, this._l);
  };
  Query.prototype.orderBy = function (field, dir) {
    return new Query(this._n, this._f, [field, dir || "asc"], this._l);
  };
  Query.prototype.limit = function (n) { return new Query(this._n, this._f, this._o, n); };
  Query.prototype._run = function () {
    var c = coll(this._n), f = this._f, rows = Object.keys(c).map(function (id) { return { id: id, d: c[id] }; });
    rows = rows.filter(function (r) {
      return f.every(function (w) {
        var v = r.d[w[0]], x = w[2];
        switch (w[1]) {
          case "==": return v === x; case "!=": return v !== x;
          case ">=": return v >= x; case "<=": return v <= x;
          case ">": return v > x; case "<": return v < x;
          default: return true;
        }
      });
    });
    if (this._o) {
      var k = this._o[0], s = this._o[1] === "desc" ? -1 : 1;
      rows.sort(function (a, b) { return a.d[k] > b.d[k] ? s : a.d[k] < b.d[k] ? -s : 0; });
    }
    if (this._l) rows = rows.slice(0, this._l);
    var docs = rows.map(function (r) {
      return { id: r.id, exists: true, data: function () { return clone(r.d); } };
    });
    return { docs: docs, size: docs.length, empty: docs.length === 0 };
  };
  Query.prototype.get = function () { return ok(this._run()); };
  Query.prototype.onSnapshot = function (cb) {
    var q = this, fn = function () { cb(q._run()); };
    listeners.push(fn);
    setTimeout(fn, 0);
    return function () { listeners = listeners.filter(function (l) { return l !== fn; }); };
  };
  Query.prototype.doc = function (id) { return new Doc(this._n, id || newId()); };
  Query.prototype.add = function (data) {
    var id = newId(); coll(this._n)[id] = clone(data); notify();
    return ok(new Doc(this._n, id));
  };

  function Doc(name, id) { this._n = name; this.id = id; }
  Doc.prototype.get = function () {
    var d = coll(this._n)[this.id];
    return ok({ id: this.id, exists: !!d, data: function () { return d ? clone(d) : undefined; } });
  };
  Doc.prototype.set = function (data) { coll(this._n)[this.id] = clone(data); notify(); return ok(); };
  Doc.prototype.update = function (data) {
    var c = coll(this._n);
    if (!c[this.id]) return Promise.reject({ code: "not-found" });
    Object.assign(c[this.id], clone(data)); notify(); return ok();
  };
  Doc.prototype.delete = function () { delete coll(this._n)[this.id]; notify(); return ok(); };

  var db = { collection: function (name) { return new Query(name); } };

  // keep several open tabs in sync
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY) return;
    try { store = JSON.parse(e.newValue) || {}; } catch (err) { return; }
    listeners.slice().forEach(function (l) { l(); });
  });

  // backup helpers
  window.spaosExport = function () {
    var blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "deerspa-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
  };
  window.spaosImport = function (file) {
    var r = new FileReader();
    r.onload = function () {
      try { store = JSON.parse(r.result); notify(); alert("Маълумотлар тикланди"); }
      catch (e) { alert("Файл нотўғри"); }
    };
    r.readAsText(file);
  };

  persist();
  window.claude = { use: function (cap) { return ok(cap === "db" ? db : null); } };
})();
