// ============================================
// МОДУЛЬ СРАВНЕНИЯ ТОВАРОВ ДЛЯ TILDA
// Универсальная версия с автоопределением стилей
// ============================================

(function() {
    'use strict';

    const CONFIG = {
        maxProducts: 6,
        storageKey: 'tilda_comparison_products',
        showOnlyDifferences: true,
        debug: false
    };

    // Поддержка внешней конфигурации
    if (window.TildaComparisonConfig) {
        Object.assign(CONFIG, window.TildaComparisonConfig);
    }

    function log(message, data = null) {
        if (CONFIG.debug) console.log(`[Comparison Module] ${message}`, data || '');
    }

    // ═══════════════════════════════════════════════════════════════
    // АВТООПРЕДЕЛЕНИЕ СТИЛЕЙ САЙТА
    // Считывает стили кнопок и текста Тильды и применяет к модулю
    // ═══════════════════════════════════════════════════════════════
    function detectSiteStyles() {
        const root = document.documentElement;
        const styles = {};
        
        // 1. Ищем стандартную кнопку Тильды
        const tildaBtn = document.querySelector('.t-btn, .t-submit, [class*="t-btn"]');
        if (tildaBtn) {
            const computed = getComputedStyle(tildaBtn);
            // Берём цвет фона кнопки (если он не прозрачный)
            const bgColor = computed.backgroundColor;
            if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                styles['--cmp-primary'] = bgColor;
            }
            // Скругление
            const radius = computed.borderRadius;
            if (radius && radius !== '0px') {
                styles['--cmp-radius'] = radius;
            }
            // Шрифт
            const font = computed.fontFamily;
            if (font) {
                styles['--cmp-font'] = font;
            }
            // Цвет текста на кнопке (для акцента)
            const btnTextColor = computed.color;
            if (btnTextColor) {
                styles['--cmp-accent'] = btnTextColor;
            }
        }
        
        // 2. Ищем заголовок для цвета текста
        const title = document.querySelector('.t-title, h1, h2, .t-name');
        if (title) {
            const computed = getComputedStyle(title);
            const textColor = computed.color;
            if (textColor && textColor !== 'rgb(0, 0, 0)') {
                styles['--cmp-text'] = textColor;
            }
            if (!styles['--cmp-font']) {
                styles['--cmp-font'] = computed.fontFamily;
            }
        }
        
        // 3. Применяем только если пользователь не задал свои значения
        for (const [prop, value] of Object.entries(styles)) {
            const current = getComputedStyle(root).getPropertyValue(prop).trim();
            // Если переменная не задана или равна 'inherit' — применяем найденное значение
            if (!current || current === 'inherit') {
                root.style.setProperty(prop, value);
                log(`Автоопределено: ${prop} = ${value}`);
            }
        }
    }

    function normalizeString(str) {
        if (str === undefined || str === null) return '';
        return String(str).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[\r\n\t]+/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+$/g, '');
    }

    function formatPrice(price) {
        if (price === undefined || price === null) return '—';
        const str = String(price).trim();
        if (str === '' || str === '—') return '—';
        if (/[₽$€£¥]/.test(str)) return str;
        return str + ' ₽';
    }

    class ComparisonModule {
        constructor() {
            this.products = this.loadFromStorage();
            this.processedCards = new Set();
            this.init();
        }

        init() {
            log('Инициализация модуля сравнения');
            // Автоопределяем стили сайта
            detectSiteStyles();

            this.waitForProductCards().then(() => {
                log('Карточки товаров найдены, добавляем кнопки');
                this.addCompareButtons();
                this.createFloatingButton();
                this.setupEventListeners();
                this.setupMutationObserver();
            }).catch(error => {
                log('Ошибка при поиске карточек:', error);
                setTimeout(() => {
                    this.addCompareButtons();
                    this.createFloatingButton();
                }, 2000);
            });

            const comparisonContainer = document.querySelector('.comparison-page-container');
            if (comparisonContainer) {
                this.renderComparisonTable(comparisonContainer);
            }
        }

        waitForProductCards() {
            return new Promise((resolve, reject) => {
                let attempts = 0;
                const maxAttempts = 50;
                const checkCards = () => {
                    const cards = this.findProductCards();
                    if (cards.length > 0) resolve(cards);
                    else if (attempts < maxAttempts) { attempts++; setTimeout(checkCards, 200); }
                    else reject(new Error('Карточки товаров не найдены'));
                };
                checkCards();
            });
        }

        findProductCards() {
            const selectors = ['.t-store__card', '.t-catalog__card', '[class*="store__card"]', '[class*="catalog__card"]', '.t758__card', '.t706__card', '.t739__card', '.t803__card', '.t804__card', '[data-product-id]', '.js-store-prod-card', '.js-catalog-prod-card'];
            let cards = [];
            for (const selector of selectors) {
                const found = document.querySelectorAll(selector);
                if (found.length > 0) { cards = Array.from(found); break; }
            }
            if (cards.length === 0) {
                const allCards = document.querySelectorAll('[class*="card"]');
                cards = Array.from(allCards).filter(card => card.querySelector('img') && (card.querySelector('[class*="price"]') || card.querySelector('[class*="name"]') || card.querySelector('[class*="title"]')));
            }
            return cards;
        }

        forceLoadLazyImages() {
            const lazyImages = document.querySelectorAll('img[data-src], img[data-lazy], img[data-original]');
            lazyImages.forEach(img => {
                const src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('data-original');
                if (src && !img.getAttribute('src')) img.setAttribute('src', src);
            });
            window.dispatchEvent(new Event('scroll'));
        }

        extractImage(card) {
            let image = '';
            const allImages = card.querySelectorAll('img');
            for (const img of allImages) {
                image = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy') || img.getAttribute('data-bgimg') || img.getAttribute('data-img') || img.getAttribute('data-url');
                if (image && !image.includes('data:image') && !image.includes('placeholder')) break;
                image = '';
            }
            if (!image) {
                const elementsWithBg = card.querySelectorAll('[style*="background"]');
                for (const el of elementsWithBg) {
                    const style = el.getAttribute('style') || '';
                    const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
                    if (match && match[1]) { image = match[1]; break; }
                }
            }
            if (!image) {
                const bgElements = card.querySelectorAll('[data-bgimg], [data-bg-img], [data-image]');
                for (const el of bgElements) {
                    image = el.getAttribute('data-bgimg') || el.getAttribute('data-bg-img') || el.getAttribute('data-image');
                    if (image) break;
                }
            }
            if (!image) {
                const imgContainers = card.querySelectorAll('[class*="img"], [class*="image"], [class*="photo"], [class*="pic"]');
                for (const container of imgContainers) {
                    const style = container.getAttribute('style') || '';
                    const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
                    if (match && match[1]) { image = match[1]; break; }
                    const nestedImg = container.querySelector('img');
                    if (nestedImg) { image = nestedImg.getAttribute('src') || nestedImg.getAttribute('data-src'); if (image) break; }
                }
            }
            if (!image) {
                const anyImg = card.querySelector('img[src]:not([src=""]):not([src*="data:image"])');
                if (anyImg) image = anyImg.getAttribute('src');
            }
            if (image) image = image.replace(/\?.*$/, '').replace(/\/thumbnails\/.*$/, '');
            return image;
        }

        findOrderButtonInCard(card) {
            const selectors = ['.js-store-prod-addtocart', '.js-product-btn-addtocart', '.js-store-prod-btn-addtocart', '[data-button-product-addtocart]', '[data-btn-action="addtocart"]', '[data-btn-action="order"]', '.t-store__card__btn-addtocart', '.t-store__card__btn', '.t-catalog__card__btn', '.t758__btn', '.t706__btn', '.t739__btn', '.t803__btn', '.t804__btn', 'button[class*="addtocart" i]', 'button[class*="add-to-cart" i]', 'button[class*="order" i]', 'a[class*="addtocart" i]', 'a[class*="add-to-cart" i]', 'a[class*="order" i]', 'a[href="#order"]', 'a[href*="#order"]', 'button[data-product-id]', 'a[data-product-id]'];
            for (const selector of selectors) {
                try { const btn = card.querySelector(selector); if (btn) return btn; } catch (e) {}
            }
            return null;
        }

        extractOrderButtonData(button) {
            if (!button) return null;
            const data = { outerHTML: button.outerHTML, href: button.getAttribute('href') || '', dataset: {}, productId: button.getAttribute('data-product-id') || button.getAttribute('data-product-uid') || button.getAttribute('data-uid') || '', variationId: button.getAttribute('data-variation-id') || button.getAttribute('data-product-variation-id') || '' };
            for (const key in button.dataset) data.dataset[key] = button.dataset[key];
            return data;
        }

        addCompareButtons() {
            this.forceLoadLazyImages();
            const cards = this.findProductCards();
            cards.forEach((card, index) => {
                const cardId = card.getAttribute('data-product-id') || card.getAttribute('data-uid') || `card-${index}`;
                if (this.processedCards.has(cardId + '-compare')) return;
                if (card.querySelector('.comparison-btn')) { this.processedCards.add(cardId + '-compare'); return; }
                const productData = this.extractProductData(card);
                if (!productData) return;
                const btn = document.createElement('button');
                btn.className = 'comparison-btn';
                btn.type = 'button';
                btn.title = 'Добавить к сравнению';
                btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 20.25L4.5 3.75M9.5 20.25L9.5 9.25M14.5 20.2495L14.5 3.75003M19.5 20.2495L19.5 12.25" stroke="currentColor" stroke-width="1.75" stroke-linecap="square"/></svg>`;
                btn.dataset.productUid = productData.uid;
                if (this.products.find(p => p.uid === productData.uid)) btn.classList.add('active');
                const computedStyle = window.getComputedStyle(card);
                if (computedStyle.position === 'static') card.style.position = 'relative';
                card.appendChild(btn);
                this.processedCards.add(cardId + '-compare');
            });
        }

        extractProductData(card) {
            try {
                const titleSelectors = ['.js-store-prod-name', '.t-store__card__title', '[class*="prod-name"]', '[class*="card__title"]', '[class*="name"]', 'a[class*="title"]', '.t758__title', '.t706__title'];
                let title = '';
                for (const selector of titleSelectors) { const el = card.querySelector(selector); if (el && el.textContent.trim()) { title = el.textContent.trim(); break; } }
                const priceSelectors = ['.js-store-prod-price', '.t-store__card__price', '[class*="prod-price"]', '[class*="card__price"]', '[class*="price"]', '.t758__price', '.t706__price'];
                let price = '';
                for (const selector of priceSelectors) { const el = card.querySelector(selector); if (el && el.textContent.trim()) { price = el.textContent.trim(); break; } }
                const image = this.extractImage(card);
                const descriptionSelectors = ['.js-store-prod-descr', '.t-store__card__descr', '[class*="descr"]', '[class*="description"]', '.t758__descr', '.t706__descr'];
                let description = '';
                for (const selector of descriptionSelectors) { const el = card.querySelector(selector); if (el && el.textContent.trim()) { description = el.textContent.trim(); break; } }
                const linkSelectors = ['a[href*="/tproduct/"]', 'a[href*="product"]', 'a[class*="link"]', 'a'];
                let url = '';
                for (const selector of linkSelectors) { const el = card.querySelector(selector); if (el && el.href) { url = el.href; break; } }
                let uid = '';
                const uidSelectors = ['data-product-id', 'data-uid', 'data-product-uid', 'data-record-id'];
                for (const attr of uidSelectors) { const value = card.getAttribute(attr) || card.querySelector(`[${attr}]`)?.getAttribute(attr); if (value) { uid = value; break; } }
                if (!uid && url) { const match = url.match(/-(\d+)(?:\?|$)/) || url.match(/\/(\d+)(?:\?|$)/); if (match) uid = match[1]; }
                if (!uid && title) uid = 'gen-' + title.toLowerCase().replace(/[^a-z0-9а-я]/gi, '_').substring(0, 20);
                const characteristics = this.extractCharacteristics(card);
                const orderButton = this.findOrderButtonInCard(card);
                const orderButtonData = this.extractOrderButtonData(orderButton);
                if (!title) return null;
                return { uid, title, price, image, url, description, characteristics, orderButtonData };
            } catch (e) { log('Ошибка извлечения данных товара:', e); return null; }
        }

        extractCharacteristics(card) {
            const characteristics = {};
            const charSelectors = ['.js-store-prod-all-charcs', '.js-catalog-prod-all-charcs', '[class*="charcs"]', '[class*="characteristics"]', '[class*="specs"]', '[class*="features"]', '.t-store__card__chars', '.t758__chars', '.t706__chars'];
            for (const selector of charSelectors) {
                const charsContainer = card.querySelector(selector);
                if (charsContainer) {
                    charsContainer.querySelectorAll('p').forEach(p => { const text = p.textContent.trim(); const parts = text.split(':'); if (parts.length >= 2) characteristics[parts[0].trim()] = parts.slice(1).join(':').trim(); });
                    charsContainer.querySelectorAll('[class*="char"], [class*="item"], tr').forEach(item => { const spans = item.querySelectorAll('span, td'); if (spans.length >= 2) { const key = spans[0].textContent.trim(); const value = spans[1].textContent.trim(); if (key && value) characteristics[key] = value; } });
                    charsContainer.querySelectorAll('dt').forEach(dt => { const dd = dt.nextElementSibling; if (dd && dd.tagName === 'DD') characteristics[dt.textContent.trim()] = dd.textContent.trim(); });
                    if (Object.keys(characteristics).length > 0) break;
                }
            }
            if (Object.keys(characteristics).length === 0) {
                card.querySelectorAll('[data-char-name], [data-spec-name]').forEach(el => { const name = el.getAttribute('data-char-name') || el.getAttribute('data-spec-name'); const value = el.textContent.trim() || el.getAttribute('data-char-value') || el.getAttribute('data-spec-value'); if (name && value) characteristics[name] = value; });
                card.querySelectorAll('table').forEach(table => { table.querySelectorAll('tr').forEach(row => { const cells = row.querySelectorAll('td, th'); if (cells.length >= 2) { const key = cells[0].textContent.trim(); const value = cells[1].textContent.trim(); if (key && value && !key.includes('Цена')) characteristics[key] = value; } }); });
                card.querySelectorAll('ul, ol').forEach(list => { list.querySelectorAll('li').forEach(item => { const text = item.textContent.trim(); const parts = text.split(':'); if (parts.length >= 2) characteristics[parts[0].trim()] = parts.slice(1).join(':').trim(); } }); });
            }
            return characteristics;
        }

        findCardByUid(uid) {
            const cards = this.findProductCards();
            for (const card of cards) {
                const cardUid = card.getAttribute('data-product-id') || card.getAttribute('data-uid') || card.getAttribute('data-product-uid') || card.getAttribute('data-record-id');
                if (cardUid === uid) return card;
                const link = card.querySelector('a[href*="/tproduct/"]');
                if (link) { const match = link.href.match(/-(\d+)(?:\?|$)/) || link.href.match(/\/(\d+)(?:\?|$)/); if (match && match[1] === uid) return card; }
            }
            return null;
        }

        addToCartFromPopup(btn) {
            const uid = btn.dataset.uid;
            const title = btn.dataset.title || '';
            const url = btn.dataset.url || '';
            const product = this.products.find(p => p.uid === uid);
            if (!product) { this.showNotification('Товар не найден', 'error'); return; }
            const cardOnPage = this.findCardByUid(uid);
            if (cardOnPage) {
                const orderBtn = this.findOrderButtonInCard(cardOnPage);
                if (orderBtn) { orderBtn.click(); this.animateCartButtonInPopup(btn); this.showNotification(`"${title}" — открытие формы заказа`, 'success'); return; }
            }
            if (product.orderButtonData && product.orderButtonData.outerHTML) {
                try {
                    const tempContainer = document.createElement('div');
                    tempContainer.innerHTML = product.orderButtonData.outerHTML;
                    tempContainer.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
                    document.body.appendChild(tempContainer);
                    tempContainer.firstElementChild.click();
                    this.animateCartButtonInPopup(btn);
                    this.showNotification(`"${title}" — открытие формы заказа`, 'success');
                    setTimeout(() => tempContainer.parentNode?.removeChild(tempContainer), 1000);
                    return;
                } catch (e) { log('Ошибка временной кнопки:', e); }
            }
            let apiUsed = false;
            if (window.TildaCommerce?.addProductToCart) { try { window.TildaCommerce.addProductToCart(uid, 1, product.orderButtonData?.variationId || ''); apiUsed = true; } catch (e) {} }
            if (!apiUsed && window.tcart?.add) { try { window.tcart.add({ productUid: uid, quantity: 1 }); apiUsed = true; } catch (e) {} }
            if (!apiUsed && window.TildaShoppingCart?.add) { try { window.TildaShoppingCart.add(uid, 1); apiUsed = true; } catch (e) {} }
            if (!apiUsed && typeof jQuery !== 'undefined') { try { jQuery(document).trigger('addProductToCart', { productId: uid, quantity: 1 }); apiUsed = true; } catch (e) {} }
            if (apiUsed) { this.animateCartButtonInPopup(btn); this.showNotification(`"${title}" добавлен в корзину`, 'success'); return; }
            if (url) { window.open(url, '_blank'); this.showNotification(`Откройте "${title}" для оформления заказа`, 'info'); return; }
            this.showNotification('Не удалось добавить товар в корзину', 'error');
        }

        animateCartButtonInPopup(btn) {
            const originalHTML = btn.innerHTML;
            btn.classList.add('added');
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="round"/></svg><span>Добавлено</span>`;
            setTimeout(() => { btn.classList.remove('added'); btn.innerHTML = originalHTML; }, 2000);
        }

        setupMutationObserver() {
            const observer = new MutationObserver((mutations) => {
                let hasNewCards = false;
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.classList && (node.classList.contains('t-store__card') || node.classList.contains('t-catalog__card') || node.querySelector('.t-store__card, .t-catalog__card'))) hasNewCards = true;
                    });
                });
                if (hasNewCards) setTimeout(() => this.addCompareButtons(), 100);
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        createFloatingButton() {
            if (document.querySelector('.comparison-floating-btn')) return;
            const floatingBtn = document.createElement('div');
            floatingBtn.className = 'comparison-floating-btn';
            floatingBtn.innerHTML = `<div class="comparison-floating-btn__content"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 20.25L4.5 3.75M9.5 20.25L9.5 9.25M14.5 20.2495L14.5 3.75003M19.5 20.2495L19.5 12.25" stroke="currentColor" stroke-width="1.75" stroke-linecap="square"/></svg><span class="comparison-count">${this.products.length}</span></div><div class="comparison-floating-btn__tooltip">Перейти к сравнению (${this.products.length})</div>`;
            floatingBtn.addEventListener('click', () => {
                if (this.products.length === 0) { this.showNotification('Добавьте товары для сравнения', 'warning'); return; }
                this.showComparisonPopup();
            });
            document.body.appendChild(floatingBtn);
            if (this.products.length === 0) floatingBtn.classList.add('hidden');
        }

        setupEventListeners() {
            document.body.addEventListener('click', (e) => {
                const compareBtn = e.target.closest('.comparison-btn');
                if (compareBtn) { e.preventDefault(); e.stopPropagation(); this.toggleProduct(compareBtn); return; }
                const removeBtn = e.target.closest('.comparison-table__remove');
                if (removeBtn) { e.preventDefault(); e.stopPropagation(); this.removeProductFromPopup(removeBtn.dataset.uid); return; }
                const cartBtn = e.target.closest('.comparison-table__add-to-cart');
                if (cartBtn) { e.preventDefault(); e.stopPropagation(); this.addToCartFromPopup(cartBtn); return; }
            });
            window.addEventListener('storage', (e) => {
                if (e.key === CONFIG.storageKey) { this.products = this.loadFromStorage(); this.updateFloatingButton(); }
            });
        }

        toggleProduct(btn) {
            const uid = btn.dataset.productUid;
            const existingIndex = this.products.findIndex(p => p.uid === uid);
            if (existingIndex > -1) {
                this.products.splice(existingIndex, 1);
                btn.classList.remove('active');
                this.showNotification('Товар удален из сравнения', 'info');
            } else {
                if (this.products.length >= CONFIG.maxProducts) { this.showNotification(`Максимум ${CONFIG.maxProducts} товаров для сравнения`, 'error'); return; }
                const card = btn.closest('.t-store__card, .t-catalog__card, [class*="card"]');
                const productData = this.extractProductData(card);
                if (productData) { this.products.push(productData); btn.classList.add('active'); this.showNotification('Товар добавлен к сравнению', 'success'); }
            }
            this.saveToStorage();
            this.updateFloatingButton();
        }

        removeProductFromPopup(uid) {
            this.products = this.products.filter(p => p.uid !== uid);
            this.saveToStorage();
            this.updateAllButtons();
            this.updateFloatingButton();
            const popup = document.querySelector('.comparison-popup');
            const page = document.querySelector('.comparison-page');
            const container = popup || page;
            if (container) {
                const body = container.querySelector('.comparison-popup__body, .comparison-page__content');
                if (body) body.innerHTML = this.generateComparisonHTML();
                if (this.products.length === 0 && popup) { popup.remove(); this.showNotification('Сравнение очищено', 'info'); }
            }
        }

        updateFloatingButton() {
            const floatingBtn = document.querySelector('.comparison-floating-btn');
            if (floatingBtn) {
                const countEl = floatingBtn.querySelector('.comparison-count');
                const tooltipEl = floatingBtn.querySelector('.comparison-floating-btn__tooltip');
                if (countEl) countEl.textContent = this.products.length;
                if (tooltipEl) tooltipEl.textContent = `Перейти к сравнению (${this.products.length})`;
                floatingBtn.classList.toggle('hidden', this.products.length === 0);
            }
        }

        loadFromStorage() { try { const data = localStorage.getItem(CONFIG.storageKey); return data ? JSON.parse(data) : []; } catch (e) { return []; } }
        saveToStorage() { try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(this.products)); } catch (e) { log('Ошибка сохранения:', e); } }

        showNotification(message, type = 'info') {
            const notification = document.createElement('div');
            notification.className = `comparison-notification comparison-notification--${type}`;
            notification.textContent = message;
            document.body.appendChild(notification);
            setTimeout(() => notification.classList.add('show'), 10;
            setTimeout(() => { notification.classList.remove('show'); setTimeout(() => notification.remove(), 300); }, 3000);
        }

        showComparisonPopup() { this.renderComparisonPopup(); }

        renderComparisonPopup() {
            const existingPopup = document.querySelector('.comparison-popup');
            if (existingPopup) existingPopup.remove();
            const popup = document.createElement('div');
            popup.className = 'comparison-popup';
            popup.innerHTML = `<div class="comparison-popup__overlay"></div><div class="comparison-popup__content"><div class="comparison-popup__header"><h2>Сравнение товаров</h2><button class="comparison-popup__close">&times;</button></div><div class="comparison-popup__body">${this.generateComparisonHTML()}</div><div class="comparison-popup__footer"><label class="comparison-popup__toggle"><input type="checkbox" id="showOnlyDifferences" ${CONFIG.showOnlyDifferences ? 'checked' : ''}><span>Показывать только различия</span></label><button class="comparison-popup__clear">Очистить все</button></div></div>`;
            document.body.appendChild(popup);
            this.setupPopupEvents(popup);
        }

        generateComparisonHTML() {
            if (this.products.length === 0) return '<div class="comparison-empty">Нет товаров для сравнения</div>';
            const allKeys = new Set();
            this.products.forEach(product => { if (product.characteristics) Object.keys(product.characteristics).forEach(key => allKeys.add(key)); });
            let keysToShow = Array.from(allKeys);
            if (CONFIG.showOnlyDifferences && this.products.length > 1) {
                keysToShow = keysToShow.filter(key => {
                    const normalizedValues = this.products.map(p => { const raw = p.characteristics ? p.characteristics[key] : undefined; return normalizeString(raw); });
                    const nonEmpty = normalizedValues.filter(v => v !== '');
                    if (nonEmpty.length === 0) return false;
                    return new Set(nonEmpty).size > 1;
                });
            }
            let html = '<div class="comparison-table-wrapper"><table class="comparison-table"><thead><tr><th class="comparison-table__label">Товар</th>';
            this.products.forEach(product => {
                const safeTitle = (product.title || '').replace(/"/g, '&quot;');
                const safeUrl = (product.url || '').replace(/"/g, '&quot;');
                html += `<th class="comparison-table__product"><div class="comparison-table__product-image">${product.image ? `<img src="${product.image}" alt="${safeTitle}">` : '<div class="no-image">Нет фото</div>'}</div><div class="comparison-table__product-title">${product.title}</div>${product.description ? `<div class="comparison-table__product-descr">${product.description}</div>` : ''}<div class="comparison-table__product-price">${formatPrice(product.price)}</div><div class="comparison-table__product-actions"><button class="comparison-table__add-to-cart" data-uid="${product.uid}" data-title="${safeTitle}" data-url="${safeUrl}" title="Добавить в корзину"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 3H5L5.4 5M7 13H17L21 5H5.4M7 13L5.4 5M7 13L4.70711 15.2929C4.07714 15.9229 4.52331 17 5.41421 17H17M17 17C15.8954 17 15 17.8954 15 19C15 20.1046 15.8954 21 17 21C18.1046 21 19 20.1046 19 19C19 17.8954 18.1046 17 17 17ZM9 19C9 20.1046 8.10457 21 7 21C5.89543 21 5 20.1046 5 19C5 17.8954 5.89543 17 7 17C8.10457 17 9 17.8954 9 19Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="round"/></svg><span>В корзину</span></button><button class="comparison-table__remove" data-uid="${product.uid}" title="Удалить из сравнения"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6H5H21" stroke="currentColor" stroke-width="1.75" stroke-linecap="square"/><path d="M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6M19 6V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20V6H19Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="square"/></svg><span>Удалить</span></button></div></th>`;
            });
            html += '</tr></thead><tbody><tr><td class="comparison-table__char-name">Цена</td>';
            this.products.forEach(product => { html += `<td class="comparison-table__char-value">${formatPrice(product.price)}</td>`; });
            html += '</tr>';
            keysToShow.forEach(key => {
                html += '<tr><td class="comparison-table__char-name">' + key + '</td>';
                this.products.forEach(product => {
                    const raw = product.characteristics ? product.characteristics[key] : undefined;
                    const displayValue = normalizeString(raw) === '' ? '—' : raw;
                    html += `<td class="comparison-table__char-value">${displayValue}</td>`;
                });
                html += '</tr>';
            });
            html += '</tbody></table></div>';
            return html;
        }

        setupPopupEvents(popup) {
            popup.querySelector('.comparison-popup__close').addEventListener('click', () => popup.remove());
            popup.querySelector('.comparison-popup__overlay').addEventListener('click', () => popup.remove());
            const toggle = popup.querySelector('#showOnlyDifferences');
            if (toggle) {
                toggle.addEventListener('change', (e) => {
                    CONFIG.showOnlyDifferences = e.target.checked;
                    const body = popup.querySelector('.comparison-popup__body');
                    if (body) body.innerHTML = this.generateComparisonHTML();
                });
            }
            popup.querySelector('.comparison-popup__clear').addEventListener('click', () => {
                if (confirm('Удалить все товары из сравнения?')) {
                    this.products = [];
                    this.saveToStorage();
                    this.updateAllButtons();
                    this.updateFloatingButton();
                    popup.remove();
                    this.showNotification('Сравнение очищено', 'info');
                }
            });
        }

        updateAllButtons() {
            document.querySelectorAll('.comparison-btn').forEach(btn => {
                const uid = btn.dataset.productUid;
                const isInComparison = this.products.find(p => p.uid === uid);
                btn.classList.toggle('active', !!isInComparison);
            });
        }

        renderComparisonTable(container = null) {
            if (!container) {
                container = document.createElement('div');
                container.className = 'comparison-page';
                const mainContent = document.querySelector('.t-records, main, #allrecords') || document.body;
                mainContent.insertBefore(container, mainContent.firstChild);
            }
            container.innerHTML = `<div class="comparison-page__header"><h1>Сравнение товаров</h1><label class="comparison-popup__toggle"><input type="checkbox" id="showOnlyDifferencesPage" ${CONFIG.showOnlyDifferences ? 'checked' : ''}><span>Показывать только различия</span></label></div><div class="comparison-page__content">${this.generateComparisonHTML()}</div>`;
            const toggle = container.querySelector('#showOnlyDifferencesPage');
            if (toggle) {
                toggle.addEventListener('change', (e) => {
                    CONFIG.showOnlyDifferences = e.target.checked;
                    const content = container.querySelector('.comparison-page__content');
                    if (content) content.innerHTML = this.generateComparisonHTML();
                });
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new ComparisonModule());
    } else {
        new ComparisonModule();
    }

    window.TildaComparison = {
        clear: () => { localStorage.removeItem(CONFIG.storageKey); location.reload(); },
        getProducts: () => { try { return JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]'); } catch (e) { return []; } }
    };

})();
