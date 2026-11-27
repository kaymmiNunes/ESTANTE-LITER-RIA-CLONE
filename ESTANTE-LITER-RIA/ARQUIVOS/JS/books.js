// Módulo de busca multi-consulta, compatibilidade, pontuação e sorteio ponderado (Vanilla JS)
(function (global) {
    const cfg = global.AppConfig || {};
    const GOOGLE_ENDPOINT = (cfg.googleBooks && cfg.googleBooks.endpoint) || 'https://www.googleapis.com/books/v1/volumes';
    const GOOGLE_API_KEY = (cfg.googleBooks && cfg.googleBooks.apiKey) || '';
    const TOP_CANDIDATES_LIMIT = (cfg.recommendation && cfg.recommendation.topCandidatesCount) || 10;
    const HISTORY_KEY = (cfg.recommendation && cfg.recommendation.sessionHistoryKey) || 'estante_literaria_recent_books_v1';
    const MAX_HISTORY = (cfg.recommendation && cfg.recommendation.maxSessionHistory) || 12;

    // Pesos ajustáveis: priorizam compatibilidade e qualidade de metadados sem depender só de popularidade
    const SCORING_WEIGHTS = {
        primaryGenreMatch: 28,
        secondaryGenreMatch: 14,
        attributeKeywordMatch: 7,
        hasCover: 12,
        hasDescription: 10,
        hasAuthors: 6,
        hasIsbn: 5,
        ratingBonusWeight: 4,      // Indicador auxiliar de qualidade (nota média)
        popularityBonusWeight: 5   // Indicador auxiliar de alcance (log10 de avaliações)
    };

    const GENRE_PROFILES = {
        fantasia: {
            label: 'Fantasia',
            subject: 'Fantasy',
            keywords: ['fantasia', 'fantasy', 'aventura', 'adventure', 'magia', 'magic', 'reino', 'dragao', 'epico']
        },
        ficcao: {
            label: 'Ficção',
            subject: 'Fiction',
            keywords: ['ficcao', 'fiction', 'romance', 'sociedade', 'futuro', 'distopia', 'filosofia', 'humanidade']
        },
        misterio: {
            label: 'Mistério',
            subject: 'Mystery',
            keywords: ['misterio', 'mystery', 'suspense', 'investigacao', 'thriller', 'crime', 'segredo', 'detetive']
        },
        desenvolvimento: {
            label: 'Desenvolvimento',
            subject: 'Self-Help',
            keywords: ['habitos', 'habits', 'mente', 'mindset', 'psicologia', 'foco', 'produtividade', 'decisao']
        }
    };

    const ATTRIBUTE_KEYWORDS = {
        ritmo: {
            imersivo: ['imersivo', 'jornada', 'saga', 'mundo', 'viagem'],
            contemplativo: ['reflexao', 'consciencia', 'memoria', 'filosofia', 'silencio'],
            acelerado: ['suspense', 'tensao', 'rapido', 'urgente', 'thriller'],
            objetivo: ['pratico', 'metodo', 'clareza', 'habitos', 'direto']
        },
        complexidade: {
            elaborada: ['complexo', 'mundo', 'intriga', 'estrutura', 'epico'],
            filosofica: ['etica', 'moral', 'existencia', 'sociedade', 'liberdade'],
            investigativa: ['investigacao', 'pistas', 'enigma', 'segredo', 'verdade'],
            estruturada: ['sistema', 'principios', 'rotina', 'ciencia', 'passos']
        },
        tema: {
            'mitologia e reinos': ['reino', 'mitologia', 'linhagem', 'trono', 'ancestral'],
            'sociedade e poder': ['poder', 'sistema', 'controle', 'estado', 'sociedade'],
            'segredo e crime': ['crime', 'segredo', 'misterio', 'culpa', 'investigacao'],
            'habitos e decisao': ['habitos', 'decisao', 'escolha', 'rotina', 'mente'],
            'jornada epica': ['jornada', 'aventura', 'travessia', 'caminho'],
            'identidade e destino': ['identidade', 'destino', 'quem sou', 'verdade'],
            'suspense e tensao': ['suspense', 'tensao', 'medo', 'ameaca'],
            'foco e metodo': ['foco', 'atencao', 'metodo', 'disciplina'],
            'futuro e distopia': ['futuro', 'distopia', 'amanha', 'tecnologia'],
            'enigma e suspense': ['enigma', 'misterio', 'segredo', 'pista'],
            'habitos e produtividade': ['produtividade', 'habitos', 'tempo', 'rotina'],
            'autoconhecimento': ['autoconhecimento', 'mente', 'consciencia', 'emocao']
        },
        epoca: {
            classico: ['classico', 'classic', 'atemporal', 'tradicao'],
            moderno: ['moderno', 'seculo xx', 'historia'],
            contemporaneo: ['contemporaneo', 'atual', 'hoje', 'moderno'],
            atual: ['atual', 'contemporaneo', 'hoje', 'pratico']
        }
    };

    function normalizeText(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function pickDominantKey(mapObj, fallbackKey) {
        let bestKey = fallbackKey;
        let maxCount = -1;
        for (const [key, count] of Object.entries(mapObj)) {
            if (count > maxCount) {
                maxCount = count;
                bestKey = key;
            }
        }
        return bestKey;
    }

    /**
     * Analisa as 10 respostas e constrói o perfil literário ponderado.
     */
    function buildUserProfile(answers = {}) {
        const genreTallies = {
            fantasia: 0,
            ficcao: 0,
            misterio: 0,
            desenvolvimento: 0
        };
        const ritmoTallies = {};
        const complexidadeTallies = {};
        const temaTallies = {};
        const epocaTallies = {};

        Object.values(answers).forEach((ans) => {
            if (!ans) return;

            if (typeof ans === 'string') {
                if (Object.prototype.hasOwnProperty.call(genreTallies, ans)) {
                    genreTallies[ans] += 1;
                }
                return;
            }

            if (ans.genero && Object.prototype.hasOwnProperty.call(genreTallies, ans.genero)) {
                genreTallies[ans.genero] += 1;
            }
            if (ans.ritmo) ritmoTallies[ans.ritmo] = (ritmoTallies[ans.ritmo] || 0) + 1;
            if (ans.complexidade) complexidadeTallies[ans.complexidade] = (complexidadeTallies[ans.complexidade] || 0) + 1;
            if (ans.tema) temaTallies[ans.tema] = (temaTallies[ans.tema] || 0) + 1;
            if (ans.epoca) epocaTallies[ans.epoca] = (epocaTallies[ans.epoca] || 0) + 1;
        });

        const rankedGenres = Object.entries(genreTallies).sort((a, b) => b[1] - a[1]);
        const primaryGenre = rankedGenres[0] && rankedGenres[0][1] > 0 ? rankedGenres[0][0] : 'ficcao';
        const secondaryGenre = rankedGenres[1] && rankedGenres[1][1] > 0 ? rankedGenres[1][0] : null;

        const ritmo = pickDominantKey(ritmoTallies, 'imersivo');
        const complexidade = pickDominantKey(complexidadeTallies, 'elaborada');
        const tema = pickDominantKey(temaTallies, 'sociedade e poder');
        const epoca = pickDominantKey(epocaTallies, 'moderno');

        const primaryInfo = GENRE_PROFILES[primaryGenre] || GENRE_PROFILES.ficcao;
        const secondaryInfo = secondaryGenre ? GENRE_PROFILES[secondaryGenre] : null;

        return {
            primaryGenre,
            secondaryGenre,
            primaryLabel: primaryInfo.label,
            secondaryLabel: secondaryInfo ? secondaryInfo.label : null,
            primarySubject: primaryInfo.subject,
            secondarySubject: secondaryInfo ? secondaryInfo.subject : null,
            ritmo,
            complexidade,
            tema,
            epoca,
            genreTallies
        };
    }

    function extractCover(imageLinks) {
        if (!imageLinks) return null;
        const raw = imageLinks.medium || imageLinks.large || imageLinks.thumbnail || imageLinks.smallThumbnail;
        if (!raw) return null;
        return raw.replace(/^http:\/\//i, 'https://');
    }

    function extractIdentifiers(industryIdentifiers) {
        let isbn13 = null;
        let isbn10 = null;
        if (Array.isArray(industryIdentifiers)) {
            industryIdentifiers.forEach((idObj) => {
                if (!idObj || !idObj.identifier) return;
                const clean = String(idObj.identifier).replace(/[^0-9X]/gi, '');
                if (idObj.type === 'ISBN_13' && clean.length >= 10) isbn13 = clean;
                if (idObj.type === 'ISBN_10' && clean.length >= 10) isbn10 = clean;
            });
        }
        return { isbn13, isbn10 };
    }

    function buildDedupeKey(book) {
        if (book.isbn13) return `isbn13:${book.isbn13}`;
        if (book.isbn10) return `isbn10:${book.isbn10}`;
        const titleNorm = normalizeText(book.title).replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
        const authorNorm = normalizeText(book.authors).split(',')[0].trim();
        return `title_author:${titleNorm}|${authorNorm}`;
    }

    function normalizeGoogleVolume(item) {
        const info = (item && item.volumeInfo) || {};
        if (!info.title) return null;

        const authorsList = Array.isArray(info.authors) && info.authors.length > 0
            ? info.authors
            : ['Autor não informado'];
        const categoriesList = Array.isArray(info.categories) && info.categories.length > 0
            ? info.categories
            : [];
        const { isbn13, isbn10 } = extractIdentifiers(info.industryIdentifiers);

        const book = {
            id: item.id || '',
            title: info.title.trim(),
            authors: authorsList.join(', '),
            authorsList,
            categories: categoriesList,
            categoryLabel: categoriesList[0] || null,
            description: info.description ? info.description.trim() : null,
            coverUrl: extractCover(info.imageLinks),
            averageRating: typeof info.averageRating === 'number' ? info.averageRating : null,
            ratingsCount: typeof info.ratingsCount === 'number' ? info.ratingsCount : null,
            isbn13,
            isbn10,
            infoLink: info.infoLink || info.previewLink || (item.id ? `https://books.google.com/books?id=${encodeURIComponent(item.id)}` : 'https://books.google.com'),
            publishedDate: info.publishedDate || null
        };

        book.dedupeKey = buildDedupeKey(book);
        return book;
    }

    function collectProfileKeywords(profile) {
        const words = new Set();
        const addWords = (arr) => {
            if (!Array.isArray(arr)) return;
            arr.forEach((item) => {
                normalizeText(item)
                    .split(/[^a-z0-9]+/)
                    .filter((w) => w.length >= 4)
                    .forEach((w) => words.add(w));
            });
        };

        addWords((GENRE_PROFILES[profile.primaryGenre] || {}).keywords);
        if (profile.secondaryGenre) {
            addWords((GENRE_PROFILES[profile.secondaryGenre] || {}).keywords);
        }
        addWords((ATTRIBUTE_KEYWORDS.ritmo || {})[profile.ritmo]);
        addWords((ATTRIBUTE_KEYWORDS.complexidade || {})[profile.complexidade]);
        addWords((ATTRIBUTE_KEYWORDS.tema || {})[profile.tema]);
        addWords((ATTRIBUTE_KEYWORDS.epoca || {})[profile.epoca]);

        normalizeText(profile.tema)
            .split(/[^a-z0-9]+/)
            .filter((w) => w.length >= 4)
            .forEach((w) => words.add(w));

        return Array.from(words);
    }

    /**
     * Avalia compatibilidade com o perfil + qualidade bibliográfica + indicadores auxiliares de avaliação.
     */
    function scoreBook(book, profile, keywords) {
        const hayText = normalizeText([
            book.title,
            book.authors,
            book.categories.join(' '),
            book.description || ''
        ].join(' '));

        let score = 0;
        const matchedTerms = [];

        const primaryKw = (GENRE_PROFILES[profile.primaryGenre] || {}).keywords || [];
        const hasPrimaryMatch = primaryKw.some((kw) => hayText.includes(normalizeText(kw)));
        if (hasPrimaryMatch) {
            score += SCORING_WEIGHTS.primaryGenreMatch;
            matchedTerms.push(profile.primaryLabel);
        }

        if (profile.secondaryGenre) {
            const secondaryKw = (GENRE_PROFILES[profile.secondaryGenre] || {}).keywords || [];
            const hasSecondaryMatch = secondaryKw.some((kw) => hayText.includes(normalizeText(kw)));
            if (hasSecondaryMatch) {
                score += SCORING_WEIGHTS.secondaryGenreMatch;
                matchedTerms.push(profile.secondaryLabel);
            }
        }

        let kwHits = 0;
        keywords.forEach((kw) => {
            if (hayText.includes(kw)) {
                kwHits += 1;
                if (kwHits <= 5 && matchedTerms.length < 4) {
                    matchedTerms.push(kw);
                }
            }
        });
        score += Math.min(28, kwHits * SCORING_WEIGHTS.attributeKeywordMatch);

        if (book.coverUrl) score += SCORING_WEIGHTS.hasCover;
        if (book.description && book.description.length > 40) score += SCORING_WEIGHTS.hasDescription;
        if (book.authors && book.authors !== 'Autor não informado') score += SCORING_WEIGHTS.hasAuthors;
        if (book.isbn13 || book.isbn10) score += SCORING_WEIGHTS.hasIsbn;

        // Indicadores auxiliares (não eliminam livros sem nota ou menos populares)
        if (typeof book.averageRating === 'number' && book.averageRating > 0) {
            score += book.averageRating * SCORING_WEIGHTS.ratingBonusWeight;
        }
        if (typeof book.ratingsCount === 'number' && book.ratingsCount > 0) {
            score += Math.min(20, Math.log10(book.ratingsCount + 1) * SCORING_WEIGHTS.popularityBonusWeight);
        }

        return {
            score: Number(score.toFixed(2)),
            matchedTerms: Array.from(new Set(matchedTerms))
        };
    }

    async function fetchGoogleQuery(queryStr, options = {}) {
        const { startIndex = 0, maxResults = 30, langRestrict = '' } = options;
        const keyParam = GOOGLE_API_KEY ? `&key=${encodeURIComponent(GOOGLE_API_KEY)}` : '';
        const langParam = langRestrict ? `&langRestrict=${encodeURIComponent(langRestrict)}` : '';
        const url = `${GOOGLE_ENDPOINT}?q=${encodeURIComponent(queryStr)}${langParam}&maxResults=${maxResults}&startIndex=${startIndex}${keyParam}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erro na Google Books API (HTTP ${response.status})`);
        }
        const data = await response.json();
        return Array.isArray(data.items) ? data.items : [];
    }

    function getRecentHistory() {
        try {
            const raw = sessionStorage.getItem(HISTORY_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function saveToHistory(dedupeKey) {
        if (!dedupeKey) return;
        try {
            const current = getRecentHistory().filter((k) => k !== dedupeKey);
            current.unshift(dedupeKey);
            sessionStorage.setItem(HISTORY_KEY, JSON.stringify(current.slice(0, MAX_HISTORY)));
        } catch (_) {
            // Ignora caso sessionStorage esteja indisponível
        }
    }

    /**
     * Sorteio ponderado pela pontuação entre os melhores candidatos.
     */
    function weightedPick(candidates) {
        if (!Array.isArray(candidates) || candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];

        const minScore = Math.min(...candidates.map((c) => c.compatibilityScore));
        const weights = candidates.map((c) => Math.max(1, (c.compatibilityScore - minScore) + 3));
        const totalWeight = weights.reduce((acc, w) => acc + w, 0);

        let roll = Math.random() * totalWeight;
        for (let i = 0; i < candidates.length; i++) {
            roll -= weights[i];
            if (roll <= 0) {
                return candidates[i];
            }
        }
        return candidates[candidates.length - 1];
    }

    /**
     * Executa múltiplas buscas, deduplica, pontua e sorteia entre os melhores candidatos.
     */
    async function recommendBook(answers) {
        const profile = buildUserProfile(answers);
        const keywords = collectProfileKeywords(profile);

        const temaShort = normalizeText(profile.tema).split(/\s+/).filter((w) => w.length >= 4)[0] || '';
        const ritmoShort = normalizeText(profile.ritmo).split(/\s+/).filter((w) => w.length >= 4)[0] || '';
        const offsetA = Math.floor(Math.random() * 2) * 20;
        const offsetB = Math.floor(Math.random() * 3) * 20;

        const queries = [
            { q: `${profile.primaryLabel} ${temaShort} subject:${profile.primarySubject}`, opts: { startIndex: offsetA, maxResults: 30, langRestrict: 'pt' } },
            { q: `${profile.primaryLabel} ${ritmoShort} subject:${profile.primarySubject}`, opts: { startIndex: offsetB, maxResults: 30, langRestrict: 'pt' } },
            { q: `subject:${profile.primarySubject} ${temaShort || profile.primaryLabel}`, opts: { startIndex: 0, maxResults: 30, langRestrict: '' } }
        ];

        if (profile.secondarySubject) {
            queries.push({
                q: `subject:${profile.secondarySubject} ${profile.primaryLabel}`,
                opts: { startIndex: 0, maxResults: 25, langRestrict: '' }
            });
        }

        const settled = await Promise.allSettled(
            queries.map((item) => fetchGoogleQuery(item.q, item.opts))
        );

        let successfulRequests = 0;
        const rawBooks = [];

        settled.forEach((res) => {
            if (res.status === 'fulfilled') {
                successfulRequests += 1;
                res.value.forEach((item) => {
                    const normalized = normalizeGoogleVolume(item);
                    if (normalized) rawBooks.push(normalized);
                });
            }
        });

        if (successfulRequests === 0) {
            throw new Error('Não foi possível conectar à Google Books API.');
        }

        if (rawBooks.length === 0) {
            return null;
        }

        // 1. Deduplicação mantendo o registro com maior riqueza de dados
        const uniqueMap = new Map();
        rawBooks.forEach((book) => {
            const existing = uniqueMap.get(book.dedupeKey);
            if (!existing) {
                uniqueMap.set(book.dedupeKey, book);
            } else {
                const existingRichness = (existing.coverUrl ? 2 : 0) + (existing.description ? 2 : 0) + (existing.isbn13 ? 1 : 0);
                const newRichness = (book.coverUrl ? 2 : 0) + (book.description ? 2 : 0) + (book.isbn13 ? 1 : 0);
                if (newRichness > existingRichness) {
                    uniqueMap.set(book.dedupeKey, book);
                }
            }
        });

        // 2. Pontuação de compatibilidade + qualidade
        const scoredList = Array.from(uniqueMap.values()).map((book) => {
            const { score, matchedTerms } = scoreBook(book, profile, keywords);
            return {
                ...book,
                compatibilityScore: score,
                matchedTerms
            };
        });

        scoredList.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

        // 3. Evita repetir livros já sorteados na sessão, mantendo fallback se o pool for pequeno
        const recentKeys = new Set(getRecentHistory());
        const nonRepeated = scoredList.filter((b) => !recentKeys.has(b.dedupeKey));
        const pool = nonRepeated.length >= 3 ? nonRepeated : scoredList;

        // 4. Seleciona conjunto dos melhores candidatos e sorteia entre eles
        const topCandidates = pool.slice(0, Math.min(TOP_CANDIDATES_LIMIT, pool.length));
        const chosen = weightedPick(topCandidates);

        if (chosen) {
            saveToHistory(chosen.dedupeKey);
        }

        return {
            book: chosen,
            profile
        };
    }

    global.BooksEngine = {
        buildUserProfile,
        recommendBook
    };
})(window);