/**
 * Agrivia site script: hash navigation and illustrative calculator.
 */

const HOME_SECTIONS = {
    features: 'features',
    calculator: 'calculator',
    blog: 'blog',
    download: 'download-section',
};

const STANDALONE_PAGES = {
    about: 'about.html',
    privacy: 'privacy.html',
    terms: 'terms.html',
    'affiliate-disclosure': 'affiliate-disclosure.html',
    contact: 'contact.html',
};

// Initialize Page Navigation
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('appContainer')) {
        handleHashRouting();
        window.addEventListener('hashchange', handleHashRouting);
        updateROICalculation();
    }
    checkCookieConsent();
    updateContactMailtoLinks();
});

// SPA Hash Navigation Handler
function navigateTo(viewId, targetElementId = null) {
    if (STANDALONE_PAGES[viewId]) {
        window.location.href = STANDALONE_PAGES[viewId];
        return;
    }

    if (HOME_SECTIONS[viewId] && !document.getElementById(`view-${viewId}`)) {
        targetElementId = targetElementId || HOME_SECTIONS[viewId];
        viewId = 'home';
    }

    const views = document.querySelectorAll('.page-view');
    views.forEach(v => v.classList.remove('active'));

    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) {
        targetView.classList.add('active');
        window.location.hash = viewId;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Update active nav styling
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${viewId}`);
    if (activeNav) activeNav.classList.add('active');

    // Scroll to specific section if requested
    if (targetElementId) {
        setTimeout(() => {
            const el = document.getElementById(targetElementId);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 150);
    }

    // Close mobile nav if open
    const mainNav = document.getElementById('mainNav');
    if (mainNav) mainNav.classList.remove('mobile-open');
}

function handleHashRouting() {
    const hash = window.location.hash.replace('#', '') || 'home';

    if (STANDALONE_PAGES[hash]) {
        window.location.replace(STANDALONE_PAGES[hash]);
        return;
    }

    const validViews = ['home', 'ai-advisor'];

    if (HOME_SECTIONS[hash]) {
        navigateTo('home', HOME_SECTIONS[hash]);
        return;
    }

    if (validViews.includes(hash)) {
        navigateTo(hash);
    } else {
        navigateTo('home');
    }
}

// Mobile Menu Toggle
function toggleMobileMenu() {
    const mainNav = document.getElementById('mainNav');
    if (mainNav) {
        mainNav.classList.toggle('mobile-open');
    }
}

// Farm Savings ROI Calculator Logic
function updateROICalculation() {
    const acreageInput = document.getElementById('acreageInput');
    const cattleInput = document.getElementById('cattleInput');
    const cropTypeSelect = document.getElementById('cropTypeSelect');

    if (!acreageInput || !cattleInput) return;

    const acres = parseInt(acreageInput.value, 10);
    const cattle = parseInt(cattleInput.value, 10);
    const crop = cropTypeSelect ? cropTypeSelect.value : 'corn';

    // Update label displays
    document.getElementById('acreageVal').textContent = `${acres.toLocaleString()} Acres`;
    document.getElementById('cattleVal').textContent = `${cattle.toLocaleString()} Cattle`;

    // Multipliers based on crop sensitivity
    let cropMult = 25.0; // $ per acre savings
    if (crop === 'soybeans') cropMult = 22.0;
    if (crop === 'wheat') cropMult = 18.0;
    if (crop === 'specialty') cropMult = 45.0;

    const waterCalc = Math.round(acres * cropMult * 0.55);
    const lossCalc = Math.round(acres * cropMult * 0.45);
    const feedCalc = Math.round(cattle * 40.0);

    const total = waterCalc + lossCalc + feedCalc;

    document.getElementById('waterSavings').textContent = `$${waterCalc.toLocaleString()}`;
    document.getElementById('lossSavings').textContent = `$${lossCalc.toLocaleString()}`;
    document.getElementById('feedSavings').textContent = `$${feedCalc.toLocaleString()}`;
    document.getElementById('totalSavings').textContent = `$${total.toLocaleString()} / yr`;
}

function updateContactMailtoLinks() {
    const subjectEl = document.getElementById('contactSubject');
    const messageEl = document.getElementById('contactMessage');
    const mailtoEl = document.getElementById('contactMailtoLink');
    const gmailEl = document.getElementById('contactGmailLink');
    if (!mailtoEl || !gmailEl) return;

    const subject = subjectEl ? subjectEl.value : 'Agrivia inquiry';
    const message = messageEl ? messageEl.value.trim() : '';
    const query = `subject=${encodeURIComponent(subject)}${message ? `&body=${encodeURIComponent(message)}` : ''}`;

    mailtoEl.href = `mailto:support@agrivia.ai?${query}`;
    gmailEl.href = `https://mail.google.com/mail/?view=cm&fs=1&to=support@agrivia.ai&su=${encodeURIComponent(subject)}${message ? `&body=${encodeURIComponent(message)}` : ''}`;
}

// Cookie Consent Banner Handler
function acceptCookies() {
    localStorage.setItem('agrivia_cookie_consent', 'true');
    const banner = document.getElementById('cookieBanner');
    if (banner) banner.style.display = 'none';
}

function checkCookieConsent() {
    if (localStorage.getItem('agrivia_cookie_consent') === 'true') {
        const banner = document.getElementById('cookieBanner');
        if (banner) banner.style.display = 'none';
    }
}

function closeAffiliateBar() {
    const bar = document.getElementById('affiliateTopBar');
    if (bar) bar.style.display = 'none';
}
