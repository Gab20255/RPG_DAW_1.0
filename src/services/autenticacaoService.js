const bcrypt = require('bcryptjs');
const { randomBytes: bytesAleatorios, createHash: criarHash } = require('node:crypto');
const { EventEmitter: EmissorEventos } = require('node:events');
const { ErroAplicacao } = require('./erroAplicacao');

const NOME_COOKIE = 'rpg_sessao';
const DURACAO_SESSAO = 12 * 60 * 60 * 1000;
const HASH_INEXISTENTE = '$2b$12$3wGpFAb5Vslhq1sMZBKv0evFqCSaKEDMQkp0uhObQJiPjZqbUY1te';

function validarCampos(corpo, campos, opcionais = []) {
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo) || campos.some(campo => !Object.hasOwn(corpo, campo)) || Object.keys(corpo).some(campo => ![...campos, ...opcionais].includes(campo))) throw new ErroAplicacao(400, 'CAMPOS_INVALIDOS', 'Campos da requisição inválidos.');
}

function tokenDaRequisicao(requisicao) {
    const cookies = String(requisicao.headers.cookie || '').split(';').map(item => item.trim()).filter(item => item.startsWith(`${NOME_COOKIE}=`));
    if (cookies.length !== 1) return null;
    const token = cookies[0].slice(NOME_COOKIE.length + 1);
    return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function hashToken(token) { return criarHash('sha256').update(token).digest('hex'); }
function apresentarUsuario(usuario) { return { id: usuario.id, username: usuario.username, email: usuario.email }; }

class Autenticacao extends EmissorEventos {
    constructor(banco, { agora = () => Date.now(), duracao = DURACAO_SESSAO } = {}) {
        super(); this.banco = banco; this.agora = agora; this.duracao = duracao;
    }

    async cadastrar(corpo) {
        validarCampos(corpo, ['username', 'email', 'senha']);
        if (typeof corpo.username !== 'string' || !/^[a-zA-Z0-9_]{3,30}$/.test(corpo.username) || typeof corpo.email !== 'string' || corpo.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(corpo.email)) throw new ErroAplicacao(400, 'USUARIO_INVALIDO', 'Nome de usuário ou e-mail inválido.');
        if (typeof corpo.senha !== 'string' || corpo.senha.length < 10 || Buffer.byteLength(corpo.senha, 'utf8') > 72) throw new ErroAplicacao(400, 'SENHA_INVALIDA', 'Senha: mínimo de 10 caracteres e máximo de 72 bytes.');
        const nomeUsuario = corpo.username.toLowerCase(), email = corpo.email.toLowerCase();
        const senhaHash = await bcrypt.hash(corpo.senha, 12);
        try {
            const inserido = this.banco.executar('INSERT INTO usuarios(username, email, senha_hash) VALUES (?, ?, ?)', nomeUsuario, email, senhaHash);
            return { id: Number(inserido.lastInsertRowid), username: nomeUsuario, email };
        } catch (erro) {
            if (String(erro.message).includes('UNIQUE constraint failed')) throw new ErroAplicacao(409, 'CADASTRO_INDISPONIVEL', 'Nome de usuário ou e-mail indisponível.');
            throw erro;
        }
    }

    async entrar(corpo, tokenAnterior = null) {
        validarCampos(corpo, ['login', 'senha']);
        if (typeof corpo.login !== 'string' || !corpo.login.trim() || corpo.login.length > 254 || typeof corpo.senha !== 'string' || !corpo.senha || Buffer.byteLength(corpo.senha, 'utf8') > 72) throw new ErroAplicacao(401, 'CREDENCIAIS_INVALIDAS', 'Login ou senha inválidos.');
        const login = corpo.login.trim().toLowerCase();
        const usuario = this.banco.obter('SELECT id, username, email, senha_hash FROM usuarios WHERE lower(username) = ? OR lower(email) = ?', login, login);
        const confere = await bcrypt.compare(corpo.senha, usuario?.senha_hash || HASH_INEXISTENTE);
        if (!usuario || !confere) throw new ErroAplicacao(401, 'CREDENCIAIS_INVALIDAS', 'Login ou senha inválidos.');
        const token = bytesAleatorios(32).toString('hex'), expiraEm = this.agora() + this.duracao;
        this.banco.transacao(() => {
            this.banco.executar('DELETE FROM sessoes WHERE expira_em <= ?', this.agora());
            if (tokenAnterior) this.banco.executar('DELETE FROM sessoes WHERE token_hash = ?', hashToken(tokenAnterior));
            this.banco.executar('INSERT INTO sessoes(token_hash, usuario_id, expira_em) VALUES (?, ?, ?)', hashToken(token), usuario.id, expiraEm);
        });
        if (tokenAnterior) this.emit('revogada', hashToken(tokenAnterior));
        return { usuario: apresentarUsuario(usuario), token, expira_em: expiraEm };
    }

    autenticar(token) {
        if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new ErroAplicacao(401, 'SESSAO_NECESSARIA', 'Autenticação necessária.');
        const sessao = this.banco.obter('SELECT s.token_hash, s.expira_em, u.id, u.username, u.email FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ? AND s.expira_em > ?', hashToken(token), this.agora());
        if (!sessao) throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Sessão expirada ou encerrada.');
        return { usuario: apresentarUsuario(sessao), token_hash: sessao.token_hash, expira_em: sessao.expira_em };
    }

    conferir(sessao) {
        const atual = this.banco.obter('SELECT usuario_id FROM sessoes WHERE token_hash = ? AND expira_em > ?', sessao?.token_hash || '', this.agora());
        if (!atual || atual.usuario_id !== sessao.usuario.id) throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Sessão expirada ou encerrada.');
        return sessao.usuario;
    }

    sair(token) {
        if (!token) return;
        const hash = hashToken(token);
        this.banco.executar('DELETE FROM sessoes WHERE token_hash = ?', hash);
        this.emit('revogada', hash);
    }
}

module.exports = { Autenticacao, NOME_COOKIE, tokenDaRequisicao, validarCampos };
