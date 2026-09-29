/* COMP1860 activity sheets - shared generator and renderer.
 *
 * Everything between BEGIN/END PORTABLE CORE has a line-for-line twin in
 * variant.py, and parity.sh diffs the two across the whole cohort. That pair
 * is what lets a student's browser and the Gradescope autograder arrive at
 * the same circuit independently. Change one, change both, then run parity.
 *
 * Below the core is rendering, which lives only here.
 */
"use strict";

// --- BEGIN PORTABLE CORE ---
var M = 0xFFFFFFFF;

function xmur3(str){
  var h = (1779033703 ^ str.length) >>> 0;
  for(var i=0;i<str.length;i++){
    h = (h ^ str.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 3432918353) >>> 0;
    h = (((h << 13) >>> 0) | (h >>> 19)) >>> 0;
  }
  return function(){
    h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h;
  };
}

function sfc32(a,b,c,d){
  a>>>=0; b>>>=0; c>>>=0; d>>>=0;
  return function(){
    var t = (a + b) >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + ((c << 3) >>> 0)) >>> 0;
    c = (((c << 21) >>> 0) | (c >>> 11)) >>> 0;
    d = (d + 1) >>> 0;
    t = (t + d) >>> 0;
    c = (c + t) >>> 0;
    return t / 4294967296;
  };
}

