/* ==========================================================================
   Demonstração — escolha o dado e o tema mudando as variáveis abaixo
   ========================================================================== */
const CONFIG = {
  dado: 'd10',          // 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20'
  tema: 'medieval',   // 'tecnologia' | 'medieval' | 'fantasia' | 'natureza'
  tamanho: 60,          // raio do dado em px
  duracao: 2200,        // duração da jogada em ms
};

const tema = RPGDice.getTheme(CONFIG.tema);
document.body.style.background = tema.page;
document.body.style.setProperty('--texto', tema.text);
document.body.style.setProperty('--destaque', tema.edge);

const saida = document.getElementById('resultado');
const botao = document.getElementById('btn');
const area = document.getElementById('dado');

const dado = new RPGDice.Dice(area, {
  die: CONFIG.dado,
  theme: CONFIG.tema,
  size: CONFIG.tamanho,
  duration: CONFIG.duracao,
});

async function jogar() {
  if (dado.rolling) return;
  botao.disabled = true;
  saida.textContent = 'Rolando…';
  const valor = await dado.roll();
  saida.textContent = `${CONFIG.dado.toUpperCase()}: ${valor}`;
  botao.disabled = false;
}

botao.addEventListener('click', jogar);

// Clique direto no dado: o componente já joga; aqui só reagimos ao evento
area.addEventListener('diceroll', (e) => {
  saida.textContent = `${e.detail.die.toUpperCase()}: ${e.detail.value}`;
  botao.disabled = false;
});
area.addEventListener('click', () => {
  if (dado.rolling) { saida.textContent = 'Rolando…'; botao.disabled = true; }
});
