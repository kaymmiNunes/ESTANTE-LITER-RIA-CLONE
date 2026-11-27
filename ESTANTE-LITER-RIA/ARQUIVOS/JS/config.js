// Configurações centrais das APIs públicas (Vanilla JS)
// Observação: em projetos puramente front-end, prefira restringir as chaves por domínio/referrer
// no painel de cada provedor e não versionar chaves privadas em repositórios públicos.
(function (global) {
    global.AppConfig = {
        googleBooks: {
            endpoint: 'https://www.googleapis.com/books/v1/volumes',
            // Se quiser usar uma chave própria, preencha aqui; caso contrário, o sistema consulta sem chave.
            apiKey: 'AIzaSyDbw-8En6MU9BG946LsGuHqARRze5SPa5o'
        },
        openLibrary: {
            searchEndpoint: 'https://openlibrary.org/search.json',
            worksEndpoint: 'https://openlibrary.org/works',
            baseUrl: 'https://openlibrary.org'
        },
        nytBooks: {
            reviewsEndpoint: 'https://api.nytimes.com/svc/books/v3/reviews.json',
            // Opcional: cadastre-se gratuitamente em developer.nytimes.com para obter críticas editoriais do NYT
            apiKey: ''
        },
        recommendation: {
            topCandidatesCount: 10,
            sessionHistoryKey: 'estante_literaria_recent_books_v1',
            maxSessionHistory: 12
        }
    };
})(window);