function Rng(key){
  var seed = xmur3(key);
  this.f = sfc32(seed(), seed(), seed(), seed());
}
Rng.prototype.next   = function(){ return this.f(); };
Rng.prototype.int    = function(n){ return Math.floor(this.next()*n); };
Rng.prototype.choice = function(a){ return a[this.int(a.length)]; };
// Fisher-Yates, spelled out because Python's random.sample cannot be
// reproduced in a browser.
Rng.prototype.shuffle = function(a){
  var out = a.slice();
  for(var i=out.length-1;i>0;i--){
    var j = this.int(i+1), t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
};

var ZERO_WIDTH = ["\u200b","\u200c","\u200d","\ufeff"];

// Reduce an address to the key we seed from. The key is unverifiable by
// design - any string generates a valid problem - so it is worth absorbing
// every difference that is NOT a real difference: case, whitespace (including
// the non-breaking spaces that come out of Word and Outlook), zero-width
// characters from web copy-paste, a mailto: prefix, the angle brackets from
// "Name <addr@leeds.ac.uk>", and a trailing sentence dot. Anything beyond
// that IS a real difference and must stay one.
// Keep identical to normalise() in variant.py - parity.sh checks that it is.
function normalise(e){
  var s = String(e);
  for(var i=0;i<ZERO_WIDTH.length;i++) s = s.split(ZERO_WIDTH[i]).join("");
  s = s.trim().toLowerCase();
  if(s.indexOf("mailto:") === 0) s = s.slice(7);
  s = s.trim();
  if(s.charAt(0) === "<" && s.charAt(s.length-1) === ">") s = s.slice(1,-1).trim();
  while(s.charAt(s.length-1) === ".") s = s.slice(0,-1);
  return s.trim();
}
function seedKey(sheet, email){ return "COMP1860|" + sheet + "|" + normalise(email); }

function fingerprint(key){
  var v = xmur3(key)();
  var A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = "";
  for(var i=0;i<6;i++){ s += A.charAt(v & 31); v = v >>> 5; }
  return s.slice(0,3) + "-" + s.slice(3);
}

/* =====================================================================
   Output formatting.

   The simulator lays out each column as L spaces, a field of width W,
   then R spaces, written in a test file as name%<T>L.W.R. Rather than
   hand-write the expected header and hope it matches, both generators
   build .cmp files with these functions, which reproduce the rule:

     header  the pin name centred in L+W+R, TRUNCATED if longer
             ("reset" in a 3-wide column comes out as "res")
     value   right-aligned in W, keeping the RIGHTMOST digits on overflow
             (12 in a 1-wide column comes out as "2")

   Verified against HardwareSimulator across name lengths 1-5, widths 1-3.
   ===================================================================== */
function Col(name, kind, L, W, R){
  this.name = name;
  this.kind = kind || "B";
  this.L = L === undefined ? 1 : L;
  this.W = W === undefined ? 1 : W;
  this.R = R === undefined ? 1 : R;
}
Col.prototype.spec = function(){
  return this.name + "%" + this.kind + this.L + "." + this.W + "." + this.R;
};
Col.prototype.head = function(){
  var t = this.L + this.W + this.R;
  var s = this.name.slice(0, t);
  var pad = t - s.length, left = Math.floor(pad/2);
  return rep(" ", left) + s + rep(" ", pad - left);
};
Col.prototype.cell = function(value){
  var v = String(value);
  v = v.length > this.W ? v.slice(v.length - this.W) : rep(" ", this.W - v.length) + v;
  return rep(" ", this.L) + v + rep(" ", this.R);
};
function rep(c, n){ var s = ""; for(var i=0;i<n;i++) s += c; return s; }

function table(cols, rows){
  var out = ["|" + cols.map(function(c){ return c.head(); }).join("|") + "|"];
  rows.forEach(function(row){
    out.push("\n|" + cols.map(function(c,i){ return c.cell(row[i]); }).join("|") + "|");
  });
  return out.join("");
}

function outputList(cols){
  return "output-list " + cols.map(function(c){ return c.spec(); }).join(" ") + ";\n";
}

/* =====================================================================
   Week 6 - randomised four-gate combinational circuit (A6Q2)
   ===================================================================== */
var TRUE_ROWS_REQUIRED = 3;

function evaluate6(sp,a,b,c){
  function g(k,x,y){ return k==="and" ? (x&&y) : (x||y); }
  var ta = sp.nA ? !a : a;
  var tb = sp.nB ? !b : b;
  var la = (sp.nA||sp.nAA) ? !a : a;
  var lb = (sp.nB||sp.nBB) ? !b : b;
  var tc = sp.nC ? !c : c;
  return g(sp.gd, g(sp.gc, g(sp.ga,ta,tb), g(sp.gb,la,lb)), tc) ? 1 : 0;
}

function truthTable6(sp){
  var rows = [];
  for(var a=0;a<2;a++) for(var b=0;b<2;b++) for(var c=0;c<2;c++)
    rows.push([a,b,c,evaluate6(sp,a,b,c)]);
  return rows;
}

function buildWeek6(email){
  var key = seedKey("A6Q2", email);
  var r = new Rng(key);
  var pins = [];
  while(pins.length < 5){
    var p = String.fromCharCode(65 + r.int(26));
    if(pins.indexOf(p) === -1) pins.push(p);
  }
  var sp;
  for(;;){
    sp = {};
    sp.nA = r.choice([true,false]);
    sp.nB = r.choice([true,false]);
    sp.nC = r.choice([true,false]);
    sp.nAA = !sp.nA ? r.choice([true,false]) : false;
    sp.nBB = !sp.nB ? r.choice([true,false]) : false;
    sp.ga = r.choice(["and","or"]);
    sp.gb = r.choice(["and","or"]);
    sp.gc = r.choice(["and","or"]);
    sp.gd = r.choice(["and","or"]);
    var t = truthTable6(sp), n = 0;
    for(var i=0;i<t.length;i++) n += t[i][3];
    if(n === TRUE_ROWS_REQUIRED) break;
  }
  sp.pins = pins.slice(0,4);
  sp.email = normalise(email);
  sp.fingerprint = fingerprint(key);
  sp.rows = truthTable6(sp);
  return sp;
}

function week6Cols(sp){
  return sp.pins.map(function(n){ return new Col(n); });
}

function week6Tst(sp){
  var p = sp.pins, o = [];
  // Every A6Q2 pin is one bit and B1.1.1 is the default, so the specifier is
  // left off to keep a first test file readable.
  o.push("load A6Q2.hdl,\n");
  o.push("output-file A6Q2.out,\n");
  o.push("output-list "+p[0]+" "+p[1]+" "+p[2]+" "+p[3]+";\n");
  sp.rows.forEach(function(r){
    o.push("set "+p[0]+" "+r[0]+",\nset "+p[1]+" "+r[1]+",\nset "+p[2]+" "+r[2]+
           ",\neval,\noutput;\n\n");
  });
  return o.join("");
}

function week6Cmp(sp){ return table(week6Cols(sp), sp.rows); }

/* =====================================================================
   Week 7 - one segment of a seven-segment display
   ===================================================================== */
// Which physical segments each character lights.
//
// B and D are drawn as lowercase because seven segments cannot render them any
// other way: an uppercase B would be identical to 8, and an uppercase D to 0.
// Every hex display in the world shows A b C d E F for the same reason.
// G is a,c,d,e,f - the 6 shape without the centre bar, which is what
// distinguishes the two.
var GLYPH = {
  "0":"abcdef", "1":"bc", "2":"abdeg", "3":"abcdg",
  "4":"bcfg", "5":"acdfg", "6":"acdefg", "7":"abc",
  "8":"abcdefg", "9":"abcdfg",
  "A":"abcefg", "B":"cdefg", "C":"adef", "D":"bcdeg",
  "E":"adefg", "F":"aefg", "G":"acdef", "H":"bcefg",
  "I":"bc", "J":"bcde"
};
var ALPHABETS = ["0123456789".split(""), "ABCDEFGHIJ".split("")];
var PINS = ["a","b","c","d","e","f","g"];

function buildWeek7(email){
  var key = seedKey("A7Q1", email);
  var r = new Rng(key);
  var alphabet = r.choice(ALPHABETS);
  var segment = r.choice(PINS);
  var rows = [];
  for(var i=0;i<10;i++){
    rows.push([i, alphabet[i], GLYPH[alphabet[i]].indexOf(segment) >= 0 ? 1 : 0]);
  }
  return {
    email: normalise(email),
    fingerprint: fingerprint(key),
    alphabet: alphabet,
    alphabetName: alphabet.join(""),
    segment: segment,
    rows: rows
  };
}

// `in` is a 4-bit bus. With no format specifier the simulator prints a single
// binary digit, so in=9 would appear as "1" and the test would pass vacuously.
function segmentCols(sp){ return [new Col("in","D"), new Col(sp.segment)]; }

function segmentTst(sp){
  var cols = segmentCols(sp), o = [];
  o.push("load DecoderSegment.hdl,\n");
  o.push("output-file DecoderSegment.out,\n");
  o.push(outputList(cols));
  sp.rows.forEach(function(r){ o.push("set in "+r[0]+",\neval,\noutput;\n\n"); });
  return o.join("");
}

function segmentCmp(sp){
  return table(segmentCols(sp), sp.rows.map(function(r){ return [r[0], r[2]]; }));
}

/* =====================================================================
   Week 8 - busy indicator ("spinner")

   The ring is the six PERIMETER segments; g is the centre bar and takes
   no part. The pair style lights two ADJACENT segments, not two at 180
   degrees - opposite pairs repeat after three steps, which would give
   those students a mod-3 machine instead of a mod-6 one.
   ===================================================================== */
var RING = ["a","b","c","d","e","f"];   // clockwise from the top

var SPIN_STEPS = (function(){
  var s = [[1,0]];
  for(var i=0;i<6;i++) s.push([0,0]);
  for(var j=0;j<6;j++) s.push([0,1]);
  s.push([1,1]); s.push([0,1]); s.push([0,1]);
  return s;
})();

function buildWeek8(email){
  var key = seedKey("A8Q1", email);
  var r = new Rng(key);
  var start = r.int(6);
  var cwWhen = r.int(2);
  var pair = r.int(2) === 1;
  return {
    email: normalise(email),
    fingerprint: fingerprint(key),
    start: start,
    startSeg: RING[start],
    cwWhen: cwWhen,
    pair: pair,
    rows: spinRows(start, cwWhen, pair)
  };
}

function spinLit(pos, pair){
  return pair ? [RING[pos], RING[(pos+1)%6]] : [RING[pos]];
}

function spinRows(start, cwWhen, pair){
  var rows = [], pos = start;
  SPIN_STEPS.forEach(function(step){
    var reset = step[0], d = step[1];
    if(reset) pos = start;
    else if(d === cwWhen) pos = (pos + 1) % 6;
    else pos = (pos + 5) % 6;
    var lit = spinLit(pos, pair);
    rows.push([reset, d, RING.map(function(s){ return lit.indexOf(s) >= 0 ? 1 : 0; })]);
  });
  return rows;
}

// reset and dir are deliberately NOT in the output list: they would be
// truncated in a 3-wide column and they carry nothing a marker needs.
function spinCols(){ return RING.map(function(s){ return new Col(s); }); }

function spinTst(sp){
  var o = ["load SpinDisplay.hdl\n".replace("\n",",\n"),
           "output-file SpinDisplay.out,\n", outputList(spinCols())];
  sp.rows.forEach(function(r){
    o.push("set reset "+r[0]+",\nset dir "+r[1]+",\ntick,\ntock,\noutput;\n\n");
  });
  return o.join("");
}

function spinCmp(sp){
  return table(spinCols(), sp.rows.map(function(r){ return r[2]; }));
}

/* =====================================================================
   Week 9 - test script for a supplied RAM8
   ===================================================================== */
function buildWeek9(email){
  var key = seedKey("A9Q1", email);
  var r = new Rng(key);
  var addrs = r.shuffle([0,1,2,3,4,5,6,7]).slice(0,3);
  var values = [];
  while(values.length < 3){
    var v = 1000 + r.int(8000);
    if(values.indexOf(v) === -1) values.push(v);
  }
  var writes = addrs.map(function(a,i){ return [a, values[i]]; });
  var noopAddr = addrs[r.int(3)];
  var noopValue = 1000 + r.int(8000);
  var stored = {};
  writes.forEach(function(w){ stored[w[0]] = w[1]; });
  var readback = [];
  for(var a=0;a<8;a++) readback.push([a, stored[a] === undefined ? 0 : stored[a]]);
  return {
    email: normalise(email),
    fingerprint: fingerprint(key),
    writes: writes,
    noopAddr: noopAddr,
    noopValue: noopValue,
    readback: readback,
    noopExpected: stored[noopAddr]
  };
}

// `address` is 7 characters, so it needs a 7-wide column or the header is
// truncated; `out` holds 4-digit values, so W must be at least 4.
function ram8Cols(){
  return [new Col("address","D",3,1,3), new Col("out","D",1,5,1)];
}

function ram8Tst(sp){
  var o = ["load RAM8.hdl,\n", "output-file RAM8.out,\n",
           outputList(ram8Cols()) + "\n",
           "// Phase A - store the three values. No output in this phase.\n"];
  sp.writes.forEach(function(w){
    o.push("set address "+w[0]+",\nset in "+w[1]+",\nset load 1,\ntick,\ntock,\n\n");
  });
  o.push("// Phase B - read every address back.\nset load 0,\n\n");
  sp.readback.forEach(function(rb){
    o.push("set address "+rb[0]+",\neval,\noutput;\n\n");
  });
  o.push("// Phase C - a write with load=0 must change nothing.\n");
  o.push("set address "+sp.noopAddr+",\nset in "+sp.noopValue+
         ",\nset load 0,\ntick,\ntock,\neval,\noutput;\n");
  return o.join("");
}

function ram8Cmp(sp){
  var rows = sp.readback.slice();
  rows.push([sp.noopAddr, sp.noopExpected]);
  return table(ram8Cols(), rows);
}

/* =====================================================================
   Week 10 - ALU control decoder
   ===================================================================== */
var ALU_OPS = [
  ["0",       [1,0,1,0,1,0]],
  ["1",       [1,1,1,1,1,1]],
  ["-1",      [1,1,1,0,1,0]],
  ["x",       [0,0,1,1,0,0]],
  ["y",       [1,1,0,0,0,0]],
  ["not x",   [0,0,1,1,0,1]],
  ["not y",   [1,1,0,0,0,1]],
  ["-x",      [0,0,1,1,1,1]],
  ["-y",      [1,1,0,0,1,1]],
  ["x + 1",   [0,1,1,1,1,1]],
  ["y + 1",   [1,1,0,1,1,1]],
  ["x - 1",   [0,0,1,1,1,0]],
  ["y - 1",   [1,1,0,0,1,0]],
  ["x + y",   [0,0,0,0,1,0]],
  ["x - y",   [0,1,0,0,1,1]],
  ["y - x",   [0,0,0,1,1,1]],
  ["x and y", [0,0,0,0,0,0]],
  ["x or y",  [0,1,0,1,0,1]]
];
var CTRL = ["zx","nx","zy","ny","f","no"];

function buildWeek10(email){
  var key = seedKey("A10Q1", email);
  var r = new Rng(key);
  var idx = [];
  for(var i=0;i<ALU_OPS.length;i++) idx.push(i);
  var chosen = r.shuffle(idx).slice(0,8);
  var rows = [];
  for(var k=0;k<8;k++) rows.push([k, ALU_OPS[chosen[k]][0], ALU_OPS[chosen[k]][1]]);
  return { email: normalise(email), fingerprint: fingerprint(key), rows: rows };
}

function aluCols(){
  return [new Col("op","D")].concat(CTRL.map(function(c){ return new Col(c); }));
}

function aluTst(sp){
  var o = ["load ALUControl.hdl,\n", "output-file ALUControl.out,\n",
           outputList(aluCols())];
  sp.rows.forEach(function(r){ o.push("set op "+r[0]+",\neval,\noutput;\n\n"); });
  return o.join("");
}

function aluCmp(sp){
  return table(aluCols(), sp.rows.map(function(r){ return [r[0]].concat(r[2]); }));
}
// --- END PORTABLE CORE ---



/* ======================================================================
   Roster lookup. The page never holds a readable list of students - only
   salted hashes - so it can sit on a public URL. The autograder uses the
   plain CSV, which is private, and never trusts anything typed here.
   ====================================================================== */
function rosterHash(salt, email){
  var h = xmur3(salt + "|" + normalise(email));
  var a = h(), b = h();
  return ("00000000" + a.toString(16)).slice(-8) +
         ("00000000" + b.toString(16)).slice(-8);
}

function rosterLookup(roster, email){
  if(!roster || !roster.students) return null;
  return roster.students[rosterHash(roster.salt, email)] || null;
}


/* ======================================================================
   Drawing
   ====================================================================== */
var NS = "http://www.w3.org/2000/svg";
var GW = 75, GH = 60, IN1 = 12, IN2 = 48;

function el(n, attrs){
  var e = document.createElementNS(NS, n);
  for(var k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function gateBody(kind, x, y){
  if(kind === "and"){
    return "M "+x+","+y+" L "+(x+45)+","+y+
           " A 30,30 0 0 1 "+(x+45)+","+(y+GH)+" L "+x+","+(y+GH)+" Z";
  }
  return "M "+x+","+y+" Q "+(x+34)+","+y+" "+(x+GW)+","+(y+GH/2)+
         " Q "+(x+34)+","+(y+GH)+" "+x+","+(y+GH)+
         " Q "+(x+26)+","+(y+GH/2)+" "+x+","+y+" Z";
}
function gateInX(kind, x){ return kind === "or" ? x + 12 : x; }
function gateLabelX(kind, x){ return kind === "or" ? x + 34 : x + 26; }

function svgKit(viewBox, aria){
  var svg = el("svg", {viewBox:viewBox, xmlns:NS, role:"img", "aria-label":aria});
  var ink = "#14201B";
  var k = {
    svg: svg,
    add: function(n){ svg.appendChild(n); return n; },
    wire: function(pts, colour){
      return k.add(el("polyline", {points:pts, fill:"none",
        stroke:colour||ink, "stroke-width":"2", "stroke-linejoin":"miter"}));
    },
    dot: function(x,y){ return k.add(el("circle",{cx:x,cy:y,r:"3.5",fill:ink})); },
    label: function(x,y,t,anchor,size,colour){
      var e = el("text",{x:x, y:y+7, "text-anchor":anchor||"end",
        "font-family":"IBM Plex Mono, monospace","font-size":size||20,
        "font-weight":"600", fill:colour||ink});
      e.textContent = t; return k.add(e);
    },
    gate: function(kind,x,y){
      k.add(el("path",{d:gateBody(kind,x,y), fill:"#fff", stroke:ink, "stroke-width":"2"}));
      var t = el("text",{x:gateLabelX(kind,x), y:y+GH/2+4, "text-anchor":"middle",
        "font-family":"IBM Plex Mono, monospace","font-size":"11",
        fill:"#5B6A62","letter-spacing":"1.5"});
      t.textContent = kind.toUpperCase(); k.add(t);
    },
    not: function(x,y){
      k.add(el("path",{d:"M "+x+","+(y-14)+" L "+x+","+(y+14)+" L "+(x+26)+","+y+" Z",
        fill:"#fff", stroke:ink, "stroke-width":"2"}));
      k.add(el("circle",{cx:x+30.5, cy:y, r:"4.5", fill:"#fff", stroke:ink, "stroke-width":"2"}));
    }
  };
  return k;
}

/* Week 6 Q1 - fixed circuit: A -> NOT -> OR (with B) -> NOT -> X */
function drawA6Q1(){
  var k = svgKit("0 0 500 120", "Logic circuit: A inverted, OR with B, then inverted, giving X");
  var gy = 28, gx = 230, i1 = gy+IN1, i2 = gy+IN2, go = gy+GH/2;
  k.gate("or", gx, gy);
  k.label(52, i1, "A");
  k.wire("62,"+i1+" 96,"+i1); k.not(96, i1);
  k.wire("131,"+i1+" "+gateInX("or",gx)+","+i1);
  k.label(52, i2, "B");
  k.wire("62,"+i2+" "+gateInX("or",gx)+","+i2);
  k.wire((gx+GW)+","+go+" 340,"+go); k.not(340, go);
  k.wire("375,"+go+" 430,"+go);
  k.label(442, go, "X", "start");
  return k.svg;
}

/* Week 6 Q2 - the personalised circuit */
function drawA6Q2(sp){
  var k = svgKit("0 0 700 315", "Personalised logic circuit diagram");
  var gAx=270, gAy=78, gBx=270, gBy=228, gCx=400, gCy=156, gDx=530, gDy=100;
  var gAi1=gAy+IN1, gAi2=gAy+IN2, gAo=gAy+GH/2;
  var gBi1=gBy+IN1, gBi2=gBy+IN2, gBo=gBy+GH/2;
  var gCi1=gCy+IN1, gCi2=gCy+IN2, gCo=gCy+GH/2;
  var gDi1=gDy+IN1, gDi2=gDy+IN2, gDo=gDy+GH/2;
  var yA=gAi1, yB=gAi2, yC=30, p=sp.pins;
  var aIn=gateInX(sp.ga,gAx), bIn=gateInX(sp.gb,gBx),
      cIn=gateInX(sp.gc,gCx), dIn=gateInX(sp.gd,gDx);

  k.gate(sp.ga,gAx,gAy); k.gate(sp.gb,gBx,gBy);
  k.gate(sp.gc,gCx,gCy); k.gate(sp.gd,gDx,gDy);

  k.label(52,yA,p[0]);
  var ax = 62;
  if(sp.nA){ k.wire(ax+","+yA+" 96,"+yA); k.not(96,yA); ax = 131; }
  k.wire(ax+","+yA+" "+aIn+","+yA);
  k.wire(ax+","+yA+" 175,"+yA+" 175,"+gBi1+" "+(sp.nAA?200:bIn)+","+gBi1);
  if(sp.nAA){ k.not(200,gBi1); k.wire("235,"+gBi1+" "+bIn+","+gBi1); }
  k.dot(175,yA);

  k.label(52,yB,p[1]);
  var bx = 62;
  if(sp.nB){ k.wire(bx+","+yB+" 96,"+yB); k.not(96,yB); bx = 131; }
  k.wire(bx+","+yB+" "+aIn+","+yB);
  k.wire(bx+","+yB+" 150,"+yB+" 150,"+gBi2+" "+(sp.nBB?200:bIn)+","+gBi2);
  if(sp.nBB){ k.not(200,gBi2); k.wire("235,"+gBi2+" "+bIn+","+gBi2); }
  k.dot(150,yB);

  k.wire((gAx+GW)+","+gAo+" 372,"+gAo+" 372,"+gCi1+" "+cIn+","+gCi1);
  k.wire((gBx+GW)+","+gBo+" 385,"+gBo+" 385,"+gCi2+" "+cIn+","+gCi2);

  k.label(52,yC,p[2]);
  var cx = 62;
  if(sp.nC){ k.wire(cx+","+yC+" 430,"+yC); k.not(430,yC); cx = 465; }
  k.wire(cx+","+yC+" 505,"+yC+" 505,"+gDi1+" "+dIn+","+gDi1);
  k.wire((gCx+GW)+","+gCo+" 490,"+gCo+" 490,"+gDi2+" "+dIn+","+gDi2);
  k.wire((gDx+GW)+","+gDo+" 640,"+gDo);
  k.label(652,gDo,p[3],"start");
  return k.svg;
}

/* Seven-segment display. Draws a given set of lit segments; `label` decides
   whether each segment carries its pin name (week 7) or nothing (week 8). */
function drawSevenSeg(lit, highlight, label){
  var k = svgKit("0 0 300 300", "Seven-segment display");
  var ink = "#14201B", led = "#D99A16", off = "#DDE3DE";
  var geom = {
    a:[[75,40],[175,40]],   b:[[185,50],[185,130]], c:[[185,150],[185,230]],
    d:[[75,240],[175,240]], e:[[65,150],[65,230]],  f:[[65,50],[65,130]],
    g:[[75,140],[175,140]]
  };
  var lab = {
    a:[125,18,"middle"], b:[205,90,"start"],  c:[205,190,"start"],
    d:[125,272,"middle"], e:[45,190,"end"],   f:[45,90,"end"],
    g:[205,140,"start"]
  };
  PINS.forEach(function(seg){
    var on = lit.indexOf(seg) >= 0;
    var mine = highlight && seg === highlight;
    var p = geom[seg];
    // Amber marks the student's segment only where it is actually LIT. When
    // their segment is off it must read as off like any other, or the strip
    // shows every character as though the answer were 1 and gives the truth
    // table away backwards.
    k.add(el("line",{x1:p[0][0], y1:p[0][1], x2:p[1][0], y2:p[1][1],
      stroke: (mine && on) ? led : (on ? ink : off),
      "stroke-width":"13", "stroke-linecap":"round"}));
    if(label){
      var L = lab[seg];
      // Labels identify a segment rather than report its state, so the
      // student's own label stays picked out whether it is lit or not.
      k.label(L[0], L[1]-7, seg, L[2], 17, mine ? "#8A6208" : "#5B6A62");
    }
  });
  return k.svg;
}

/* A small glyph tile: the display rendered at a size that tiles nicely, with
   the code and character underneath. Used for the week 7 alphabet strip. */
function glyphTile(code, ch, highlight){
  var wrap = document.createElement("div");
  wrap.className = "glyph";
  var svg = drawSevenSeg(GLYPH[ch].split(""), highlight, false);
  svg.setAttribute("viewBox", "40 10 230 280");
  wrap.appendChild(svg);
  var cap = document.createElement("div");
  cap.className = "glyph-cap";
  cap.innerHTML = "<strong>" + ch + "</strong><br>" + code +
                  "<br><span class=\"bin\">" + bin4(code) + "</span>";
  wrap.appendChild(cap);
  return wrap;
}

function bin4(n){
  var s = "";
  for(var i=3;i>=0;i--) s += ((n >> i) & 1);
  return s;
}

/* ======================================================================
   Page assembly
   ====================================================================== */
function $(id){ return document.getElementById(id); }

function download(name, text){
  var b = new Blob([text], {type:"text/plain"});
  var u = URL.createObjectURL(b);
  var a = document.createElement("a");
  a.href = u; a.download = name; document.body.appendChild(a);
  a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); }, 1000);
}

