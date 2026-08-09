(function () {
  var STORAGE_KEY = 'vailo-marketing-locale';
  var DEFAULT_LOCALE = 'el';
  var SUPPORTED = ['el', 'en'];
  var SITE_BASE = 'https://vailo.app/';
  var OG_IMAGE = SITE_BASE + 'guest-portal-mockup.png';

  function detectLocale() {
    var params = new URLSearchParams(window.location.search);
    var fromQuery = (params.get('lang') || '').toLowerCase();
    if (SUPPORTED.indexOf(fromQuery) !== -1) return fromQuery;
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
    } catch (e) { /* ignore */ }
    return DEFAULT_LOCALE;
  }

  function get(dict, key) {
    if (!dict || !key) return '';
    var parts = key.split('.');
    var cur = dict;
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== 'object') return '';
      cur = cur[parts[i]];
    }
    return typeof cur === 'string' ? cur : '';
  }

  function pageUrl(locale) {
    return locale === 'en' ? SITE_BASE + '?lang=en' : SITE_BASE;
  }

  function setMetaAttr(selector, attr, value) {
    if (!value) return;
    var el = document.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  }

  function buildStructuredData(dict, locale) {
    var url = pageUrl(locale);
    var faq = [];
    for (var i = 1; i <= 5; i++) {
      var q = get(dict, 'faq.q' + i);
      var a = get(dict, 'faq.a' + i);
      if (q && a) {
        faq.push({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a }
        });
      }
    }

    var features = get(dict, 'seo.features');
    var featureList = features ? features.split(',').map(function (s) { return s.trim(); }) : [];

    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': SITE_BASE + '#organization',
          name: 'Vailo',
          url: SITE_BASE,
          logo: {
            '@type': 'ImageObject',
            url: SITE_BASE + 'vailoLogo.png',
            width: 512,
            height: 512
          },
          email: 'info@vailo.app',
          areaServed: [
            { '@type': 'Country', name: 'Greece' },
            { '@type': 'Country', name: 'Cyprus' }
          ],
          knowsLanguage: ['el', 'en']
        },
        {
          '@type': 'WebSite',
          '@id': SITE_BASE + '#website',
          url: SITE_BASE,
          name: 'Vailo',
          description: get(dict, 'meta.description'),
          inLanguage: locale === 'el' ? 'el-GR' : 'en',
          publisher: { '@id': SITE_BASE + '#organization' }
        },
        {
          '@type': 'SoftwareApplication',
          '@id': SITE_BASE + '#software',
          name: 'Vailo',
          applicationCategory: 'BusinessApplication',
          applicationSubCategory: get(dict, 'seo.appCategory'),
          operatingSystem: 'Web browser',
          description: get(dict, 'seo.appDescription'),
          url: url,
          image: OG_IMAGE,
          inLanguage: locale === 'el' ? 'el-GR' : 'en',
          featureList: featureList,
          offers: {
            '@type': 'Offer',
            availability: 'https://schema.org/OnlineOnly'
          },
          provider: { '@id': SITE_BASE + '#organization' }
        },
        {
          '@type': 'FAQPage',
          '@id': url + '#faq',
          url: url + '#faq',
          inLanguage: locale === 'el' ? 'el-GR' : 'en',
          mainEntity: faq
        }
      ]
    };
  }

  function applySeo(dict, locale) {
    var url = pageUrl(locale);
    var title = get(dict, 'meta.title');
    var description = get(dict, 'meta.description');
    var ogTitle = get(dict, 'meta.ogTitle') || title;
    var ogDescription = get(dict, 'meta.ogDescription') || description;
    var keywords = get(dict, 'meta.keywords');

    if (title) document.title = title;

    setMetaAttr('meta[data-i18n-desc]', 'content', description);
    setMetaAttr('meta[data-i18n-keywords]', 'content', keywords);
    setMetaAttr('link[rel="canonical"]', 'href', url);
    setMetaAttr('meta[property="og:url"]', 'content', url);
    setMetaAttr('meta[property="og:title"]', 'content', ogTitle);
    setMetaAttr('meta[property="og:description"]', 'content', ogDescription);
    setMetaAttr('meta[property="og:locale"]', 'content', locale === 'el' ? 'el_GR' : 'en_US');
    setMetaAttr('meta[property="og:locale:alternate"]', 'content', locale === 'el' ? 'en_US' : 'el_GR');
    setMetaAttr('meta[name="twitter:title"]', 'content', ogTitle);
    setMetaAttr('meta[name="twitter:description"]', 'content', ogDescription);

    var ld = document.getElementById('structured-data');
    if (ld) {
      ld.textContent = JSON.stringify(buildStructuredData(dict, locale));
    }
  }

  function applyTranslations(dict, locale) {
    document.documentElement.lang = locale === 'el' ? 'el' : 'en';

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var val = get(dict, el.getAttribute('data-i18n'));
      if (val) el.textContent = val;
    });

    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var val = get(dict, el.getAttribute('data-i18n-html'));
      if (val) el.innerHTML = val;
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var val = get(dict, el.getAttribute('data-i18n-placeholder'));
      if (val) el.setAttribute('placeholder', val);
    });

    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var val = get(dict, el.getAttribute('data-i18n-aria'));
      if (val) el.setAttribute('aria-label', val);
    });

    document.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
      var val = get(dict, el.getAttribute('data-i18n-alt'));
      if (val) el.setAttribute('alt', val);
    });

    applySeo(dict, locale);

    document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
      var code = btn.getAttribute('data-set-lang');
      btn.classList.toggle('active', code === locale);
      btn.setAttribute('aria-pressed', code === locale ? 'true' : 'false');
    });

    window.__vailoMarketingI18n = dict;
    window.__vailoMarketingLocale = locale;
  }

  function setLocale(locale) {
    if (SUPPORTED.indexOf(locale) === -1) locale = DEFAULT_LOCALE;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch (e) { /* ignore */ }
    return fetch('/website/i18n/' + locale + '.json')
      .then(function (res) {
        if (!res.ok) throw new Error('Locale load failed');
        return res.json();
      })
      .then(function (dict) {
        applyTranslations(dict, locale);
      });
  }

  var initialLocale = detectLocale();

  document.addEventListener('DOMContentLoaded', function () {
    setLocale(initialLocale).catch(function () {
      if (initialLocale !== DEFAULT_LOCALE) setLocale(DEFAULT_LOCALE);
    });

    document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-set-lang');
        if (next && next !== window.__vailoMarketingLocale) {
          setLocale(next);
        }
      });
    });
  });

  window.vailoSetMarketingLocale = setLocale;
  window.vailoMarketingT = function (key) {
    return get(window.__vailoMarketingI18n, key);
  };
})();
