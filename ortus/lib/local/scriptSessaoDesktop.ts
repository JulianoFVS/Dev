/**
 * Roda no HTML, antes do JavaScript do app, só dentro do .exe.
 *
 * O cliente do Supabase tenta renovar o token assim que a página abre. Sem
 * internet essa renovação segura a tela e manda a pessoa de volta ao login.
 * Se já existe uma sessão neste navegador, a validade local é estendida para
 * o dia da clínica continuar. O arquivo `sessao.json` guarda o token real.
 */
export const SCRIPT_SESSAO_DESKTOP = `(function(){try{var chaves=Object.keys(localStorage);for(var i=0;i<chaves.length;i++){if(!/^sb-.*-auth-token$/.test(chaves[i])&&chaves[i]!=='supabase.auth.token')continue;var cru=localStorage.getItem(chaves[i]);if(!cru)continue;var sessao=JSON.parse(cru);var agora=Math.floor(Date.now()/1000);if(sessao&&sessao.access_token&&sessao.refresh_token&&Number(sessao.expires_at||0)<agora+180){sessao.expires_at=agora+12*60*60;sessao.expires_in=12*60*60;localStorage.setItem(chaves[i],JSON.stringify(sessao));}}}catch(e){}})();`;
