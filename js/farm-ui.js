/**
 * Header sign-in + farm profile UI. Chat still works when this is hidden.
 */
(function (global) {
    function el(id) {
        return document.getElementById(id);
    }

    function setHidden(node, hidden) {
        if (node) {
            node.hidden = hidden;
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
            farmNav.hidden = !signedIn;
        }
    }

    function fillProfileForm(profile) {
        const name = el("farmUserName");
        const email = el("farmEmail");
        const phone = el("farmPhone");
        const zip = el("farmZip");
        const address = el("farmAddress");
        if (name) {
            name.value = profile.userName || global.AgriviaAuth.getName() || "";
        }
        if (email) {
            email.value = profile.email || global.AgriviaAuth.getEmail() || "";
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
        const summary = el("farmAggregates");
        if (summary) {
            summary.textContent = [
                `Crops: ${profile.totalCrops || 0}`,
                `Livestock: ${profile.totalLivestock || 0}`,
                `Garden: ${profile.totalGarden || 0}`,
                `Poultry: ${profile.totalPoultry || 0}`,
            ].join(" · ");
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
            return;
        }
        if (status) {
            status.textContent = "Loading your farm…";
        }
        try {
            const profile = await global.AgriviaFarmApi.getProfile();
            fillProfileForm(profile);
            if (status) {
                status.textContent = "Saved on the same farm API the apps use.";
            }
        } catch (err) {
            if (status) {
                status.textContent = err.message || "Could not load the farm profile.";
            }
        }
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
})(window);