function node(tag, cls, html){
  var e = document.createElement(tag);
  if(cls) e.className = cls;
  if(html !== undefined) e.innerHTML = html;
  return e;
}

/* Drawn rather than typed: neither Archivo nor IBM Plex has a glyph for the
   star (U+2605), so a literal one silently falls back to whatever system font
   does - inconsistent on screen and unpredictable in print. This scales with
   the surrounding text and inherits its colour. */
var STAR = '<svg class="star" viewBox="0 0 20 19" aria-hidden="true">'
         + '<path d="M10 0.6l2.75 5.9 6.45.72-4.8 4.4 1.3 6.38L10 14.8'
         + ' l-5.7 3.2 1.3-6.38-4.8-4.4 6.45-.72z"/></svg>';

function question(host, opts){
  var q = node("section", "q" + (opts.portfolio ? " portfolio" : ""));
  q.appendChild(node("h3", null, opts.title));
  q.appendChild(node("span", "kind",
    (opts.portfolio ? "Portfolio" : "Formative") +
    (opts.advanced ? ' &middot; <span class="adv">advanced ' + STAR + '</span>' : "")));
  var body = node("div");
  q.appendChild(body);
  host.appendChild(q);
  return body;
}

function truthTableEl(headers, rows, outFrom){
  var wrapEl = node("div","scroll");
  var t = document.createElement("table");
  var tr = document.createElement("tr");
  headers.forEach(function(h,i){
    var th = document.createElement("th");
    th.textContent = h;
    if(i >= outFrom) th.className = "out";
    tr.appendChild(th);
  });
  t.appendChild(tr);
  rows.forEach(function(r){
    var row = document.createElement("tr");
    r.forEach(function(v,i){
      var td = document.createElement("td");
      td.textContent = v;
      if(i >= outFrom) td.className = "out";
      row.appendChild(td);
    });
    t.appendChild(row);
  });
  wrapEl.appendChild(t);
  return wrapEl;
}

