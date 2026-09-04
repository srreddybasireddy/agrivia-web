/**
 * Header sign-in + farm portfolio UI. Chat still works when this is hidden.
 */
(function (global) {
    let lastSnapshot = null;

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

    function kpiItems(profile) {
        const items = [];
        if (profile.farmSizeAcres > 0) {
            items.push({ label: formatAcres(profile.farmSizeAcres), value: "" });
        }
        items.push({ label: "Crops", value: String(profile.totalCrops || 0) });
        items.push({ label: "Livestock", value: String(profile.totalLivestock || 0) });
        items.push({ label: "Garden", value: String(profile.totalGarden || 0) });
        items.push({ label: "Poultry", value: String(profile.totalPoultry || 0) });
        return items;
    }

    function headerPillText(profile) {
        const parts = [];
        if (profile.totalCrops) {
            parts.push(`${profile.totalCrops} crop${profile.totalCrops === 1 ? "" : "s"}`);
        }
        if (profile.totalLivestock) {
            parts.push(`${profile.totalLivestock} cattle`);
        }
        if (profile.totalGarden) {
            parts.push(`${profile.totalGarden} garden`);
        }
        if (profile.totalPoultry) {
            parts.push(`${profile.totalPoultry} poultry`);
        }
        if (profile.totalBirdsBees) {
            parts.push(`${profile.totalBirdsBees} birds/bees`);
        }
        if (profile.totalFishShrimp) {
            parts.push(`${profile.totalFishShrimp} fish`);
        }
        return parts.join(" · ");
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
            farmNav.hidden = !signedIn;
        }
        if (!signedIn) {
            lastSnapshot = null;
            const pill = el("farmHeaderPill");
            setHidden(pill, true);
        }
    }

    function renderHeaderPill(profile) {
        const pill = el("farmHeaderPill");
        if (!pill) {
            return;
        }
        const text = headerPillText(profile);
        pill.textContent = text;
        setHidden(pill, !text);
    }

    function renderKpis(profile) {
        const banner = el("farmKpiBanner");
        if (!banner) {
            return;
        }
        banner.replaceChildren();
        kpiItems(profile).forEach((item) => {
            const chip = document.createElement("div");
            chip.className = "farm-kpi-chip";
            if (item.value) {
                const value = document.createElement("strong");
                value.textContent = item.value;
                chip.appendChild(value);
            }
            const label = document.createElement("span");
            label.textContent = item.label;
            chip.appendChild(label);
            banner.appendChild(chip);
        });
    }

    function cardMeta(asset) {
        const parts = [asset.kind];
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
        if (asset.status) {
            parts.push(asset.status);
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
        setHidden(empty, assets.length > 0);
        assets.forEach((asset) => {
            const card = document.createElement("article");
            card.className = "farm-asset-card";

            const kind = document.createElement("span");
            kind.className = "farm-asset-kind";
            kind.textContent = asset.kind;
            card.appendChild(kind);

            const title = document.createElement("h3");
            title.textContent = asset.title;
            card.appendChild(title);

            const meta = document.createElement("p");
            meta.className = "farm-asset-meta";
            meta.textContent = cardMeta(asset);
            card.appendChild(meta);

            if (asset.roiEstimate) {
                const roi = document.createElement("p");
                roi.className = "farm-asset-roi";
                roi.textContent = asset.roiEstimate;
                card.appendChild(roi);
            }
            if (asset.healthAlerts) {
                const alerts = document.createElement("p");
                alerts.className = "farm-asset-alert";
                alerts.textContent = asset.healthAlerts;
                card.appendChild(alerts);
            }
            card.tabIndex = 0;
            card.setAttribute("role", "button");
            card.setAttribute("aria-label", `Ask Advisor about ${asset.title}`);
            const openInAdvisor = () => {
                global.dispatchEvent(new CustomEvent("agrivia-chat-category", {
                    detail: { category: asset.kind },
                }));
                if (typeof global.navigateTo === "function") {
                    global.navigateTo("ai-advisor");
                } else {
                    window.location.hash = "ai-advisor";
                }
            };
            card.addEventListener("click", openInAdvisor);
            card.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openInAdvisor();
                }
            });
            grid.appendChild(card);
        });
    }

    function renderNextQuestion(pending) {
        const node = el("farmNextQuestion");
        if (!node) {
            return;
        }
        const prompt = pending && pending.nextQuestion && typeof pending.nextQuestion.prompt === "string"
            ? pending.nextQuestion.prompt.trim()
            : "";
        node.textContent = prompt ? `Next: ${prompt}` : "";
        setHidden(node, !prompt);
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
        const auth = global.AgriviaAuth;
        const signedIn = auth && auth.isSignedIn();
        setHidden(guestPanel, signedIn);
        setHidden(signedPanel, !signedIn);
        if (!signedIn || !global.AgriviaFarmApi) {
            lastSnapshot = null;
            return null;
        }
        if (status) {
            status.textContent = "Loading your farm…";
        }
        try {
            const portfolio = await global.AgriviaFarmApi.getPortfolio();
            lastSnapshot = portfolio;
            fillProfileForm(portfolio.profile);
            renderKpis(portfolio.profile);
            renderHeaderPill(portfolio.profile);
            renderAssets(portfolio.assets);
            renderNextQuestion(portfolio.pending);
            if (status) {
                status.textContent = portfolio.listErrors
                    ? "Profile loaded. Some asset lists could not be reached."
                    : "Saved on the same farm API the apps use.";
            }
            return portfolio;
        } catch (err) {
            if (status) {
                status.textContent = err.message || "Could not load the farm profile.";
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
                    if (status) {
                        status.textContent = "Profile saved.";
                    }
                    await loadFarm();
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

    global.AgriviaFarmUi = {
        refresh: loadFarm,
        refreshAndDiff: refreshAndDiff,
        getSnapshot: function () {
            return lastSnapshot;
        },
    };
})(window);
