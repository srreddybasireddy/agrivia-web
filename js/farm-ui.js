/**
 * Header sign-in + farm portfolio UI. Chat still works when this is hidden.
 */
(function (global) {
    const KIND_LABELS = {
        Crops: "Crops",
        Cattle: "Livestock",
        Garden: "Garden",
        "Poultry & Eggs": "Poultry",
        "Birds & Bees": "Birds / bees",
        "Fish & Shrimp": "Fish",
    };

    let lastSnapshot = null;
    let lastAssets = [];
    let activeKindFilter = "";
    let profileEditorOpen = false;

    function el(id) {
        return document.getElementById(id);
    }

    function setHidden(node, hidden) {
        if (node) {
            node.hidden = hidden;
        }
    }

    function formatDate(value) {
        if (!value) {
            return "";
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "";
        }
        return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    }

    function formatAcres(acres) {
        if (!acres || acres <= 0) {
            return "";
        }
        const rounded = acres % 1 === 0 ? String(acres) : acres.toFixed(1);
        return acres === 1 ? "1 acre" : `${rounded} acres`;
    }

    function kindLabel(kind) {
        return KIND_LABELS[kind] || kind;
    }

    function kindCounts(assets) {
        const counts = {};
        (assets || []).forEach((asset) => {
            if (!asset.kind) {
                return;
            }
            counts[asset.kind] = (counts[asset.kind] || 0) + 1;
        });
        return Object.keys(counts).map((kind) => ({
            kind: kind,
            label: kindLabel(kind),
            count: counts[kind],
        }));
    }

    function headerPillText(assets, careCount) {
        const parts = kindCounts(assets).map((item) => {
            const noun = item.label.toLowerCase();
            return `${item.count} ${noun}`;
        });
        if (careCount > 0) {
            parts.push(`${careCount} alert${careCount === 1 ? "" : "s"}`);
        }
        return parts.join(" · ");
    }

    function placeLine(profile) {
        const auth = global.AgriviaAuth;
        const name = (profile && profile.userName) || (auth && auth.getName()) || "";
        const place = (profile && (profile.address || profile.zipCode)) || "";
        if (name && place) {
            return `${name} · ${place}`;
        }
        return name || place;
    }

    function visibleAssets(assets) {
        if (!activeKindFilter) {
            return assets;
        }
        return assets.filter((asset) => asset.kind === activeKindFilter);
    }

    function openAdvisor(detail) {
        if (detail && detail.query) {
            global.dispatchEvent(new CustomEvent("agrivia-chat-ask", { detail: detail }));
        } else if (detail && detail.category) {
            global.dispatchEvent(new CustomEvent("agrivia-chat-category", {
                detail: { category: detail.category },
            }));
        }
        if (typeof global.navigateTo === "function") {
            global.navigateTo("ai-advisor");
        } else {
            window.location.hash = "ai-advisor";
        }
    }

    function setProfileOpen(open) {
        profileEditorOpen = Boolean(open);
        const form = el("farmProfileForm");
        const toggle = el("farmEditToggle");
        setHidden(form, !profileEditorOpen);
        if (form) {
            form.classList.toggle("is-open", profileEditorOpen);
        }
        if (toggle) {
            toggle.setAttribute("aria-expanded", profileEditorOpen ? "true" : "false");
        }
    }

    function renderHeader() {
        const auth = global.AgriviaAuth;
        if (!auth) {
            return;
        }
        const signedIn = auth.isSignedIn();
        const guest = el("authGuest");
        const signed = el("authSignedIn");
        const label = el("authEmailLabel");
        const farmNav = el("nav-farm");
        setHidden(guest, signedIn);
        setHidden(signed, !signedIn);
        if (label) {
            label.textContent = auth.getEmail() || auth.getName() || "Signed in";
        }
        if (farmNav) {
            farmNav.hidden = false;
        }
        if (!signedIn) {
            lastSnapshot = null;
            lastAssets = [];
            activeKindFilter = "";
            profileEditorOpen = false;
            const pill = el("farmHeaderPill");
            setHidden(pill, true);
        }
    }

    function renderHeaderPill(assets, careCount) {
        const pill = el("farmHeaderPill");
        if (!pill) {
            return;
        }
        const text = headerPillText(assets, careCount || 0);
        pill.textContent = text;
        setHidden(pill, !text);
    }

    function renderIdentity(profile, signedIn) {
        const line = el("farmPlaceLine");
        const toggle = el("farmEditToggle");
        const text = signedIn ? placeLine(profile) : "";
        if (line) {
            line.textContent = text;
            setHidden(line, !text);
        }
        setHidden(toggle, !signedIn);
        const hint = el("farmProfileHint");
        setHidden(hint, true);
        if (!signedIn || !profileEditorOpen) {
            setProfileOpen(false);
        }
    }

    function renderCareBanner(careItems) {
        const banner = el("farmCareBanner");
        if (!banner) {
            return;
        }
        banner.replaceChildren();
        const items = Array.isArray(careItems) ? careItems.slice(0, 6) : [];
        if (!items.length) {
            setHidden(banner, true);
            return;
        }
        setHidden(banner, false);
        const heading = document.createElement("p");
        heading.className = "farm-care-heading";
        heading.textContent = items.length === 1 ? "This week" : `This week · ${items.length} items`;
        banner.appendChild(heading);
        const list = document.createElement("ul");
        list.className = "farm-care-list";
        items.forEach((item) => {
            const row = document.createElement("li");
            row.textContent = item.source ? `${item.source} · ${item.text}` : item.text;
            list.appendChild(row);
        });
        banner.appendChild(list);
    }

    function pendingPromptFrom(snapshot) {
        const pending = snapshot && snapshot.pending && snapshot.pending.nextQuestion;
        if (!pending || typeof pending.prompt !== "string") {
            return "";
        }
        return pending.prompt.trim();
    }

    function renderFilters(profile, assets) {
        const banner = el("farmKpiBanner");
        if (!banner) {
            return;
        }
        banner.replaceChildren();
        const acres = formatAcres(profile && profile.farmSizeAcres);
        if (acres) {
            const chip = document.createElement("span");
            chip.className = "farm-stat-chip";
            chip.textContent = acres;
            banner.appendChild(chip);
        }
        const filters = kindCounts(assets);
        if (activeKindFilter && !filters.some((item) => item.kind === activeKindFilter)) {
            activeKindFilter = "";
        }
        filters.forEach((item) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "farm-kind-chip";
            chip.setAttribute(
                "aria-pressed",
                item.kind === activeKindFilter || filters.length === 1 ? "true" : "false"
            );
            const mark = document.createElement("span");
            mark.className = "farm-kind-chip-mark";
            mark.setAttribute("aria-hidden", "true");
            const name = document.createElement("span");
            name.textContent = item.label;
            const count = document.createElement("span");
            count.className = "farm-kind-chip-count";
            count.textContent = String(item.count);
            chip.appendChild(mark);
            chip.appendChild(name);
            chip.appendChild(count);
            chip.addEventListener("click", () => {
                activeKindFilter = activeKindFilter === item.kind ? "" : item.kind;
                renderFilters(profile, lastAssets);
                renderAssets(visibleAssets(lastAssets));
            });
            banner.appendChild(chip);
        });
        setHidden(banner, !banner.childElementCount);
    }

    function cardFacts(asset) {
        const parts = [];
        if (asset.variety && asset.kind === "Crops") {
            parts.push(asset.variety);
        }
        const acres = formatAcres(asset.acres);
        if (acres) {
            parts.push(acres);
        }
        if (asset.subtitle) {
            parts.push(asset.subtitle);
        }
        const planted = formatDate(asset.plantedDate);
        if (planted) {
            parts.push(`Planted ${planted}`);
        }
        const harvest = formatDate(asset.harvestDate);
        if (harvest) {
            parts.push(`Harvest ${harvest}`);
        }
        return parts.join(" · ");
    }

    function renderAssets(assets) {
        const grid = el("farmAssetGrid");
        const empty = el("farmEmpty");
        if (!grid) {
            return;
        }
        grid.replaceChildren();
        setHidden(empty, lastAssets.length > 0);
        assets.forEach((asset) => {
            const card = document.createElement("article");
            card.className = asset.imageUrl ? "farm-asset-card has-image" : "farm-asset-card";

            const copy = document.createElement("div");
            copy.className = "farm-asset-copy";

            const kind = document.createElement("span");
            kind.className = "farm-asset-kind";
            kind.textContent = kindLabel(asset.kind);
            copy.appendChild(kind);

            const title = document.createElement("h3");
            title.textContent = asset.title;
            copy.appendChild(title);

            const statusLine = [kindLabel(asset.kind)];
            if (asset.status) {
                statusLine.push(asset.status);
            }
            const meta = document.createElement("p");
            meta.className = "farm-asset-meta";
            meta.textContent = statusLine.join(" · ");
            copy.appendChild(meta);
            const facts = cardFacts(asset);
            if (facts) {
                const extra = document.createElement("p");
                extra.className = "farm-asset-roi";
                extra.textContent = facts;
                copy.appendChild(extra);
            }
            if (asset.roiEstimate) {
                const roi = document.createElement("p");
                roi.className = "farm-asset-roi";
                roi.textContent = asset.roiEstimate;
                copy.appendChild(roi);
            }
            if (asset.healthAlerts) {
                const alerts = document.createElement("p");
                alerts.className = "farm-asset-alert";
                alerts.textContent = asset.healthAlerts;
                copy.appendChild(alerts);
            }

            const ask = document.createElement("button");
            ask.type = "button";
            ask.className = "farm-asset-ask";
            ask.textContent = "Ask Advisor →";
            ask.addEventListener("click", () => {
                openAdvisor({ category: asset.kind });
            });
            copy.appendChild(ask);
            card.appendChild(copy);

            if (asset.imageUrl) {
                const deco = document.createElement("div");
                deco.className = "farm-asset-deco";
                const art = document.createElement("img");
                art.src = asset.imageUrl;
                art.alt = "";
                art.addEventListener("error", () => {
                    deco.remove();
                    card.classList.remove("has-image");
                });
                deco.appendChild(art);
                card.appendChild(deco);
            }
            grid.appendChild(card);
        });
    }

    function renderNextQuestion(pending) {
        const node = el("farmNextQuestion");
        if (!node) {
            return;
        }
        node.replaceChildren();
        const prompt = pending && pending.nextQuestion && typeof pending.nextQuestion.prompt === "string"
            ? pending.nextQuestion.prompt.trim()
            : "";
        if (!prompt) {
            setHidden(node, true);
            return;
        }
        const mark = document.createElement("span");
        mark.className = "farm-next-mark";
        mark.setAttribute("aria-hidden", "true");
        const copy = document.createElement("p");
        copy.className = "farm-next-copy";
        copy.textContent = `Next: ${prompt}`;
        const ask = document.createElement("button");
        ask.type = "button";
        ask.className = "farm-next-ask";
        ask.textContent = "Ask Advisor →";
        ask.addEventListener("click", () => {
            openAdvisor({ query: prompt });
        });
        node.appendChild(mark);
        node.appendChild(copy);
        node.appendChild(ask);
        setHidden(node, false);
    }

    function fillProfileForm(profile) {
        const name = el("farmUserName");
        const email = el("farmEmail");
        const phone = el("farmPhone");
        const zip = el("farmZip");
        const address = el("farmAddress");
        if (name) {
            name.value = profile.userName || (global.AgriviaAuth && global.AgriviaAuth.getName()) || "";
        }
        if (email) {
            email.value = profile.email || (global.AgriviaAuth && global.AgriviaAuth.getEmail()) || "";
        }
        if (phone) {
            phone.value = profile.phoneNumber || "";
        }
        if (zip) {
            zip.value = profile.zipCode || "";
        }
        if (address) {
            address.value = profile.address || "";
        }
    }

    async function loadFarm() {
        const guestPanel = el("farmGuest");
        const signedPanel = el("farmSigned");
        const status = el("farmStatus");
        const loadStatus = el("farmLoadStatus");
        const auth = global.AgriviaAuth;
        const signedIn = Boolean(auth && auth.isSignedIn());
        setHidden(guestPanel, signedIn);
        setHidden(signedPanel, !signedIn);
        if (!signedIn || !global.AgriviaFarmApi) {
            lastSnapshot = null;
            lastAssets = [];
            renderIdentity(null, false);
            renderCareBanner([]);
            setHidden(loadStatus, true);
            global.dispatchEvent(new CustomEvent("agrivia-farm-changed", { detail: { snapshot: null } }));
            return null;
        }
        renderIdentity({
            userName: (auth && auth.getName()) || "",
            address: "",
            zipCode: "",
        }, true);
        if (loadStatus) {
            loadStatus.textContent = "Loading your farm…";
            setHidden(loadStatus, false);
        }
        try {
            const portfolio = await global.AgriviaFarmApi.getPortfolio();
            lastSnapshot = portfolio;
            lastAssets = portfolio.assets || [];
            fillProfileForm(portfolio.profile);
            renderIdentity(portfolio.profile, true);
            renderFilters(portfolio.profile, lastAssets);
            renderHeaderPill(lastAssets, (portfolio.careItems || []).length);
            renderCareBanner(portfolio.careItems);
            renderAssets(visibleAssets(lastAssets));
            renderNextQuestion(portfolio.pending);
            global.dispatchEvent(new CustomEvent("agrivia-farm-changed", { detail: { snapshot: portfolio } }));
            if (portfolio.listErrors) {
                if (loadStatus) {
                    loadStatus.textContent = "Some asset lists could not be reached.";
                    setHidden(loadStatus, false);
                }
            } else {
                setHidden(loadStatus, true);
                if (status && !profileEditorOpen) {
                    status.textContent = "";
                }
            }
            return portfolio;
        } catch (err) {
            const message = err.message || "Could not load the farm profile.";
            if (loadStatus) {
                loadStatus.textContent = message;
                setHidden(loadStatus, false);
            }
            if (status) {
                status.textContent = message;
            }
            return lastSnapshot;
        }
    }

    async function refreshAndDiff(before) {
        const after = await loadFarm();
        if (!after || !global.AgriviaFarmApi) {
            return { added: [], totalsChanged: false };
        }
        return global.AgriviaFarmApi.diffPortfolio(before || lastSnapshot, after);
    }

    function init() {
        const auth = global.AgriviaAuth;
        if (!auth) {
            return;
        }

        renderHeader();

        const signOutBtn = el("authSignOut");
        if (signOutBtn) {
            signOutBtn.addEventListener("click", async () => {
                await auth.signOut();
            });
        }

        auth.fetchAuthConfig().then((cfg) => {
            const mount = el("googleSignInBtn");
            if (cfg.enabled && cfg.clientId) {
                auth.renderGoogleButton(mount, cfg.clientId);
            } else if (mount) {
                mount.textContent = "";
                const hint = el("authUnavailable");
                if (hint) {
                    hint.hidden = false;
                }
            }
        });

        const editToggle = el("farmEditToggle");
        if (editToggle) {
            editToggle.addEventListener("click", () => {
                const form = el("farmProfileForm");
                const opening = Boolean(form && form.hidden);
                if (opening && lastSnapshot) {
                    fillProfileForm(lastSnapshot.profile);
                }
                setProfileOpen(opening);
            });
        }

        const editCancel = el("farmEditCancel");
        if (editCancel) {
            editCancel.addEventListener("click", () => {
                if (lastSnapshot) {
                    fillProfileForm(lastSnapshot.profile);
                }
                const status = el("farmStatus");
                if (status) {
                    status.textContent = "";
                }
                setProfileOpen(false);
            });
        }

        const profileForm = el("farmProfileForm");
        if (profileForm) {
            profileForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                const status = el("farmStatus");
                try {
                    await global.AgriviaFarmApi.saveProfile({
                        userName: el("farmUserName").value,
                        email: el("farmEmail").value,
                        phoneNumber: el("farmPhone").value,
                        zipCode: el("farmZip").value,
                        address: el("farmAddress").value,
                    });
                    setProfileOpen(false);
                    await loadFarm();
                    setProfileOpen(false);
                } catch (err) {
                    if (status) {
                        status.textContent = err.message || "Could not save the profile.";
                    }
                }
            });
        }

        const assetForm = el("farmAssetForm");
        if (assetForm) {
            assetForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                const status = el("farmAssetStatus");
                try {
                    await global.AgriviaFarmApi.addAsset(
                        el("farmAssetKind").value,
                        el("farmAssetTitle").value
                    );
                    el("farmAssetTitle").value = "";
                    if (status) {
                        status.textContent = "Saved. Advisor can use this on the next question.";
                    }
                    await loadFarm();
                } catch (err) {
                    if (status) {
                        status.textContent = err.message || "Could not save that asset.";
                    }
                }
            });
        }

        global.addEventListener("agrivia-auth-changed", () => {
            renderHeader();
            loadFarm();
        });

        loadFarm();
    }

    document.addEventListener("DOMContentLoaded", init);

    function hasAdvisorFarmContext() {
        const auth = global.AgriviaAuth;
        if (!auth || !auth.isSignedIn() || !lastSnapshot) {
            return false;
        }
        return lastAssets.length > 0;
    }

    global.AgriviaFarmUi = {
        refresh: loadFarm,
        refreshAndDiff: refreshAndDiff,
        getSnapshot: function () {
            return lastSnapshot;
        },
        getPendingPrompt: function () {
            return pendingPromptFrom(lastSnapshot);
        },
        hasAdvisorFarmContext: hasAdvisorFarmContext,
        placeLine: placeLine,
        kindLabel: kindLabel,
    };
})(window);