/* A banner at the top of the sheet so a wrong address is self-diagnosable:
   the same code is printed by the autograder in the student's feedback. */
function variantBanner(email, fingerprint){
  var d = node("div", "variant-banner");
  d.innerHTML =
    "This sheet was generated for <strong>" + email + "</strong>. Its variant "
    + "code is <span class=\"code\">" + fingerprint + "</span>. Gradescope "
    + "prints the same code at the top of your feedback &mdash; if the two do "
    + "not match, you generated this sheet with the wrong address and should "
    + "generate it again before doing any more work.";
  return d;
}

function renderFrontMatter(host, cfg){
  var f = node("div","front");
  f.appendChild(node("h3", null, "Before you start"));
  var dl = document.createElement("dl");
  function row(k,v){
    var dt = node("dt", null, k), dd = node("dd", null, v);
    dl.appendChild(dt); dl.appendChild(dd);
  }
  row("Due", cfg.dueDate);
  row("Time needed", cfg.expectedTime);
  row("Gen AI", '<span class="genai ' + cfg.genAI.toLowerCase() + '">' +
      cfg.genAI + "</span> " + cfg.genAINote);
  row("Portfolio", "Questions marked <strong>Portfolio</strong> count towards your "
      + "portfolio and are graded in Gradescope. Everything else is formative - "
      + "feedback comes via labs and tutorials.");
  row("Integrity", "Work you submit must be entirely your own. See the "
      + '<a href="https://library.leeds.ac.uk/info/1401/academic-skills/46/academic-integrity-and-plagiarism">'
      + "academic integrity guidance</a>. All submissions must carry your name "
      + "and student ID, and code must be commented.");
  if(cfg.outcomes && cfg.outcomes.length){
    row("You will have", "<ol><li>" + cfg.outcomes.join("</li><li>") + "</li></ol>");
  }
  f.appendChild(dl);
  host.appendChild(f);
}

function renderTitleBlock(cfg, fields){
  var tb = node("div","titleblock");
  var top = node("div","tb-top");
  top.appendChild(node("div","mod", cfg.moduleTitle));
  top.appendChild(node("h2", null, cfg.sheetName + "<br>" + cfg.sheetSubtitle));
  tb.appendChild(top);
  var grid = node("div","tb-grid");
  fields.forEach(function(f){
    var c = node("div","tb-cell");
    c.appendChild(node("div","k", f[0]));
    c.appendChild(node("div","v" + (f[2] ? " " + f[2] : ""), f[1]));
    grid.appendChild(c);
  });
  tb.appendChild(grid);
  return tb;
}
