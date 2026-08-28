/**
 * AGRIVIA.AI - Main Client Script
 * Handles Single Page Navigation, Interactive AI Selector, ROI Calculator, and Skimlinks Compliance.
 */

// Sample AI Query Data
const AI_SAMPLE_DATA = [
    {
        title: "Corn Rust Diagnosis & Treatment Plan",
        response: "Based on high humidity (84%) in your region, early orange pustules indicate Southern Corn Rust. Recommend applying triazole fungicide within 48 hours to preserve 95%+ harvest yield."
    },
    {
        title: "Cattle Heat Index & Feeding Schedule",
        response: "Current temperature (92°F) triggers Category 2 Heat Alert for cattle. Shift feeding times to 6:00 AM & 8:00 PM. Activate shade misters to maintain core body temperature below 102.5°F."
    },
    {
        title: "Micro-Climate Frost Alert Protection",
        response: "Overnight low forecast: 29°F between 3:00 AM and 6:00 AM. Recommend activating wind pumps for fruit orchards and securing poultry coop ventilation flaps before 9:00 PM."
    }
];

// Article Data for Blog Modal
const ARTICLES_DATA = {
    1: {
        title: "Top 5 Soil Moisture Sensors for 2026 (Agronomist Tested)",
        author: "Dr. Marcus Vance, Senior Agronomist",
        date: "August 15, 2026",
        content: `
            <p>Soil moisture monitoring is the single most effective way to optimize crop yield while reducing water & electrical pumping costs. Over the past 6 months, our team tested 12 cellular and LoRaWAN soil moisture probes across 500 acres of corn and soybean fields.</p>
            <h3>Our Top Pick: CropSense Pro LoRa Probe</h3>
            <p>The CropSense Pro features multi-depth capacitive sensors (4", 12", and 24") providing continuous volumetric water content (VWC) data directly into the Agrivia mobile dashboard.</p>
            <ul>
                <li><strong>Battery Life:</strong> 5+ years (integrated solar micro-cell)</li>
                <li><strong>Agrivia Integration:</strong> Direct API sync via Bluetooth & LoRaWAN gateway</li>
                <li><strong>ROI:</strong> Paid for itself in 45 days through irrigation pumping reduction</li>
            </ul>
            <p><em>Affiliate Disclosure: Purchasing through our partner links earns Agrivia a referral commission at no extra cost to you.</em></p>
        `
    },
    2: {
        title: "How AI Photo Diagnostics Prevent 30% Yield Loss in Corn & Soybeans",
        author: "Elena Rostova, AI Lead Engineer",
        date: "August 10, 2026",
        content: `
            <p>Fungal leaf blights and pest infestations cost farmers millions every season. By combining mobile camera image classification with localized PyTorch vector embeddings, Agrivia identifies over 80+ crop diseases in under 2 seconds.</p>
            <h3>Real-Time Diagnostic Workflow</h3>
            <p>1. Snap a high-res photo of affected leaves inside the Agrivia iOS or Android app.<br>
               2. On-device & backend embeddings classify early lesion patterns.<br>
               3. The AI Advisor checks your local weather telemetry to suggest approved treatment sprays before spores spread.</p>
        `
    },
    3: {
        title: "Livestock Heat Stress Management: Essential Equipment & Shelter Strategies",
        author: "J. Miller, Livestock Operations Specialist",
        date: "August 5, 2026",
        content: `
            <p>Heat stress in cattle drastically lowers milk production and daily weight gain. Implementing automated micro-climate sensors and shade structures ensures your herd stays in optimal health.</p>
            <h3>Key Equipment Recommendations</h3>
            <p>We recommend pairing automated high-pressure shade misters with solar-powered water troughs. Monitor pen water temperature logs daily via the Agrivia Cattle tab.</p>
        `
    }
};

// Initialize Page Navigation
document.addEventListener('DOMContentLoaded', () => {
    handleHashRouting();
    window.addEventListener('hashchange', handleHashRouting);
    updateROICalculation();
    checkCookieConsent();
});

// SPA Hash Navigation Handler
function navigateTo(viewId, targetElementId = null) {
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
    const validViews = ['home', 'features', 'ai-advisor', 'calculator', 'blog', 'about', 'privacy', 'terms', 'affiliate-disclosure', 'contact'];
    
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

// Interactive AI Sample Selector
function selectSampleQuery(index) {
    const chips = document.querySelectorAll('.query-chip');
    chips.forEach(c => c.classList.remove('active'));
    chips[index].classList.add('active');

    const data = AI_SAMPLE_DATA[index];
    const titleEl = document.getElementById('aiQueryTitle');
    const responseEl = document.getElementById('aiQueryResponse');

    if (titleEl && responseEl) {
        titleEl.textContent = data.title;
        responseEl.textContent = data.response;
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

// Article Modal Handler
function openArticleModal(articleId) {
    const article = ARTICLES_DATA[articleId];
    if (!article) return;

    const modalBody = document.getElementById('modalArticleBody');
    const modal = document.getElementById('articleModal');

    if (modalBody && modal) {
        modalBody.innerHTML = `
            <span class="badge-tag" style="margin-bottom:0.8rem;">${article.author}</span>
            <h2 style="font-size:1.8rem; margin-bottom:0.5rem; color:#FFF;">${article.title}</h2>
            <p style="font-size:0.85rem; color:var(--text-dim); margin-bottom:1.5rem;">Published on ${article.date}</p>
            <div>${article.content}</div>
        `;
        modal.classList.remove('hidden');
    }
}

function closeArticleModal(event) {
    if (event.target.classList.contains('modal-overlay') || event.target.classList.contains('modal-close-btn')) {
        const modal = document.getElementById('articleModal');
        if (modal) modal.classList.add('hidden');
    }
}

// Contact Form Handler
function handleContactSubmit(event) {
    event.preventDefault();
    const btn = document.getElementById('contactSubmitBtn');
    const alertBox = document.getElementById('formSuccessAlert');

    if (btn) btn.innerHTML = '<span>Sending...</span>';

    setTimeout(() => {
        if (btn) btn.innerHTML = '<span>Message Sent!</span>';
        if (alertBox) alertBox.classList.remove('hidden');
        document.getElementById('contactForm').reset();
    }, 1000);
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
