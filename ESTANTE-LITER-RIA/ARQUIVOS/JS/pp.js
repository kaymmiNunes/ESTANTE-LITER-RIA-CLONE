// pp.js — Diagnóstico e controle do Quiz Literário
(function () {
    function showDebugBanner(message) {
        let banner = document.getElementById('quizDebugBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'quizDebugBanner';
            banner.style.cssText = 'background:#4a1c14;color:#fff8f0;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:10px;text-align:center;';
            const container = document.querySelector('.quiz-section') || document.body;
            container.prepend(banner);
        }
        banner.textContent = message;
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatStars(avg) {
        const clamped = Math.max(1, Math.min(5, Number(avg)));
        const rounded = Math.round(clamped);
        return `${'★'.repeat(rounded)}${'☆'.repeat(5 - rounded)} (${clamped.toFixed(1)}/5)`;
    }

    function buildJustification(book, profile) {
        const parts = [];
        parts.push(`Afinidade principal com <strong>${escapeHtml(profile.primaryLabel)}</strong>`);
        if (profile.secondaryLabel) {
            parts.push(`e influência secundária de <strong>${escapeHtml(profile.secondaryLabel)}</strong>`);
        }
        parts.push(`ritmo <strong>${escapeHtml(profile.ritmo)}</strong>, complexidade <strong>${escapeHtml(profile.complexidade)}</strong> e tema <strong>${escapeHtml(profile.tema)}</strong>`);

        if (Array.isArray(book.matchedTerms) && book.matchedTerms.length > 0) {
            parts.push(`Termos compatíveis: <strong>${escapeHtml(book.matchedTerms.slice(0, 4).join(', '))}</strong>.`);
        } else {
            parts.push('Selecionado entre os candidatos mais compatíveis com o perfil.');
        }

        return parts.join(', ') + '.';
    }

    function renderFullRecommendation(book, profile, reviewPack) {
        const title = escapeHtml(book.title);
        const authors = escapeHtml(book.authors);
        const categoryText = escapeHtml(book.categoryLabel || profile.primaryLabel);
        const synopsisText = book.description
            ? escapeHtml(book.description.length > 420 ? `${book.description.slice(0, 420).trim()}...` : book.description)
            : 'Sinopse não informada na fonte consultada.';

        const coverHtml = book.coverUrl
            ? `<img src="${escapeHtml(book.coverUrl)}" alt="Capa de ${title}" class="google-book-cover">`
            : `<div class="google-book-cover google-book-cover-placeholder">Capa indisponível</div>`;

        const rr = reviewPack && reviewPack.readerRating ? reviewPack.readerRating : { available: false };
        const ratingSummaryHtml = rr.available
            ? `<span class="google-rating-stars">${escapeHtml(formatStars(rr.average))}</span>` +
              (typeof rr.count === 'number'
                  ? ` <span class="rating-meta-text">(${escapeHtml(rr.count)} avaliações · ${escapeHtml(rr.source || 'Leitores')})</span>`
                  : ` <span class="rating-meta-text">(${escapeHtml(rr.source || 'Leitores')})</span>`)
            : `<span class="google-rating-empty">Nota média indisponível no momento</span>`;

        const justificationHtml = buildJustification(book, profile);

        const readerRev = reviewPack && reviewPack.readerReview ? reviewPack.readerReview : { available: false };
        const editorialRev = reviewPack && reviewPack.editorialReview ? reviewPack.editorialReview : { available: false };

        const readerReviewHtml = readerRev.available
            ? `<p class="review-excerpt">"${escapeHtml(readerRev.excerpt)}"</p>
               <p class="review-source">Fonte: <strong>${escapeHtml(readerRev.sourceName)}</strong>` +
               (readerRev.url ? ` — <a href="${escapeHtml(readerRev.url)}" target="_blank" rel="noopener noreferrer">Ver resenha original</a>` : '') +
               `</p>`
            : `<p class="review-unavailable">${escapeHtml(readerRev.note || 'Nenhuma resenha de leitor disponível.')}</p>` +
              (readerRev.url
                  ? `<p class="review-source">Fonte: <strong>${escapeHtml(readerRev.sourceName || 'Open Library')}</strong> — <a href="${escapeHtml(readerRev.url)}" target="_blank" rel="noopener noreferrer">Consultar página da obra</a></p>`
                  : '');

        const editorialReviewHtml = editorialRev.available
            ? `<p class="review-excerpt">"${escapeHtml(editorialRev.excerpt)}"</p>
               <p class="review-source">Fonte: <strong>${escapeHtml(editorialRev.sourceName)}</strong>` +
               (editorialRev.byline ? ` · ${escapeHtml(editorialRev.byline)}` : '') +
               (editorialRev.url ? ` — <a href="${escapeHtml(editorialRev.url)}" target="_blank" rel="noopener noreferrer">Ler crítica original</a>` : '') +
               `</p>`
            : `<p class="review-unavailable">${escapeHtml(editorialRev.note || 'Nenhuma crítica editorial disponível.')}</p>`;

        return `
            <h4>🎯 Recomendação Literária Selecionada</h4>
            <article class="google-book-card detailed-recommendation-card">
                ${coverHtml}
                <div class="google-book-details">
                    <span class="book-category-badge">Categoria: ${categoryText}</span>
                    <h3 class="google-book-title">${title}</h3>
                    <p class="google-book-author">por ${authors}</p>
                    <div class="google-book-rating">${ratingSummaryHtml}</div>

                    <div class="detail-block">
                        <strong>Sinopse:</strong>
                        <p class="book-synopsis-text">${synopsisText}</p>
                    </div>

                    <div class="detail-block justification-box">
                        <strong>Por que combina com o seu perfil:</strong>
                        <p class="justification-text">${justificationHtml}</p>
                    </div>

                    <div class="reviews-grid">
                        <div class="review-box">
                            <h5>Resenha de Leitor</h5>
                            ${readerReviewHtml}
                        </div>
                        <div class="review-box">
                            <h5>Crítica Editorial</h5>
                            ${editorialReviewHtml}
                        </div>
                    </div>

                    <div class="google-book-actions">
                        <a href="${escapeHtml(book.infoLink)}" target="_blank" rel="noopener noreferrer" class="primary-btn review-btn">
                            Mais informações do livro
                        </a>
                    </div>
                </div>
            </article>
            <div class="result-restart-wrapper">
                <button type="button" id="restartQuizBtn" class="secondary-btn">Refazer Quiz</button>
            </div>
        `;
    }

    function bootQuiz() {
        const form = document.getElementById('advancedQuizForm');
        const resultBox = document.getElementById('quizResult');
        if (!form || !resultBox) return;

        const steps = Array.from(form.querySelectorAll('.quiz-question-group'));
        const prevBtn = document.getElementById('prevBtn');
        const counterEl = document.getElementById('questionCounter');
        const percentEl = document.getElementById('progressPercent');
        const fillEl = document.getElementById('progressFill');
        const progressBox = document.querySelector('.quiz-progress-container');

        if (steps.length === 0) {
            showDebugBanner('Nenhuma pergunta (.quiz-question-group) encontrada dentro de #advancedQuizForm.');
            return;
        }

        let stepIndex = 0;
        let busy = false;
        const answers = {};

        function renderStep() {
            steps.forEach((el, idx) => {
                el.classList.toggle('hidden', idx !== stepIndex);
            });

            const currentNum = stepIndex + 1;
            const percent = Math.round((currentNum / steps.length) * 100);

            if (counterEl) counterEl.textContent = `Pergunta ${currentNum} de ${steps.length}`;
            if (percentEl) percentEl.textContent = `${percent}%`;
            if (fillEl) fillEl.style.width = `${percent}%`;
            if (prevBtn) prevBtn.classList.toggle('hidden', stepIndex === 0);
            busy = false;
        }

        async function runRecommendation() {
            form.classList.add('hidden');
            if (progressBox) progressBox.classList.add('hidden');
            resultBox.classList.remove('hidden');
            resultBox.innerHTML = `
                <div class="google-loading">
                    <p>📚 Buscando livros compatíveis e verificando avaliações...</p>
                </div>
            `;

            try {
                if (!window.BooksEngine || typeof window.BooksEngine.recommendBook !== 'function') {
                    throw new Error('BooksEngine não carregou. Verifique o arquivo books.js.');
                }

                const rec = await window.BooksEngine.recommendBook(answers);
                if (!rec || !rec.book) {
                    resultBox.innerHTML = `
                        <h4>📚 Nenhum livro encontrado</h4>
                        <p class="status-message">Não encontramos títulos compatíveis agora. Tente refazer o quiz.</p>
                        <button type="button" id="restartQuizBtn" class="primary-btn">Refazer Quiz</button>
                    `;
                    return;
                }

                let reviewPack = {
                    readerRating: { available: false },
                    readerReview: { available: false, note: 'Nenhuma resenha de leitor disponível.' },
                    editorialReview: { available: false, note: 'Nenhuma crítica editorial disponível.' }
                };

                if (window.ReviewsService && typeof window.ReviewsService.getReviewsForBook === 'function') {
                    try {
                        reviewPack = await window.ReviewsService.getReviewsForBook(rec.book);
                    } catch (_) {
                        // Mantém recomendação mesmo se resenhas falharem
                    }
                }

                resultBox.innerHTML = renderFullRecommendation(rec.book, rec.profile, reviewPack);
            } catch (err) {
                resultBox.innerHTML = `
                    <h4>⚠️ Falha ao buscar recomendação</h4>
                    <p class="status-message">${escapeHtml(err && err.message ? err.message : 'Erro desconhecido.')}</p>
                    <button type="button" id="restartQuizBtn" class="primary-btn">Tentar Novamente</button>
                `;
            } finally {
                busy = false;
            }
        }

        // Listener global no document para garantir captura de qualquer botão do quiz
        document.addEventListener('click', (event) => {
            const optionBtn = event.target.closest('.genio-option');
            if (optionBtn && form.contains(optionBtn)) {
                event.preventDefault();
                if (busy) return;
                busy = true;

                const group = optionBtn.closest('.quiz-question-group');
                const qKey = (group && group.getAttribute('data-question')) || `q${stepIndex + 1}`;

                if (group) {
                    group.querySelectorAll('.genio-option').forEach((b) => b.classList.remove('selected'));
                }
                optionBtn.classList.add('selected');

                answers[qKey] = {
                    genero: optionBtn.getAttribute('data-genre'),
                    ritmo: optionBtn.getAttribute('data-ritmo'),
                    complexidade: optionBtn.getAttribute('data-complexidade'),
                    tema: optionBtn.getAttribute('data-tema'),
                    epoca: optionBtn.getAttribute('data-epoca')
                };

                setTimeout(() => {
                    if (stepIndex < steps.length - 1) {
                        stepIndex += 1;
                        renderStep();
                    } else {
                        runRecommendation();
                    }
                }, 140);
                return;
            }

            if (event.target.closest('#prevBtn')) {
                event.preventDefault();
                if (busy) return;
                if (stepIndex > 0) {
                    stepIndex -= 1;
                    renderStep();
                }
                return;
            }

            if (event.target.closest('#restartQuizBtn')) {
                event.preventDefault();
                Object.keys(answers).forEach((k) => delete answers[k]);
                form.querySelectorAll('.genio-option').forEach((b) => b.classList.remove('selected'));
                resultBox.classList.add('hidden');
                resultBox.innerHTML = '';
                form.classList.remove('hidden');
                if (progressBox) progressBox.classList.remove('hidden');
                stepIndex = 0;
                renderStep();
            }
        });

        renderStep();
    }

    window.addEventListener('error', (ev) => {
        showDebugBanner(`Erro de script: ${ev.message || 'falha ao carregar JS'} (${ev.filename || ''})`);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootQuiz);
    } else {
        bootQuiz();
    }
})();