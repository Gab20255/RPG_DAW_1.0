const { test, expect } = require('@playwright/test');

async function cadastrar(page, name) {
    await page.goto('/'); await expect(page.locator('#auth')).toBeVisible();
    await page.screenshot({path:'test-results/login.png',fullPage:true});
    await page.getByRole('button',{name:'Criar conta',exact:true}).click();
    const form = page.locator('#register-form');
    await form.getByLabel('Nome de usuário').fill(name); await form.getByLabel('E-mail').fill(`${name}@example.com`);
    await form.getByLabel('Senha').fill('teste-seguro-123'); await form.getByRole('button',{name:'Criar minha conta'}).click();
    await expect(page.locator('#notice')).toContainText('Conta criada');
    await page.locator('#login-form').getByLabel('Senha').fill('teste-seguro-123');
    await page.getByRole('button',{name:'Entrar na aventura'}).click(); await expect(page.locator('#dashboard')).toBeVisible();
}
async function personagem(page, name) {
    const form = page.locator('#character-form'); await expect(form).toBeVisible();
    await form.getByLabel('Nome do personagem').fill(name); await form.getByLabel('Aparência',{exact:true}).fill('Armadura de couro, cabelos curtos e olhos castanhos.');
    await form.locator('[name="habilidades_ids"]').nth(0).check(); await form.locator('[name="habilidades_ids"]').nth(1).check();
    await form.getByRole('button',{name:'Sugerir pela aparência'}).click(); await expect(page.locator('#notice')).toContainText('Retrato sugerido');
    await form.getByRole('button',{name:'Salvar personagem'}).click(); await expect(form).toBeHidden();
    await page.getByRole('button',{name:'Estou pronto',exact:true}).click(); await expect(page.getByRole('button',{name:'Cancelar prontidão'})).toBeVisible();
}
test('jornada completa com duas sessões isoladas, recarga, reconexão e falha da IA', async ({ browser }) => {
    const contextA = await browser.newContext(), contextB = await browser.newContext();
    const a = await contextA.newPage(), b = await contextB.newPage();
    const errors = []; for (const page of [a,b]) page.on('pageerror', e=>errors.push(e.message));
    try {
        await cadastrar(a,'navegadora'); await cadastrar(b,'explorador');
        await a.locator('#create-room').getByLabel('Nome da aventura').fill('A trilha esquecida');
        await a.getByLabel('Universo e história').fill('Uma aventura medieval em uma floresta misteriosa.');
        await a.getByLabel('Tom da narrativa').fill('Exploração e mistério');
        await a.getByRole('button',{name:'Criar sala',exact:false}).click();
        await expect(a.locator('#room')).toBeVisible(); const code = await a.locator('#copy-code').textContent();
        await b.locator('#join-room').getByLabel('Código da sala').fill(code); await b.getByRole('button',{name:'Entrar com código'}).click();
        await expect(a.locator('#lobby-members .member')).toHaveCount(2);
        await personagem(a,'Lia'); await personagem(b,'Ivo');
        await expect(a.getByRole('button',{name:'Iniciar aventura'})).toBeEnabled();
        await a.screenshot({path:'test-results/lobby.png',fullPage:true});
        await a.getByRole('button',{name:'Iniciar aventura'}).click();
        await expect(a.locator('#game')).toBeVisible(); await expect(b.locator('#game')).toBeVisible();
        await a.getByRole('button',{name:'Observar',exact:true}).click();
        await expect(a.locator('#turn')).toHaveText('Turno 1'); await expect(b.locator('#turn')).toHaveText('Turno 1');
        await expect(b.locator('#history')).toContainText('O grupo observa');
        await b.reload(); await expect(b.locator('#turn')).toHaveText('Turno 1'); await expect(b.locator('#my-character')).toContainText('Ivo');
        await contextB.setOffline(true); await expect(b.locator('#connection')).toContainText('Reconectando');
        await a.getByRole('button',{name:'Observar',exact:true}).click(); await expect(a.locator('#turn')).toHaveText('Turno 2');
        await contextB.setOffline(false); await expect(b.locator('#turn')).toHaveText('Turno 2');
        await b.getByLabel('O que você faz?').fill('/teste inteligencia falha429'); await b.getByRole('button',{name:'Enviar ação'}).click();
        await expect(b.locator('#notice')).toContainText('Limite de requisições'); await expect(b.locator('#pending')).toBeVisible();
        await b.getByRole('button',{name:'Tentar novamente'}).click(); await expect(a.locator('#turn')).toHaveText('Turno 3'); await expect(b.locator('#pending')).toBeHidden();
        const destination = a.locator('#destinations button').first(); const destinationName = (await destination.textContent()).replace(/^Ir para /,'').replace(/ →$/,'');
        await destination.click(); await expect(a.locator('#scene-name')).toHaveText(destinationName); await expect(b.locator('#scene-name')).toHaveText(destinationName);
        await a.screenshot({path:'test-results/jogo-desktop.png',fullPage:true});
        await b.setViewportSize({width:390,height:844}); await b.screenshot({path:'test-results/jogo-mobile.png',fullPage:true});
        expect(await b.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        // Uma desconexão longa não pode deixar um buraco entre as páginas do diário.
        await contextB.setOffline(true);
        const rooms = await (await a.request.get('/api/salas')).json(); const roomId = rooms.salas[0].id;
        for (let turno = 4; turno < 27; turno++) {
            const response = await a.request.post(`/api/salas/${roomId}/acoes`,{data:{acao:'/observar',turno_esperado:turno}});
            expect(response.status()).toBe(200);
        }
        await contextB.setOffline(false); await expect(b.locator('#turn')).toHaveText('Turno 27');
        await expect(b.locator('#history .scene-entry')).toHaveCount(28);
        await b.reload(); await expect(b.locator('#turn')).toHaveText('Turno 27');
        await expect(b.locator('#older-history')).toBeVisible(); await b.locator('#older-history').click();
        await expect(b.locator('#history .scene-entry')).toHaveCount(28);
        await a.getByRole('button',{name:'Sair',exact:true}).click(); await expect(a.locator('#auth')).toBeVisible();
        expect(errors).toEqual([]);
    } finally { await contextA.close(); await contextB.close(); }
});
