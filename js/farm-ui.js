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

    const STATUS_OPTIONS = {
        Garden: ["Active", "Growing", "Planning", "Dormant"],
        Crops: ["Planted", "Growing", "Harvesting", "Harvested", "Planning"],
        Cattle: ["Healthy", "Under Observation", "Milking", "Planning"],
        "Poultry & Eggs": ["Active", "Planning"],
        "Birds & Bees": ["Active", "Planning"],
        "Fish & Shrimp": ["Active", "Planning"],
    };
    const COUNTED_KINDS = {
        Garden: true,
        Cattle: true,
        "Poultry & Eggs": true,
        "Birds & Bees": true,
        "Fish & Shrimp": true,
    };

    let lastSnapshot = null;
    let lastAssets = [];
    let activeKindFilter = "";
    let profileEditorOpen = false;
    let editingAssetKey = "";
    let focusCountOnEdit = false;

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
        const rawName = (profile && profile.userName) || (auth && auth.getName()) || "";
        const care = global.AgriviaFarmCare;
        const name = care && care.displayName ? care.displayName(rawName) : rawName;
        const place = (profile && profile.zipCode) || (profile && profile.address) || "";
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
        const payload = detail || {};
        if (payload.assetId) {
            global.dispatchEvent(new CustomEvent("agrivia-chat-open-asset", { detail: payload }));
        } else if (payload.query) {
            global.dispatchEvent(new CustomEvent("agrivia-chat-ask", { detail: payload }));
        } else if (payload.category) {
            global.dispatchEvent(new CustomEvent("agrivia-chat-category", {
                detail: { category: payload.category },
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
        const panel = el("accountMenu");
        const button = el("accountMenuButton");
        setHidden(panel, !profileEditorOpen);
        if (button) {
            button.setAttribute("aria-expanded", profileEditorOpen ? "true" : "false");
        }
    }

    function paintAccountMark(profile) {
        const auth = global.AgriviaAuth;
        const source = (profile && (profile.userName || profile.email))
            || (auth && (auth.getName() || auth.getEmail()))
            || "";
        const letter = String(source).trim().charAt(0).toUpperCase();
        const node = el("accountInitial");
        const glyph = el("accountGlyph");
        if (node) {
            node.textContent = letter;
            node.hidden = !letter;
        }
        if (glyph) {
            if (letter) {
                glyph.setAttribute("hidden", "");
            } else {
                glyph.removeAttribute("hidden");
            }
        }
        const label = el("authEmailLabel");
        if (label) {
            const email = (profile && profile.email) || (auth && auth.getEmail()) || "";
            label.textContent = email || (auth && auth.getName()) || "Signed in";
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
        const farmNav = el("nav-farm");
        setHidden(guest, signedIn);
        setHidden(signed, !signedIn);
        paintAccountMark(lastSnapshot && lastSnapshot.profile);
        if (farmNav) {
            farmNav.hidden = false;
        }
        if (!signedIn) {
            lastSnapshot = null;
            lastAssets = [];
            activeKindFilter = "";
            editingAssetKey = "";
            setProfileOpen(false);
            const pill = el("farmHeaderPill");
            setHidden(pill, true);
        }
    }

    function renderHeaderPill() {
        const pill = el("farmHeaderPill");
        if (pill) {
            setHidden(pill, true);
        }
    }

    function renderIdentity(profile, signedIn) {
        const line = el("farmPlaceLine");
        const text = signedIn ? placeLine(profile) : "";
        if (line) {
            line.textContent = text;
            setHidden(line, !text);
        }
        const hint = el("farmProfileHint");
        setHidden(hint, true);
        if (signedIn) {
            paintAccountMark(profile);
        }
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

    function assetKey(asset) {
        return `${asset.kind}:${asset.id}`;
    }

    function statusChoices(kind, current) {
        const options = (STATUS_OPTIONS[kind] || ["Active"]).slice();
        const currentValue = (current || "").trim();
        if (currentValue && !options.some((item) => item.toLowerCase() === currentValue.toLowerCase())) {
            options.unshift(currentValue);
        }
        return options;
    }

    function labeledControl(labelText, control) {
        const wrap = document.createElement("label");
        wrap.className = "farm-asset-field";
        const caption = document.createElement("span");
        caption.className = "farm-label";
        caption.textContent = labelText;
        wrap.appendChild(caption);
        wrap.appendChild(control);
        return wrap;
    }

    function textInput(value, maxLength) {
        const input = document.createElement("input");
        input.className = "form-input";
        input.type = "text";
        input.maxLength = maxLength || 150;
        input.value = value || "";
        return input;
    }

    function numberInput(value, min) {
        const input = document.createElement("input");
        input.className = "form-input";
        input.type = "number";
        input.min = String(min == null ? 0 : min);
        input.step = "1";
        input.value = value == null || value === "" ? "" : String(value);
        return input;
    }

    function statusSelect(kind, current) {
        const select = document.createElement("select");
        select.className = "form-input";
        statusChoices(kind, current).forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            if (current && value.toLowerCase() === current.toLowerCase()) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        return select;
    }

    function countLabel(kind) {
        if (kind === "Garden") {
            return "Plants";
        }
        if (kind === "Crops") {
            return "Acres";
        }
        if (kind === "Cattle") {
            return "Head count";
        }
        if (kind === "Poultry & Eggs") {
            return "Birds";
        }
        if (kind === "Fish & Shrimp") {
            return "Fish";
        }
        return "Count";
    }

    const LIVESTOCK_SPECIES = [
        { value: "", label: "Species" },
        { value: "sheep", label: "Sheep" },
        { value: "cattle", label: "Cattle" },
        { value: "goat", label: "Goat" },
        { value: "other", label: "Other" },
    ];
    const LIVESTOCK_GROUPS = {
        sheep: [["ewes", "Ewes"], ["rams", "Rams"], ["wethers", "Wethers"], ["lambs", "Lambs"]],
        cattle: [["cows", "Cows"], ["bulls", "Bulls"], ["steers", "Steers"], ["heifers", "Heifers"], ["calves", "Calves"]],
        goat: [["does", "Does"], ["bucks", "Bucks"], ["wethers", "Wethers"], ["kids", "Kids"]],
        other: [],
    };
    const LIVESTOCK_PURPOSES = [["meat", "Meat"], ["wool", "Wool"], ["milk", "Milk"], ["breeding", "Breeding"], ["pets", "Pets"]];
    const LIVESTOCK_FEED = [["pasture", "Pasture"], ["hay", "Hay"], ["grain", "Grain"]];
    const LIVESTOCK_CARE = [["deworm", "Deworm"], ["vaccine", "Vaccine"], ["hoof_trim", "Hoof trim"], ["shearing", "Shearing"], ["vet_visit", "Vet visit"]];

    function selectInput(options, value) {
        const select = document.createElement("select");
        select.className = "form-input";
        options.forEach((option) => {
            const node = document.createElement("option");
            node.value = option.value;
            node.textContent = option.label;
            select.appendChild(node);
        });
        select.value = value || "";
        return select;
    }

    function choiceRow(name, options, selected) {
        const row = document.createElement("div");
        row.className = "farm-choice-row";
        row.dataset.choice = name;
        const chosen = Array.isArray(selected) ? selected : [];
        options.forEach((option) => {
            const label = document.createElement("label");
            const input = document.createElement("input");
            input.type = "checkbox";
            input.value = option[0];
            input.checked = chosen.indexOf(option[0]) >= 0;
            label.appendChild(input);
            label.appendChild(document.createTextNode(option[1]));
            row.appendChild(label);
        });
        return row;
    }

    function checkedValues(root, name) {
        const row = root.querySelector(`[data-choice="${name}"]`);
        if (!row) {
            return [];
        }
        return Array.from(row.querySelectorAll("input:checked")).map((input) => input.value);
    }

    function livestockSource(asset) {
        const card = (asset && (asset.livestockCard || asset.livestock_card)) || {};
        const details = card.details && typeof card.details === "object" ? card.details : {};
        return {
            species: details.species || card.species || "",
            total_head: details.total_head || card.total_head || (asset && asset.count) || "",
            groups: details.groups || card.groups || {},
            purpose: details.purpose || card.purpose || [],
            breed: details.breed || "",
            acquired_date: details.acquired_date || card.acquired_date || "",
            breeding_status: details.breeding_status || card.breeding_status || "",
            breeding_date: details.breeding_date || card.breeding_date || "",
            last_care: details.last_care || card.last_care || {},
            feed: details.feed || [],
            grazing_acres: details.grazing_acres == null ? "" : details.grazing_acres,
        };
    }

    function mountLivestockFields(host, source) {
        const record = source || {};
        host.replaceChildren();
        host.classList.add("farm-livestock-fields");

        const species = selectInput(LIVESTOCK_SPECIES, record.species);
        species.dataset.livestock = "species";
        species.required = true;
        host.appendChild(labeledControl("Species", species));

        const head = numberInput(record.total_head, 1);
        head.dataset.livestock = "head";
        head.required = true;
        head.min = "1";
        host.appendChild(labeledControl("Total head", head));

        const groups = document.createElement("div");
        groups.className = "farm-group-grid";
        groups.dataset.livestock = "groups";
        host.appendChild(groups);

        function paintGroups() {
            const current = {};
            groups.querySelectorAll("[data-group]").forEach((input) => {
                if (input.value !== "") {
                    current[input.dataset.group] = input.value;
                }
            });
            const saved = record.groups || {};
            groups.replaceChildren();
            (LIVESTOCK_GROUPS[species.value] || []).forEach((option) => {
                const input = numberInput(current[option[0]] != null ? current[option[0]] : saved[option[0]], 0);
                input.dataset.group = option[0];
                input.required = false;
                groups.appendChild(labeledControl(option[1], input));
            });
        }
        species.addEventListener("change", paintGroups);
        paintGroups();

        host.appendChild(labeledControl("Purpose", choiceRow("purpose", LIVESTOCK_PURPOSES, record.purpose)));
        const breed = textInput(record.breed, 100);
        breed.dataset.livestock = "breed";
        host.appendChild(labeledControl("Breed", breed));

        const acquired = document.createElement("input");
        acquired.className = "form-input";
        acquired.type = "date";
        acquired.dataset.livestock = "acquired";
        acquired.value = record.acquired_date || "";
        host.appendChild(labeledControl("Acquired", acquired));

        const breeding = selectInput([
            { value: "", label: "Breeding" },
            { value: "open", label: "Open" },
            { value: "bred", label: "Bred" },
            { value: "unknown", label: "Unknown" },
        ], record.breeding_status);
        breeding.dataset.livestock = "breeding";
        host.appendChild(labeledControl("Breeding", breeding));

        const bredOn = document.createElement("input");
        bredOn.className = "form-input";
        bredOn.type = "date";
        bredOn.dataset.livestock = "bred-on";
        bredOn.value = record.breeding_date || "";
        host.appendChild(labeledControl("Breeding date", bredOn));

        const careGrid = document.createElement("div");
        careGrid.className = "farm-group-grid";
        const lastCare = record.last_care || {};
        LIVESTOCK_CARE.forEach((option) => {
            const input = document.createElement("input");
            input.className = "form-input";
            input.type = "date";
            input.dataset.care = option[0];
            input.value = lastCare[option[0]] || "";
            careGrid.appendChild(labeledControl(option[1], input));
        });
        host.appendChild(labeledControl("Last care", careGrid));

        host.appendChild(labeledControl("Feed", choiceRow("feed", LIVESTOCK_FEED, record.feed)));
        const acres = numberInput(record.grazing_acres, 0);
        acres.dataset.livestock = "acres";
        acres.step = "0.1";
        acres.required = false;
        host.appendChild(labeledControl("Grazing acres", acres));

        return {
            read: function readLivestockFields() {
                const speciesValue = species.value;
                const headValue = Number(head.value);
                if (!speciesValue) {
                    return { error: "Choose a species." };
                }
                if (!Number.isFinite(headValue) || headValue < 1) {
                    return { error: "Enter the total head count." };
                }
                const details = {
                    species: speciesValue,
                    total_head: Math.round(headValue),
                };
                const groupCounts = {};
                groups.querySelectorAll("[data-group]").forEach((input) => {
                    if (input.value === "") {
                        return;
                    }
                    const count = Number(input.value);
                    if (Number.isFinite(count) && count > 0) {
                        groupCounts[input.dataset.group] = Math.round(count);
                    }
                });
                if (Object.keys(groupCounts).length) {
                    details.groups = groupCounts;
                }
                const purpose = checkedValues(host, "purpose");
                if (purpose.length) {
                    details.purpose = purpose;
                }
                const breedName = breed.value.trim();
                if (breedName) {
                    details.breed = breedName;
                }
                if (acquired.value) {
                    details.acquired_date = acquired.value;
                }
                if (breeding.value) {
                    details.breeding_status = breeding.value;
                }
                if (bredOn.value) {
                    details.breeding_date = bredOn.value;
                }
                const care = {};
                let hasCare = false;
                host.querySelectorAll("[data-care]").forEach((input) => {
                    care[input.dataset.care] = input.value || null;
                    if (input.value) {
                        hasCare = true;
                    }
                });
                if (hasCare) {
                    details.last_care = care;
                }
                const feed = checkedValues(host, "feed");
                if (feed.length) {
                    details.feed = feed;
                }
                if (acres.value !== "") {
                    const grazing = Number(acres.value);
                    if (Number.isFinite(grazing)) {
                        details.grazing_acres = grazing;
                    }
                }
                return { count: Math.round(headValue), livestockDetails: details };
            },
        };
    }

    function appendEditor(copy, asset) {
        const form = document.createElement("form");
        form.className = "farm-asset-editor";

        const nameInput = textInput(
            asset.kind === "Cattle" ? (asset.tagNumber || asset.title) : asset.title,
            150
        );
        nameInput.required = true;
        form.appendChild(labeledControl("Name", nameInput));

        let varietyInput = null;
        let acresInput = null;
        let detailsInput = null;
        let countInput = null;
        let livestockRead = null;

        if (asset.kind === "Cattle") {
            const livestockHost = document.createElement("div");
            livestockRead = mountLivestockFields(livestockHost, livestockSource(asset)).read;
            form.appendChild(livestockHost);
        }
        if (asset.kind === "Crops") {
            varietyInput = textInput(asset.variety || "", 100);
            acresInput = numberInput(asset.acres || "", 0);
            acresInput.step = "0.1";
            form.appendChild(labeledControl("Variety", varietyInput));
            form.appendChild(labeledControl("Acres", acresInput));
        }
        if (asset.kind === "Garden") {
            detailsInput = textInput(asset.subtitle || "", 255);
            form.appendChild(labeledControl("Details", detailsInput));
        }
        if (COUNTED_KINDS[asset.kind] && asset.kind !== "Cattle") {
            countInput = numberInput(asset.count, 0);
            countInput.dataset.count = "1";
            form.appendChild(labeledControl(countLabel(asset.kind), countInput));
        }

        const statusInput = statusSelect(asset.kind, asset.status);
        form.appendChild(labeledControl("Status", statusInput));

        const error = document.createElement("p");
        error.className = "farm-asset-error";
        error.hidden = true;
        form.appendChild(error);

        const actions = document.createElement("div");
        actions.className = "farm-asset-editor-actions";
        const save = document.createElement("button");
        save.type = "submit";
        save.className = "btn btn-primary btn-sm";
        save.textContent = "Save";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "btn btn-outline btn-sm";
        cancel.textContent = "Cancel";
        actions.appendChild(save);
        actions.appendChild(cancel);
        form.appendChild(actions);

        cancel.addEventListener("click", () => {
            editingAssetKey = "";
            renderAssets(visibleAssets(lastAssets));
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const title = nameInput.value.trim();
            if (!title) {
                error.textContent = "Name the plant, animal, or flock first.";
                error.hidden = false;
                return;
            }
            save.disabled = true;
            cancel.disabled = true;
            error.hidden = true;
            try {
                const fields = {
                    title: title,
                    status: statusInput.value,
                };
                if (livestockRead) {
                    const parsed = livestockRead();
                    if (parsed.error) {
                        error.textContent = parsed.error;
                        error.hidden = false;
                        save.disabled = false;
                        cancel.disabled = false;
                        return;
                    }
                    fields.count = parsed.count;
                    fields.livestockDetails = parsed.livestockDetails;
                }
                if (varietyInput) {
                    fields.variety = varietyInput.value.trim();
                }
                if (acresInput && acresInput.value !== "") {
                    fields.acres = Number(acresInput.value);
                }
                if (detailsInput) {
                    fields.subtitle = detailsInput.value.trim();
                }
                if (countInput && countInput.value !== "") {
                    fields.count = Number(countInput.value);
                }
                await global.AgriviaFarmApi.updateAsset(asset, fields);
                editingAssetKey = "";
                await loadFarm();
            } catch (err) {
                error.textContent = err.message || "Could not save those details.";
                error.hidden = false;
                save.disabled = false;
                cancel.disabled = false;
            }
        });

        copy.appendChild(form);
        if (focusCountOnEdit) {
            const focus = countInput || acresInput;
            if (focus) {
                global.setTimeout(() => focus.focus(), 0);
            }
            focusCountOnEdit = false;
        }
    }

    let pendingDelete = null;

    function openDeleteDialog(asset) {
        pendingDelete = asset;
        const dialog = el("farmDeleteDialog");
        const copy = el("farmDeleteCopy");
        const status = el("farmDeleteStatus");
        const confirmBtn = el("farmDeleteConfirm");
        const label = asset.title || "this item";
        if (copy) {
            copy.textContent = `Remove ${label} from this farm?`;
        }
        if (status) {
            status.textContent = "";
        }
        if (confirmBtn) {
            confirmBtn.disabled = false;
        }
        if (dialog && typeof dialog.showModal === "function" && !dialog.open) {
            dialog.showModal();
        }
    }

    async function confirmDelete(event) {
        event.preventDefault();
        const asset = pendingDelete;
        const dialog = el("farmDeleteDialog");
        const status = el("farmDeleteStatus");
        const confirmBtn = el("farmDeleteConfirm");
        if (!asset || !global.AgriviaFarmApi) {
            return;
        }
        if (confirmBtn) {
            confirmBtn.disabled = true;
        }
        try {
            await global.AgriviaFarmApi.deleteAsset(asset);
            if (editingAssetKey === assetKey(asset)) {
                editingAssetKey = "";
            }
            pendingDelete = null;
            if (dialog) {
                dialog.close();
            }
            await loadFarm();
        } catch (err) {
            if (confirmBtn) {
                confirmBtn.disabled = false;
            }
            if (status) {
                status.textContent = err.message || "Could not remove that item.";
            }
        }
    }

    function appendCardActions(copy, asset) {
        const actions = document.createElement("div");
        actions.className = "farm-asset-actions";

        const ask = document.createElement("button");
        ask.type = "button";
        ask.className = "farm-asset-ask";
        ask.textContent = "Ask Advisor →";
        const care = global.AgriviaFarmCare;
        const shownName = care && care.displayName ? (care.displayName(asset.title) || asset.title) : asset.title;
        ask.setAttribute("aria-label", `Ask Advisor about ${shownName}`);
        ask.addEventListener("click", () => {
            openAdvisor({
                assetId: asset.id,
                category: asset.kind,
                title: shownName,
            });
        });

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "farm-asset-edit";
        edit.textContent = "Edit";
        edit.setAttribute("aria-label", `Edit ${shownName}`);
        edit.addEventListener("click", () => {
            editingAssetKey = assetKey(asset);
            renderAssets(visibleAssets(lastAssets));
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "farm-asset-delete";
        remove.textContent = "Delete";
        remove.setAttribute("aria-label", `Delete ${shownName}`);
        remove.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            // Open after this click finishes. On desktop the same click
            // otherwise lands on the dialog backdrop and dismisses it at once.
            global.setTimeout(() => openDeleteDialog(asset), 0);
        });

        actions.appendChild(ask);
        actions.appendChild(edit);
        actions.appendChild(remove);
        copy.appendChild(actions);
    }

    function cardFacts(asset) {
        if (asset.kind !== "Crops") {
            return "";
        }
        const parts = [];
        if (asset.variety && !/^standard/i.test(asset.variety)) {
            parts.push(asset.variety);
        }
        const acres = formatAcres(asset.acres);
        if (acres) {
            parts.push(acres);
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
            const careApi = global.AgriviaFarmCare;
            const livestockCard = asset.livestockCard || asset.livestock_card;
            const imageUrl = careApi && careApi.illustrationFor ? careApi.illustrationFor(asset) : asset.imageUrl;
            const shownName = livestockCard && livestockCard.title
                ? livestockCard.title
                : (careApi && careApi.displayName ? (careApi.displayName(asset.title) || asset.title) : asset.title);
            const card = document.createElement("article");
            card.className = imageUrl ? "farm-asset-card has-image" : "farm-asset-card";
            if (asset.id) {
                card.dataset.assetId = asset.id;
            }

            const copy = document.createElement("div");
            copy.className = "farm-asset-copy";

            const head = document.createElement("div");
            head.className = "farm-asset-head";
            const kind = document.createElement("span");
            kind.className = "farm-asset-kind";
            kind.textContent = livestockCard && livestockCard.label ? livestockCard.label : kindLabel(asset.kind);
            head.appendChild(kind);
            if (asset.status) {
                const pill = document.createElement("span");
                pill.className = asset.status === "Planning" ? "farm-status-pill is-planning" : "farm-status-pill";
                const dot = document.createElement("span");
                dot.className = "farm-status-dot";
                dot.setAttribute("aria-hidden", "true");
                pill.appendChild(dot);
                pill.appendChild(document.createTextNode(asset.status));
                head.appendChild(pill);
            }
            copy.appendChild(head);

            const title = document.createElement("h3");
            title.textContent = shownName;
            copy.appendChild(title);

            if (editingAssetKey === assetKey(asset)) {
                card.classList.add("is-editing");
                appendEditor(copy, asset);
            } else {
                const model = careApi && careApi.normalizeAsset ? careApi.normalizeAsset(asset) : null;
                if (model && model.variety && !livestockCard) {
                    const variety = document.createElement("p");
                    variety.className = "farm-asset-variety";
                    variety.textContent = model.variety;
                    copy.appendChild(variety);
                }
                const facts = cardFacts(asset);
                const extra = document.createElement("p");
                extra.className = "farm-asset-roi";
                extra.dataset.cardFacts = "1";
                extra.textContent = facts;
                extra.hidden = !facts;
                copy.appendChild(extra);
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
                if (asset.id && global.AgriviaFarmCareUi) {
                    global.AgriviaFarmCareUi.appendCardCare(copy, asset);
                }
                appendCardActions(copy, asset);
                if (asset.id) {
                    card.classList.add("is-linked");
                    card.addEventListener("click", (event) => {
                        if (event.target.closest("button, a, input, select, textarea, label")) {
                            return;
                        }
                        const next = `farm/asset/${encodeURIComponent(asset.id)}`;
                        if (String(global.location.hash || "").replace(/^#/, "") === next) {
                            global.AgriviaFarmCareUi.openAsset(asset.id);
                            return;
                        }
                        global.location.hash = next;
                    });
                }
            }
            card.appendChild(copy);

            if (imageUrl) {
                const deco = document.createElement("div");
                deco.className = "farm-asset-deco";
                const art = document.createElement("img");
                art.src = imageUrl;
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
        const record = profile || {};
        const name = el("farmUserName");
        const email = el("farmEmail");
        const phone = el("farmPhone");
        const zip = el("farmZip");
        const address = el("farmAddress");
        paintAccountMark(record);
        if (name) {
            name.value = record.userName || (global.AgriviaAuth && global.AgriviaAuth.getName()) || "";
        }
        if (email) {
            email.value = record.email || (global.AgriviaAuth && global.AgriviaAuth.getEmail()) || "";
        }
        if (phone) {
            phone.value = record.phoneNumber || "";
        }
        if (zip) {
            zip.value = record.zipCode || "";
        }
        if (address) {
            address.value = record.address || "";
        }
    }

    async function loadFarm() {
        const guestPanel = el("farmGuest");
        const signedPanel = el("farmSigned");
        const status = el("farmStatus");
        const loadStatus = el("farmLoadStatus");
        const auth = global.AgriviaAuth;
        const signedIn = Boolean(auth && auth.isSignedIn());
        const preview = Boolean(global.AgriviaFarmPreview && global.AgriviaFarmPreview.enabled());
        setHidden(guestPanel, signedIn || preview);
        setHidden(signedPanel, !(signedIn || preview));
        if ((!signedIn && !preview) || !global.AgriviaFarmApi) {
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
        if (loadStatus && !lastAssets.length) {
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
            renderCareBanner([]);
            renderAssets(visibleAssets(lastAssets));
            renderNextQuestion(portfolio.pending);
            global.dispatchEvent(new CustomEvent("agrivia-farm-changed", { detail: { snapshot: portfolio } }));
            if (preview && loadStatus) {
                loadStatus.textContent = "Local preview. Sign-in is still required on agrivia.ai.";
                setHidden(loadStatus, false);
            } else if (portfolio.listErrors) {
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

        const deleteForm = el("farmDeleteForm");
        if (deleteForm) {
            deleteForm.addEventListener("submit", confirmDelete);
        }
        const deleteCancel = el("farmDeleteCancel");
        if (deleteCancel) {
            deleteCancel.addEventListener("click", () => {
                pendingDelete = null;
                const dialog = el("farmDeleteDialog");
                if (dialog) {
                    dialog.close();
                }
            });
        }

        const accountButton = el("accountMenuButton");
        if (accountButton) {
            accountButton.addEventListener("click", () => {
                const opening = !profileEditorOpen;
                if (opening) {
                    fillProfileForm((lastSnapshot && lastSnapshot.profile) || {
                        userName: auth.getName() || "",
                        email: auth.getEmail() || "",
                    });
                    const status = el("farmStatus");
                    if (status) {
                        status.textContent = "";
                    }
                }
                if (opening) {
                    const notify = el("farmNotify");
                    const bell = el("farmBell");
                    setHidden(notify, true);
                    if (bell) {
                        bell.setAttribute("aria-expanded", "false");
                    }
                }
                setProfileOpen(opening);
                if (opening) {
                    const name = el("farmUserName");
                    if (name) {
                        name.focus();
                    }
                }
            });
        }

        document.addEventListener("pointerdown", (event) => {
            if (!profileEditorOpen) {
                return;
            }
            const panel = el("accountMenu");
            const button = el("accountMenuButton");
            const target = event.target;
            if (panel && target instanceof Node && panel.contains(target)) {
                return;
            }
            if (button && target instanceof Node && button.contains(target)) {
                return;
            }
            setProfileOpen(false);
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && profileEditorOpen) {
                setProfileOpen(false);
                const button = el("accountMenuButton");
                if (button) {
                    button.focus();
                }
            }
        });

        const profileForm = el("farmProfileForm");
        if (profileForm) {
            profileForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                const status = el("farmStatus");
                const submitButton = event.submitter || profileForm.querySelector("button[type='submit']");
                if (submitButton) {
                    submitButton.disabled = true;
                }
                if (status) {
                    status.textContent = "Saving…";
                }
                try {
                    await global.AgriviaFarmApi.saveProfile({
                        userName: el("farmUserName").value,
                        email: el("farmEmail").value,
                        phoneNumber: el("farmPhone").value,
                        zipCode: el("farmZip").value,
                        address: el("farmAddress").value,
                    });
                    await loadFarm();
                    if (status) {
                        status.textContent = "Saved.";
                    }
                } catch (err) {
                    if (status) {
                        status.textContent = err.message || "Could not save the profile.";
                    }
                } finally {
                    if (submitButton) {
                        submitButton.disabled = false;
                    }
                }
            });
        }

        const livestockHost = el("farmLivestockFields");
        const livestockFields = livestockHost ? mountLivestockFields(livestockHost, {}) : null;
        const kindInput = el("farmAssetKind");
        function syncLivestockAdd() {
            const show = Boolean(kindInput && kindInput.value === "Cattle" && livestockHost);
            if (livestockHost) {
                livestockHost.hidden = !show;
            }
            if (!livestockHost) {
                return;
            }
            livestockHost.querySelectorAll("[data-livestock='species'], [data-livestock='head']").forEach((input) => {
                input.required = show;
            });
        }
        if (kindInput) {
            kindInput.addEventListener("change", syncLivestockAdd);
        }
        syncLivestockAdd();

        const assetForm = el("farmAssetForm");
        if (assetForm) {
            assetForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                const status = el("farmAssetStatus");
                const titleInput = el("farmAssetTitle");
                const kindSelect = el("farmAssetKind");
                const submitButton = event.submitter || assetForm.querySelector("button[type='submit']");
                const name = titleInput ? titleInput.value.trim() : "";
                const kind = kindSelect ? kindSelect.value : "";
                if (!name) {
                    if (status) {
                        status.textContent = "Name the plant, animal, or flock first.";
                    }
                    if (titleInput) {
                        titleInput.focus();
                    }
                    return;
                }
                let livestockDetails = null;
                let livestockCount = null;
                if (kind === "Cattle" && livestockFields) {
                    const parsed = livestockFields.read();
                    if (parsed.error) {
                        if (status) {
                            status.textContent = parsed.error;
                        }
                        return;
                    }
                    livestockDetails = parsed.livestockDetails;
                    livestockCount = parsed.count;
                }
                if (submitButton) {
                    submitButton.disabled = true;
                }
                if (status) {
                    status.textContent = "Saving…";
                }
                try {
                    await global.AgriviaFarmApi.addAsset(kind, name, {
                        count: livestockCount,
                        livestockDetails: livestockDetails,
                    });
                    if (titleInput) {
                        titleInput.value = "";
                    }
                    if (status) {
                        status.textContent = "Saved.";
                    }
                    await loadFarm();
                } catch (err) {
                    if (status) {
                        status.textContent = err.message || "Could not save that asset.";
                    }
                } finally {
                    if (submitButton) {
                        submitButton.disabled = false;
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
        patchCareSummary: function (assetId, summary) {
            const asset = lastAssets.find((item) => item.id === assetId);
            if (!asset || !summary) {
                return;
            }
            asset.careSummary = summary;
            const card = assetId && document.querySelector(`[data-asset-id="${CSS.escape(assetId)}"] [data-card-facts]`);
            if (card) {
                const next = cardFacts(asset);
                card.textContent = next;
                card.hidden = !next;
            }
            if (global.AgriviaFarmCareUi && global.AgriviaFarmCareUi.refreshCardFacts) {
                global.AgriviaFarmCareUi.refreshCardFacts(asset);
            }
        },
        editAsset: function (asset, focusCount) {
            editingAssetKey = assetKey(asset);
            focusCountOnEdit = Boolean(focusCount);
            renderAssets(visibleAssets(lastAssets));
        },
    };
})(window);
