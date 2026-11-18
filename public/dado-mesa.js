'use strict';

class BandejaD20 {
    constructor(bandeja) {
        this.palco = bandeja.querySelector('#dice-stage');
        this.status = bandeja.querySelector('#dice-status');
        this.resultado = bandeja.querySelector('#dice-result');
        this.fila = [];
        this.cenaId = null;
        this.processando = false;
        this.encerrada = false;
        this.palco.hidden = false;
        this.resultado.hidden = true;
        this.resultado.textContent = '';
        this.status.textContent = 'Aguardando uma rolagem da partida.';
        try {
            this.dado = new window.RPGDice.Dice(this.palco, {
                die: 'd20', theme: 'medieval', size: 36, duration: 1150, clickToRoll: false,
            });
        } catch {
            this.palco.replaceChildren();
            this.palco.hidden = true;
            this.status.textContent = 'Dado 3D indisponível. Os resultados serão exibidos em texto.';
        }
    }

    sincronizar(cena, animar) {
        if (!cena || this.cenaId === cena.cena_id) return;
        const rolagens = cena.rolagens.filter(({ d20 }) => Number.isInteger(d20) && d20 >= 1 && d20 <= 20);
        if (!rolagens.length) return;
        this.cenaId = cena.cena_id;
        if (!animar) this.fila.length = 0;
        this.fila.push({ turno: cena.turno, rolagens, animar });
        this.processarFila();
    }

    async processarFila() {
        if (this.processando) return;
        this.processando = true;
        while (this.fila.length && !this.encerrada) {
            const { turno, rolagens, animar } = this.fila.shift();
            const indiceInicial = animar && this.dado ? 0 : rolagens.length - 1;
            for (let indice = indiceInicial; indice < rolagens.length; indice++) {
                if (this.encerrada || this.fila[0]?.animar === false) break;
                const rolagem = rolagens[indice];
                if (animar && this.dado) {
                    this.resultado.hidden = true;
                    this.status.textContent = 'Rolando D20…';
                    await this.dado.roll(rolagem.d20);
                    if (this.encerrada) return;
                } else this.dado?.mostrarValor(rolagem.d20);

                this.mostrarResultado(rolagem, turno, indice, rolagens.length);
            }
        }
        this.processando = false;
    }

    mostrarResultado(rolagem, turno, indice, quantidade) {
        const modificador = rolagem.bonus < 0 ? '− ' + Math.abs(rolagem.bonus) : '+ ' + rolagem.bonus;
        const posicao = quantidade > 1 ? ' · Rolagem ' + (indice + 1) + ' de ' + quantidade : '';
        this.status.textContent = 'Turno ' + turno + posicao;
        this.resultado.textContent = ['D20', rolagem.d20, modificador, '=', rolagem.total, '· Dificuldade', rolagem.dificuldade].join(' ');
        this.resultado.hidden = false;
    }

    encerrar() {
        this.encerrada = true;
        this.fila.length = 0;
        this.dado?.destroy();
    }
}
