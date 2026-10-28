/*
 * Roda antes da primeira pintura (script síncrono no <head>).
 *
 * Marca <html class="tem-sessao"> quando há sessão do Supabase salva neste
 * navegador, ou chegando pela URL (links de confirmação e de recuperação de
 * senha). Com a classe, o HTML pré-renderizado da landing fica escondido —
 * senão quem já está logado veria a landing piscar antes do painel. O App usa
 * a mesma classe para decidir entre o spinner de sessão e a landing.
 */
(function () {
  try {
    if (/access_token=|refresh_token=|type=recovery|[?&]code=/.test(location.hash + location.search)) {
      document.documentElement.classList.add("tem-sessao");
      return;
    }
    for (var i = 0; i < localStorage.length; i++) {
      var chave = localStorage.key(i);
      if (chave && /^sb-.+-auth-token$/.test(chave)) {
        document.documentElement.classList.add("tem-sessao");
        return;
      }
    }
  } catch (e) {
    /* sem localStorage: segue como visitante */
  }
})();
