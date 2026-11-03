/* Geometria exata dos dados. Cada dado é definido só pelos vértices;
   as faces são obtidas pelo fecho convexo (planos de suporte). */
(function (RD) {
  'use strict';
  const { sub, mul, dot, cross, len, norm, align, rotY } = RD.m;

  const PHI = (1 + Math.sqrt(5)) / 2;

  // Expande todas as combinações de sinais das componentes não nulas
  function signed([x, y, z]) {
    const out = [];
    for (const sx of x ? [1, -1] : [1])
      for (const sy of y ? [1, -1] : [1])
        for (const sz of z ? [1, -1] : [1]) out.push([x * sx, y * sy, z * sz]);
    return out;
  }

  // D10: trapezoedro pentagonal. A altura `a` do anel garante faces planas (pipas)
  function trapezohedron5() {
    const h = 1, c = Math.cos(Math.PI / 5), a = h * (1 - c) / (1 + c);
    const v = [[0, h, 0], [0, -h, 0]];
    for (let k = 0; k < 5; k++) {
      const t = (2 * Math.PI * k) / 5;
      v.push([Math.cos(t), a, Math.sin(t)]);
      v.push([Math.cos(t + Math.PI / 5), -a, Math.sin(t + Math.PI / 5)]);
    }
    return v;
  }

  const DEFS = {
    d4:  { kind: 'vertex', verts: () => [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]] },   // tetraedro
    d6:  { kind: 'pips',   verts: () => signed([1, 1, 1]) },                                      // cubo
    d8:  { kind: 'number', verts: () => [].concat(signed([1, 0, 0]), signed([0, 1, 0]), signed([0, 0, 1])) }, // octaedro
    d10: { kind: 'number', verts: trapezohedron5 },                                               // trapezoedro pentagonal
    d12: { kind: 'number', verts: () => [].concat(                                                // dodecaedro
      signed([1, 1, 1]), signed([0, 1 / PHI, PHI]), signed([1 / PHI, PHI, 0]), signed([PHI, 0, 1 / PHI])) },
    d20: { kind: 'number', verts: () => [].concat(                                                // icosaedro
      signed([0, 1, PHI]), signed([1, PHI, 0]), signed([PHI, 0, 1])) },
  };

  // Faces = planos que contêm vértices e deixam todos os outros do mesmo lado
  function hullFaces(V) {
    const EPS = 1e-6, seen = new Set(), faces = [];
    for (let i = 0; i < V.length; i++)
      for (let j = i + 1; j < V.length; j++)
        for (let k = j + 1; k < V.length; k++) {
          let n = cross(sub(V[j], V[i]), sub(V[k], V[i]));
          if (len(n) < 1e-9) continue;
          n = norm(n);
          const d = dot(n, V[i]);
          const on = []; let pos = 0, neg = 0;
          V.forEach((p, m) => {
            const s = dot(n, p) - d;
            if (Math.abs(s) < EPS) on.push(m); else if (s > 0) pos++; else neg++;
          });
          if (pos && neg) continue;
          if (pos) n = mul(n, -1);                 // normal para fora
          const key = on.join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          faces.push({ verts: on, n });
        }
    return faces;
  }

  function build(name) {
    const def = DEFS[name];
    let V = def.verts();
    const R = Math.max(...V.map(len));
    V = V.map((p) => mul(p, 1 / R));               // circunraio = 1

    const faces = hullFaces(V).map((f) => {
      const c = mul(f.verts.reduce((s, i) => [s[0] + V[i][0], s[1] + V[i][1], s[2] + V[i][2]], [0, 0, 0]), 1 / f.verts.length);
      const e1 = norm(sub(V[f.verts[0]], c)), e2 = cross(f.n, e1);
      const ang = (i) => Math.atan2(dot(sub(V[i], c), e2), dot(sub(V[i], c), e1));
      const verts = f.verts.slice().sort((a, b) => ang(a) - ang(b));   // anti-horário visto de fora

      const dist = verts.map((i) => len(sub(V[i], c)));
      const max = Math.max(...dist);
      let up;
      if (verts.length === 4 && dist.every((d) => Math.abs(d - max) < 1e-6)) {
        const mid = mul([V[verts[0]][0] + V[verts[1]][0], V[verts[0]][1] + V[verts[1]][1], V[verts[0]][2] + V[verts[1]][2]], 0.5);
        up = norm(sub(mid, c));                     // quadrado: "cima" aponta para uma aresta
      } else {
        up = norm(sub(V[verts[dist.findIndex((d) => d > max - 1e-6)]], c));
      }

      let rho = Infinity;                           // raio inscrito da face
      verts.forEach((a, i) => {
        const A = V[a], B = V[verts[(i + 1) % verts.length]];
        rho = Math.min(rho, len(cross(sub(B, A), sub(c, A))) / len(sub(B, A)));
      });
      return { verts, n: f.n, c, up, rho, sides: verts.length, value: 0 };
    });

    // Numeração: faces opostas somam (lados + 1). O d4 numera vértices, não faces.
    const N = faces.length;
    if (def.kind !== 'vertex') {
      let k = 1;
      faces.forEach((f, i) => {
        if (f.value) return;
        const j = faces.findIndex((g, m) => m !== i && !g.value && dot(g.n, f.n) < -0.999);
        f.value = k; faces[j].value = N + 1 - k; k++;
      });
    }
    // Raio inscrito: distância do centro ao plano da face. É a altura do centro do dado
    // quando ele repousa com uma face apoiada no chão.
    const inradius = Math.min(...faces.map((f) => dot(f.n, f.c)));
    return { name, sides: def.kind === 'vertex' ? 4 : N, kind: def.kind, V, faces, inradius };
  }

  const cache = {};
  RD.DICE = Object.keys(DEFS);
  RD.getDie = (name) => {
    const key = String(name).toLowerCase();
    if (!DEFS[key]) throw new Error(`Dado inválido "${name}". Use: ${RD.DICE.join(', ')}`);
    return cache[key] || (cache[key] = build(key));
  };

  // Orientação de repouso no mundo (eixo y = para cima, z = para o observador).
  // O dado SEMPRE termina com uma face plana no chão:
  //  - d6, d8, d10, d12, d20: a face sorteada fica em cima (a oposta, paralela, apoia no chão);
  //  - d4: o vértice sorteado aponta para cima (a face oposta a ele apoia no chão).
  // O número da face fica legível para quem olha de frente (o "topo" do número aponta para o fundo da mesa).
  RD.restOrientation = (die, value) => {
    if (die.kind === 'vertex') {
      const vi = value - 1, f = die.faces.find((g) => g.verts.includes(vi));
      return RD.m.mmul(rotY(Math.PI / 3), align(die.V[vi], f.n, [0, 1, 0], [0, 0, 1]));
    }
    const f = die.faces.find((g) => g.value === value);
    return align(f.n, f.up, [0, 1, 0], [0, 0, -1]);
  };
})(window.RPGDice);
