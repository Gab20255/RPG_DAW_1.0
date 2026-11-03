/**
 * RPGDice — dados de RPG (d4, d6, d8, d10, d12, d20) em canvas 2D, sem dependências.
 * Requer: math3d.js, geometry.js, themes.js e css/rpg-dice.css
 *
 *   const dado = new RPGDice.Dice(elemento, { die: 'd20', theme: 'tecnologia' });
 *   const valor = await dado.roll();
 *
 * Cena 3D: o chão é o plano y = 0 (y para cima, z para o observador). O dado sempre
 * termina com UMA FACE apoiada no chão, e a sombra é a projeção real do sólido
 * (fecho convexo dos vértices projetados no chão ao longo da direção da luz),
 * então cada dado tem a sombra da sua própria geometria.
 */
(function (RD) {
  'use strict';
  const { sub, add, mul, dot, cross, norm, apply, mmul, transpose, axisAngle, rotX, rotY } = RD.m;

  const CAM = 7;                                          // distância da câmera (em raios)
  const ELEV = 35 * Math.PI / 180;                        // elevação da câmera (olhando a mesa de cima)
  const YAW = -22 * Math.PI / 180;                        // giro do dado em torno da vertical (visão 3/4)
  const CAMM = rotX(ELEV);                                // mundo -> câmera
  const CAMT = transpose(CAMM);                           // câmera -> mundo
  const CAM_POS_DIR = apply(CAMT, [0, 0, 1]);             // direção chão -> câmera, em coordenadas do mundo
  const LIGHT = norm([-0.4, 0.85, 0.3]);                  // direção até a luz (mundo): de cima, à esquerda
  const HALF = norm(add(LIGHT, CAM_POS_DIR));
  const PIPS = {
    1: [[0, 0]], 2: [[-1, 1], [1, -1]], 3: [[-1, 1], [0, 0], [1, -1]],
    4: [[-1, 1], [1, -1], [-1, -1], [1, 1]], 5: [[-1, 1], [1, -1], [-1, -1], [1, 1], [0, 0]],
    6: [[-1, 1], [1, -1], [-1, -1], [1, 1], [-1, 0], [1, 0]],
  };
  const FONT_K = { 3: 1.35, 4: 1.5, 5: 1.25 };            // tamanho do número por nº de lados da face

  // Altura (em raios do dado, acima do contato com o chão) ao longo do tempo normalizado t: queda + 3 quicadas
  function liftAt(t, H, R) {
    if (t < 0.45) { const u = t / 0.45; return H * (1 - u * u); }
    for (const [a, b, p] of [[0.45, 0.65, 0.55], [0.65, 0.8, 0.2], [0.8, 0.9, 0.07]]) {
      if (t < b) { const u = (t - a) / (b - a); return p * R * 4 * u * (1 - u); }
    }
    return 0;
  }

  // Fecho convexo 2D (Andrew monotone chain) de pontos [x, z]
  function hull2D(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }

  const randAxis = () => norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

  function randomInt(n) {
    const c = window.crypto;
    if (!c || !c.getRandomValues) return Math.floor(Math.random() * n) + 1;
    const a = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n;
    do { c.getRandomValues(a); } while (a[0] >= lim);
    return (a[0] % n) + 1;
  }

  class Dice {
    /**
     * @param {HTMLElement} container
     * @param {object} [opts]
     * @param {string} [opts.die='d20']          d4 | d6 | d8 | d10 | d12 | d20
     * @param {string} [opts.theme='tecnologia'] tecnologia | medieval | fantasia | natureza
     * @param {number} [opts.size=60]            raio do dado em px
     * @param {number} [opts.duration=2200]      duração da jogada em ms
     * @param {boolean} [opts.clickToRoll=true]
     * @param {(valor:number)=>void} [opts.onRoll]
     */
    constructor(container, opts = {}) {
      if (!(container instanceof HTMLElement)) throw new TypeError('RPGDice: container inválido');
      this.container = container;
      this.o = Object.assign({ die: 'd20', theme: 'tecnologia', size: 60, duration: 2200, clickToRoll: true, onRoll: null }, opts);

      const R = (this.R = this.o.size);
      this.W = Math.round(R * 3.8);
      this.H = Math.round(R * 5.4);
      this.floorY = this.H - R * 1.25;                    // posição do chão (ponto sob o dado) na tela
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this._raf = null; this._rolling = null;

      this.root = document.createElement('div');
      this.root.className = 'rd-root';
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'rd-canvas';
      this.canvas.width = this.W * this.dpr;
      this.canvas.height = this.H * this.dpr;
      this.canvas.style.width = this.W + 'px';
      this.canvas.style.height = this.H + 'px';
      this.canvas.setAttribute('role', 'img');
      this.ctx = this.canvas.getContext('2d');
      this.root.appendChild(this.canvas);
      container.appendChild(this.root);

      this._onClick = () => this.roll();
      if (this.o.clickToRoll) this.canvas.addEventListener('click', this._onClick);

      this.theme = RD.getTheme(this.o.theme);
      this.setDie(this.o.die);
    }

    /* ---------- API pública ---------- */

    get rolling() { return !!this._rolling; }

    setTheme(name) { this.theme = RD.getTheme(name); this._draw(); }

    setDie(name) {
      if (this._rolling) return;
      this.die = RD.getDie(name);
      this.value = 1;
      this._rest();
    }

    /** Joga o dado; Promise<number> resolvida ao final. `forcado` fixa o resultado (testes). */
    roll(forcado) {
      if (this._rolling) return this._rolling;
      const n = this.die.sides;
      const valor = Number.isInteger(forcado) && forcado >= 1 && forcado <= n ? forcado : randomInt(n);
      const reduzir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const dur = reduzir ? 1 : this.o.duration;

      // Pose final: face plana no chão (resultado em cima), sempre exata
      const fin = this._restPose(valor);
      const a1 = randAxis(), a2 = randAxis();
      const A1 = 2 * Math.PI * (2 + Math.random() * 2), A2 = 2 * Math.PI * (1 + Math.random() * 2);
      const dx0 = (Math.random() - 0.5) * this.R * 0.9, fall = this.R * 2.4;
      const t0 = performance.now();

      this._rolling = new Promise((resolve) => {
        const step = (now) => {
          const t = Math.min(1, (now - t0) / dur);
          const e = 1 - Math.pow(1 - t, 2.6);
          this.rot = t < 1 ? mmul(axisAngle(a1, A1 * (1 - e)), mmul(axisAngle(a2, A2 * (1 - e)), fin)) : fin;
          this.lift = liftAt(t, fall, this.R);
          this.dx = dx0 * Math.pow(1 - t, 2);
          this._draw();
          if (t < 1) { this._raf = requestAnimationFrame(step); return; }
          this.value = valor; this._rolling = null; this._raf = null;
          this.canvas.setAttribute('aria-label', `${this.die.name}: resultado ${valor}`);
          this.container.dispatchEvent(new CustomEvent('diceroll', { bubbles: true, detail: { die: this.die.name, value: valor } }));
          if (typeof this.o.onRoll === 'function') this.o.onRoll(valor);
          resolve(valor);
        };
        this._raf = requestAnimationFrame(step);
      });
      return this._rolling;
    }

    destroy() {
      if (this._raf) cancelAnimationFrame(this._raf);
      this.canvas.removeEventListener('click', this._onClick);
      this.root.remove();
    }

    /* ---------- renderização ---------- */

    // Orientação do dado no mundo quando repousa mostrando `valor`
    _restPose(valor) { return mmul(rotY(YAW), RD.restOrientation(this.die, valor)); }

    _rest() {
      this.rot = this._restPose(this.value);
      this.lift = 0; this.dx = 0;
      this.canvas.setAttribute('aria-label', `Dado ${this.die.name}`);
      this._draw();
    }

    _draw() {
      const { ctx, R, W, H, die, theme: th, dpr, rot } = this;
      const D = CAM * R, ox = W / 2, oy = this.floorY;
      const base = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // mundo (y para cima, chão em y = 0) -> tela, com perspectiva
      const proj = (w) => {
        const c = apply(CAMM, w), f = D / (D - c[2]);
        return [ox + c[0] * f, oy - c[1] * f];
      };

      // Vértices no mundo. O ponto mais baixo toca o chão (+ `lift` enquanto o dado está no ar);
      // no repouso esse ponto é a face inteira apoiada no chão.
      const rel = die.V.map((v) => apply(rot, mul(v, R)));
      const yc = -Math.min(...rel.map((p) => p[1])) + this.lift;
      const cen = [this.dx, yc, 0];
      const P = rel.map((p) => add(p, cen));
      const S = P.map(proj);
      const camPos = mul(CAM_POS_DIR, D);

      base(); ctx.clearRect(0, 0, W, H);

      // sombra no chão: silhueta do próprio sólido projetada ao longo da luz
      const shadow = hull2D(P.map((p) => [p[0] - LIGHT[0] * p[1] / LIGHT[1], p[2] - LIGHT[2] * p[1] / LIGHT[1]]));
      const sp = shadow.map(([x, z]) => proj([x, 0, z]));
      const k = 1 / (1 + this.lift / R);                        // some e desfoca com a altura
      const OFF = 5000;                                         // truque: desenha fora da tela e usa só a sombra (borda suave)
      ctx.save();
      ctx.globalAlpha = Math.min(1, 0.85 * k);
      ctx.shadowColor = th.shadow;
      ctx.shadowBlur = R * (0.05 + 0.2 * (1 - k)) * dpr;
      ctx.shadowOffsetX = OFF * dpr; ctx.shadowOffsetY = 0;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      sp.forEach((q, i) => (i ? ctx.lineTo(q[0] - OFF, q[1]) : ctx.moveTo(q[0] - OFF, q[1])));
      ctx.closePath(); ctx.fill();
      ctx.restore();
      base();

      // Prepara o sistema de coordenadas "da face": x à direita, y para baixo, 1 unidade = 1px
      const place = (pModel, upModel, nModel) => {
        const nr = apply(rot, nModel), ur = apply(rot, upModel), pr = add(apply(rot, mul(pModel, R)), cen);
        const right = norm(cross(ur, nr)), upv = cross(nr, right);
        const P0 = proj(pr), pR = proj(add(pr, right)), pU = proj(add(pr, upv));
        ctx.setTransform(dpr * (pR[0] - P0[0]), dpr * (pR[1] - P0[1]), -dpr * (pU[0] - P0[0]), -dpr * (pU[1] - P0[1]), dpr * P0[0], dpr * P0[1]);
      };

      const paintStyle = (fs) => {
        if (th.metal) {
          const g = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2);
          g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#9aa1aa'); g.addColorStop(0.7, '#eceff3'); g.addColorStop(1, '#6f757d');
          return g;
        }
        return th.number;
      };

      const text = (str, fs) => {
        ctx.font = `${th.fontStyle} ${fs}px ${th.fontFamily}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (th.glow) { ctx.shadowColor = th.glow; ctx.shadowBlur = 8; }
        if (th.metal) { ctx.lineWidth = Math.max(1, fs * 0.06); ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(str, 0, 0); }
        ctx.fillStyle = paintStyle(fs);
        ctx.fillText(str, 0, 0);
        ctx.shadowBlur = 0;
      };

      for (const f of die.faces) {
        const nr = apply(rot, f.n), cr = add(apply(rot, mul(f.c, R)), cen);
        if (dot(nr, sub(camPos, cr)) <= 0) continue;                     // face de trás (poliedro convexo)

        // iluminação
        const lam = Math.max(0, dot(nr, LIGHT));
        const spec = Math.pow(Math.max(0, dot(nr, HALF)), 28) * th.spec;
        const lit = 0.38 + 0.62 * lam;
        // Cor fixa: a iluminação não altera a cor da face.
        ctx.fillStyle = `rgb(${th.base.map(
            (channel) => clamp(channel)
        ).join(',')})`;

        ctx.beginPath();
        f.verts.forEach((vi, i) => (i ? ctx.lineTo(S[vi][0], S[vi][1]) : ctx.moveTo(S[vi][0], S[vi][1])));
        ctx.closePath();
        ctx.fill();

        ctx.lineJoin = 'round';
        if (th.metal) { ctx.lineWidth = th.edgeWidth + 2; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke(); }
        ctx.lineWidth = th.edgeWidth; ctx.strokeStyle = th.edge;
        if (th.glow) { ctx.shadowColor = th.glow; ctx.shadowBlur = 10; }
        ctx.stroke(); ctx.shadowBlur = 0;

        // marcações
        const rho = f.rho * R;
        if (die.kind === 'pips') {                                       // d6: pontos
          place(f.c, f.up, f.n);
          if (th.glow) { ctx.shadowColor = th.glow; ctx.shadowBlur = 8; }
          ctx.fillStyle = paintStyle(rho);
          for (const [px, py] of PIPS[f.value]) {
            ctx.beginPath(); ctx.arc(px * rho * 0.5, py * rho * 0.5, rho * 0.15, 0, Math.PI * 2); ctx.fill();
          }
          ctx.shadowBlur = 0; base();
        } else if (die.kind === 'vertex') {                              // d4: número em cada vértice
          for (const vi of f.verts) {
            const p = add(f.c, mul(sub(die.V[vi], f.c), 0.58));
            place(p, norm(sub(die.V[vi], f.c)), f.n);
            text(String(vi + 1), rho * 0.95);
            base();
          }
        } else {                                                          // demais: número no centro da face
          const s = (f.value === 6 || f.value === 9) ? f.value + '.' : String(f.value);
          let fs = rho * (FONT_K[f.sides] || 1.3);
          if (s.length > 1) fs *= 0.82;
          place(f.c, f.up, f.n);
          text(s, fs);
          base();
        }
      }
    }
  }

  RD.Dice = Dice;
})(window.RPGDice);
