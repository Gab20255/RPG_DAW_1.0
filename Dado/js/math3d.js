/* Vetores 3D e matrizes 3x3 (linha a linha). Namespace: window.RPGDice.m */
(function (RD) {
  'use strict';

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => mul(a, 1 / (len(a) || 1));

  const apply = (m, v) => [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];

  const mmul = (a, b) => {
    const r = new Array(9);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
      }
    }
    return r;
  };

  const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

  // Rotação de `ang` radianos em torno do eixo unitário `k` (Rodrigues)
  const axisAngle = (k, ang) => {
    const [x, y, z] = k, c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    return [
      t * x * x + c,     t * x * y - s * z, t * x * z + s * y,
      t * x * y + s * z, t * y * y + c,     t * y * z - s * x,
      t * x * z - s * y, t * y * z + s * x, t * z * z + c,
    ];
  };
  const rotX = (a) => axisAngle([1, 0, 0], a);
  const rotY = (a) => axisAngle([0, 1, 0], a);

  // Base ortonormal cujo 1º eixo é `a` e o 2º é `b` ortogonalizado (colunas)
  const basis = (a, b) => {
    const e1 = norm(a);
    const e2 = norm(sub(b, mul(e1, dot(b, e1))));
    const e3 = cross(e1, e2);
    return [e1[0], e2[0], e3[0], e1[1], e2[1], e3[1], e1[2], e2[2], e3[2]];
  };

  // Rotação que leva a→A e b→B
  const align = (a, b, A, B) => mmul(basis(A, B), transpose(basis(a, b)));

  RD.m = { sub, add, mul, dot, cross, len, norm, apply, mmul, transpose, axisAngle, rotX, rotY, align };
})((window.RPGDice = window.RPGDice || {}));
