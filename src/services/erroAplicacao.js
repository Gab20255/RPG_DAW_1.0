class ErroAplicacao extends Error {
    constructor(status, codigo, mensagem) {
        super(mensagem);
        this.status = status;
        this.codigo = codigo;
    }
}

module.exports = { ErroAplicacao };
