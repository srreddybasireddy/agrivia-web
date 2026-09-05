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
        initFarmCalculatorPrefill();
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

    const validViews = ['home', 'ai-advisor', 'farm'];

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

// Farm & Homestead Savings ROI Calculator Logic
const CALC_DEFAULT_BEDS = 6;
const CALC_DEFAULT_HEAD = 6;
let calcManualBeds = CALC_DEFAULT_BEDS;
let calcManualHead = CALC_DEFAULT_HEAD;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function isUsingFarmCounts() {
    const box = document.getElementById('calcUseFarm');
    return Boolean(box && box.checked);
}

function farmCalcCounts(snapshot) {
    if (!snapshot || !snapshot.profile) {
        return null;
    }
    const profile = snapshot.profile;
    const head = clamp(
        (profile.totalLivestock || 0) + (profile.totalPoultry || 0),
        0,
        80
    );
    const beds = clamp(
        profile.totalGarden || profile.totalCrops || Math.round(profile.farmSizeAcres || 0),
        0,
        40
    );
    if (!head && !beds) {
        return null;
    }
    const plants = (snapshot.assets || []).filter((asset) => (
        asset.kind === 'Crops' || asset.kind === 'Garden'
    ));
    return { head: head, beds: beds, plants: plants };
}

function syncFarmCropOptions(plants) {
    const select = document.getElementById('cropTypeSelect');
    if (!select) {
        return;
    }
    Array.from(select.querySelectorAll('option[data-farm-crop]')).forEach((opt) => opt.remove());
    (plants || []).slice(0, 8).forEach((asset) => {
        const option = document.createElement('option');
        option.value = `farm:${asset.id}`;
        option.dataset.farmCrop = 'true';
        option.textContent = asset.title;
        select.appendChild(option);
    });
}

function applyFarmCountsToCalculator() {
    const snapshot = window.AgriviaFarmUi && window.AgriviaFarmUi.getSnapshot
        ? window.AgriviaFarmUi.getSnapshot()
        : null;
    const counts = farmCalcCounts(snapshot);
    const acreageInput = document.getElementById('acreageInput');
    const cattleInput = document.getElementById('cattleInput');
    const select = document.getElementById('cropTypeSelect');
    if (!counts || !acreageInput || !cattleInput) {
        return;
    }
    acreageInput.value = String(counts.beds);
    cattleInput.value = String(counts.head);
    syncFarmCropOptions(counts.plants);
    if (select && counts.plants.length) {
        select.value = `farm:${counts.plants[0].id}`;
    }
    updateROICalculation();
}

function restoreManualCalculator() {
    const acreageInput = document.getElementById('acreageInput');
    const cattleInput = document.getElementById('cattleInput');
    if (acreageInput) {
        acreageInput.value = String(calcManualBeds);
    }
    if (cattleInput) {
        cattleInput.value = String(calcManualHead);
    }
    syncFarmCropOptions([]);
    const select = document.getElementById('cropTypeSelect');
    if (select) {
        select.value = 'specialty';
    }
    updateROICalculation();
}

function initFarmCalculatorPrefill() {
    const wrap = document.getElementById('calcUseFarmWrap');
    const box = document.getElementById('calcUseFarm');
    const acreageInput = document.getElementById('acreageInput');
    const cattleInput = document.getElementById('cattleInput');
    if (!wrap || !box) {
        return;
    }

    function syncVisibility() {
        const signedIn = window.AgriviaAuth && window.AgriviaAuth.isSignedIn();
        wrap.hidden = !signedIn;
        if (!signedIn) {
            box.checked = false;
            restoreManualCalculator();
        }
    }

    box.addEventListener('change', () => {
        if (box.checked) {
            applyFarmCountsToCalculator();
        } else {
            restoreManualCalculator();
        }
    });
    if (acreageInput) {
        acreageInput.addEventListener('input', () => {
            if (!isUsingFarmCounts()) {
                calcManualBeds = parseInt(acreageInput.value, 10) || 0;
            }
        });
    }
    if (cattleInput) {
        cattleInput.addEventListener('input', () => {
            if (!isUsingFarmCounts()) {
                calcManualHead = parseInt(cattleInput.value, 10) || 0;
            }
        });
    }
    window.addEventListener('agrivia-auth-changed', syncVisibility);
    window.addEventListener('agrivia-farm-changed', () => {
        syncVisibility();
        if (isUsingFarmCounts()) {
            applyFarmCountsToCalculator();
        }
    });
    syncVisibility();
}

function updateROICalculation() {
    const acreageInput = document.getElementById('acreageInput');
    const cattleInput = document.getElementById('cattleInput');
    const cropTypeSelect = document.getElementById('cropTypeSelect');

    if (!acreageInput || !cattleInput) return;

    const beds = parseInt(acreageInput.value, 10);
    const head = parseInt(cattleInput.value, 10);
    const crop = cropTypeSelect ? cropTypeSelect.value : 'specialty';

    document.getElementById('acreageVal').textContent = beds === 1 ? '1 bed' : `${beds} beds`;
    document.getElementById('cattleVal').textContent = head === 1 ? '1 head' : `${head} head`;

    let cropMult = 60;
    if (crop === 'corn') cropMult = 40;
    if (crop === 'soybeans') cropMult = 25;
    if (crop === 'wheat') cropMult = 50;

    const waterCalc = Math.round(beds * cropMult);
    const lossCalc = Math.round(head * 40);
    const feedCalc = Math.round(beds * 12);

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
