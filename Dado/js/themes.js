/* Temas visuais. Para criar outro, copie um bloco e ajuste as cores. */
(function (RD) {
  'use strict';

  RD.THEMES = {
    tecnologia: {                                   // azul marinho + neon azul claro
      page: 'radial-gradient(circle at 50% 35%, #0e2c68 0%, #050d24 75%)',
      text: '#9af2ff',
      base: [10, 29, 74], light: [120, 220, 255], spec: 0.5,
      edge: '#4de1ff', edgeWidth: 1.6, metal: false, glow: '#4de1ff',
      number: '#9af2ff',
      fontStyle: '600', fontFamily: 'Consolas, "Courier New", monospace',
      shadow: 'rgba(77,225,255,0.45)',
    },
    medieval: {                                     // marrom + prata metálico
      page: 'radial-gradient(circle at 50% 35%, #55361f 0%, #1c120a 75%)',
      text: '#d9dde3',
      base: [96, 60, 34], light: [255, 232, 205], spec: 0.2,
      edge: '#c9ced6', edgeWidth: 2.4, metal: true, glow: null,
      number: '#d9dde3',
      fontStyle: '700', fontFamily: 'Georgia, "Times New Roman", serif',
      shadow: 'rgba(0,0,0,0.55)',
    },
    fantasia: {                                     // roxo + rosa
      page: 'radial-gradient(circle at 50% 35%, #4a1a80 0%, #14052b 75%)',
      text: '#ffd6f4',
      base: [88, 30, 146], light: [255, 150, 225], spec: 0.5,
      edge: '#ff6fd1', edgeWidth: 1.8, metal: false, glow: '#ff6fd1',
      number: '#ffd6f4',
      fontStyle: 'italic 700', fontFamily: '"Palatino Linotype", "Book Antiqua", Georgia, serif',
      shadow: 'rgba(255,111,209,0.4)',
    },
    natureza: {                                     // tons de verde
      page: 'radial-gradient(circle at 50% 35%, #2f6b3a 0%, #0c2312 75%)',
      text: '#eaffd8',
      base: [34, 100, 54], light: [200, 255, 170], spec: 0.3,
      edge: '#a6e07f', edgeWidth: 1.6, metal: false, glow: null,
      number: '#eaffd8',
      fontStyle: '700', fontFamily: '"Trebuchet MS", Verdana, sans-serif',
      shadow: 'rgba(0,0,0,0.45)',
    },
  };

  RD.getTheme = (name) => {
    const t = RD.THEMES[String(name).toLowerCase()];
    if (!t) throw new Error(`Tema inválido "${name}". Use: ${Object.keys(RD.THEMES).join(', ')}`);
    return t;
  };
})(window.RPGDice);
