// O schema já cria tabelas ausentes. Esta migração atualiza as tabelas existentes.
module.exports = banco => {
    const camposSala = new Set(banco.listar('PRAGMA table_info(salas)').map(campo => campo.name));
    if (!camposSala.has('etapa')) {
        banco.conexao.exec("ALTER TABLE salas ADD COLUMN etapa TEXT NOT NULL DEFAULT 'preparacao' CHECK(etapa IN ('preparacao', 'em_andamento'))");
        // Campanhas já jogadas não devem voltar ao lobby nem exigir novas fichas.
        banco.conexao.exec(`UPDATE salas SET etapa = 'em_andamento' WHERE id IN (
            SELECT sc.sala_id FROM salas_campanhas sc JOIN campanhas c ON c.id = sc.campanha_id
            WHERE COALESCE(json_extract(c.mundo_json, '$.campanha.turno'), 0) > 0
               OR json_extract(c.mundo_json, '$.campanha.pendente') IS NOT NULL
               OR json_extract(c.mundo_json, '$.campanha.estado') = 'concluida'
        )`);
    }
    if (!camposSala.has('iniciada_em')) banco.conexao.exec('ALTER TABLE salas ADD COLUMN iniciada_em TEXT');
    if (!camposSala.has('revisao_preparacao')) banco.conexao.exec('ALTER TABLE salas ADD COLUMN revisao_preparacao INTEGER NOT NULL DEFAULT 0 CHECK(revisao_preparacao >= 0)');
    if (!banco.listar('PRAGMA table_info(sala_membros)').some(campo => campo.name === 'pronto')) {
        banco.conexao.exec('ALTER TABLE sala_membros ADD COLUMN pronto INTEGER NOT NULL DEFAULT 0 CHECK(pronto IN (0, 1))');
    }
};
