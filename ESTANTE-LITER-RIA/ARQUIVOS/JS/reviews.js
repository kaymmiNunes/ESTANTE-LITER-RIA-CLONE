// Módulo de consulta de avaliações e resenhas reais (Open Library + New York Times Books API)
(function (global) {
    const cfg = global.AppConfig || {};
    const OL_SEARCH = (cfg.openLibrary && cfg.openLibrary.searchEndpoint) || 'https://openlibrary.org/search.json';
    const OL_WORKS = (cfg.openLibrary && cfg.openLibrary.worksEndpoint) || 'https://openlibrary.org/works';
    const OL_BASE = (cfg.openLibrary && cfg.openLibrary.baseUrl) || 'https://openlibrary.org';
    const NYT_ENDPOINT = (cfg.nytBooks && cfg.nytBooks.reviewsEndpoint) || 'https://api.nytimes.com/svc/books/v3/reviews.json';
    const NYT_API_KEY = (cfg.nytBooks && cfg.nytBooks.apiKey) || '';

    async function fetchOpenLibraryData(book) {
        const isbnQuery = book.isbn13 || book.isbn10;
        const primaryAuthor = Array.isArray(book.authorsList) && book.authorsList.length > 0
            ? book.authorsList[0]
            : '';

        const searchQuery = isbnQuery
            ? `isbn:${encodeURIComponent(isbnQuery)}`
            : `title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(primaryAuthor)}`;

        const url = `${OL_SEARCH}?${searchQuery}&limit=3&fields=key,title,author_name,ratings_average,ratings_count,edition_count`;
        const response = await fetch(url);
        if (!response.ok) return null;

        const data = await response.json();
        const doc = Array.isArray(data.docs) && data.docs.length > 0 ? data.docs[0] : null;
        if (!doc) return null;

        let workRatingAverage = typeof doc.ratings_average === 'number' ? doc.ratings_average : null;
        let workRatingCount = typeof doc.ratings_count === 'number' ? doc.ratings_count : null;
        const workKey = doc.key || '';

        if (workKey && workKey.startsWith('/works/')) {
            try {
                const workId = workKey.replace('/works/', '');
                const ratingsRes = await fetch(`${OL_WORKS}/${encodeURIComponent(workId)}/ratings.json`);
                if (ratingsRes.ok) {
                    const ratingsData = await ratingsRes.json();
                    if (ratingsData && ratingsData.summary && typeof ratingsData.summary.average === 'number') {
                        workRatingAverage = ratingsData.summary.average;
                    }
                    if (ratingsData && ratingsData.summary && typeof ratingsData.summary.count === 'number') {
                        workRatingCount = ratingsData.summary.count;
                    }
                }
            } catch (_) {
                // Mantém dados do doc caso o endpoint de ratings não responda
            }
        }

        return {
            sourceName: 'Open Library',
            averageRating: workRatingAverage,
            ratingsCount: workRatingCount,
            editionCount: typeof doc.edition_count === 'number' ? doc.edition_count : null,
            workUrl: workKey ? `${OL_BASE}${workKey}` : `${OL_BASE}/search?q=${encodeURIComponent(book.title)}`
        };
    }

    async function fetchNytEditorialReview(book) {
        if (!NYT_API_KEY) {
            return null;
        }

        const params = new URLSearchParams();
        if (book.isbn13) {
            params.set('isbn', book.isbn13);
        } else if (book.isbn10) {
            params.set('isbn', book.isbn10);
        } else {
            params.set('title', book.title);
        }
        params.set('api-key', NYT_API_KEY);

        const response = await fetch(`${NYT_ENDPOINT}?${params.toString()}`);
        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        const results = Array.isArray(data.results) ? data.results : [];
        if (results.length === 0) return null;

        const first = results[0];
        const summary = first.summary ? String(first.summary).trim() : '';
        const reviewUrl = first.url || null;

        if (!summary && !reviewUrl) return null;

        return {
            sourceName: 'The New York Times Books',
            byline: first.byline ? String(first.byline).trim() : null,
            publicationDate: first.publication_dt || null,
            excerpt: summary || null,
            url: reviewUrl
        };
    }

    /**
     * Consolida avaliação de leitores, resenha de leitor e crítica editorial sem inventar dados.
     */
    async function getReviewsForBook(book) {
        if (!book) {
            return {
                readerRating: { available: false },
                readerReview: { available: false, note: 'Livro indisponível.' },
                editorialReview: { available: false, note: 'Livro indisponível.' }
            };
        }

        const [olResult, nytResult] = await Promise.allSettled([
            fetchOpenLibraryData(book),
            fetchNytEditorialReview(book)
        ]);

        const olData = olResult.status === 'fulfilled' ? olResult.value : null;
        const nytData = nytResult.status === 'fulfilled' ? nytResult.value : null;

        // 1. Avaliação de leitores (Google Books + Open Library quando disponível)
        let averageRating = typeof book.averageRating === 'number' ? book.averageRating : null;
        let ratingsCount = typeof book.ratingsCount === 'number' ? book.ratingsCount : null;
        let ratingSource = averageRating !== null ? 'Google Books' : null;

        if (olData && typeof olData.averageRating === 'number') {
            if (averageRating === null) {
                averageRating = olData.averageRating;
                ratingsCount = olData.ratingsCount;
                ratingSource = 'Open Library';
            } else if (typeof olData.ratingsCount === 'number' && olData.ratingsCount > (ratingsCount || 0)) {
                averageRating = olData.averageRating;
                ratingsCount = olData.ratingsCount;
                ratingSource = 'Open Library';
            }
        }

        const readerRating = averageRating !== null
            ? {
                available: true,
                average: averageRating,
                count: ratingsCount,
                source: ratingSource
            }
            : {
                available: false
            };

        // 2. Resenha de leitor (sem inventar resenha; exibe link da obra na Open Library quando encontrado)
        const readerReview = olData && olData.workUrl
            ? {
                available: false,
                sourceName: 'Open Library (Comunidade)',
                url: olData.workUrl,
                note: 'Nenhuma resenha textual de leitor foi retornada diretamente pela API pública; consulte a página da obra na Open Library.'
            }
            : {
                available: false,
                sourceName: null,
                url: null,
                note: 'Nenhuma resenha de leitor disponível nas fontes consultadas.'
            };

        // 3. Crítica editorial (NYT Books API quando configurada e com registro encontrado)
        const editorialReview = nytData
            ? {
                available: true,
                sourceName: nytData.sourceName,
                byline: nytData.byline,
                publicationDate: nytData.publicationDate,
                excerpt: nytData.excerpt,
                url: nytData.url
            }
            : {
                available: false,
                sourceName: 'The New York Times Books',
                url: null,
                note: NYT_API_KEY
                    ? 'Não há crítica editorial catalogada para este título na fonte consultada.'
                    : 'Crítica editorial não configurada no momento (adicione uma chave do NYT Books API em config.js para habilitar).'
            };

        return {
            readerRating,
            readerReview,
            editorialReview
        };
    }

    global.ReviewsService = {
        getReviewsForBook
    };
})(window);