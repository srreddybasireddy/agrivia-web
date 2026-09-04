/**
 * Signed-in farm profile and assets. Guests never call these.
 * Uses the same /users, /crops, /cattle, /generic_assets contracts as the apps.
 */
(function (global) {
    const config = global.AgriviaConfig;
    const GENERIC_CATEGORIES = (config && config.genericAssetCategories) || [
        "Garden",
        "Poultry & Eggs",
        "Birds & Bees",
        "Fish & Shrimp",
    ];

    function apiUrl(path) {
        return `${config.apiBasePath}${path}`;
    }

    async function parseJson(response) {
        const text = await response.text();
        if (!text) {
            return {};
        }
        try {
            return JSON.parse(text);
        } catch (err) {
            throw new Error("Unexpected response from the farm API.");
        }
    }

    async function request(path, options) {
        const response = await fetch(apiUrl(path), {
            ...options,
            headers: {
                Accept: "application/json",
                ...(options && options.headers ? options.headers : {}),
            },
        });
        const data = await parseJson(response);
        if (!response.ok) {
            const detail = data.detail || data.error || data.message;
            throw new Error(typeof detail === "string" ? detail : "The farm API could not complete that request.");
        }
        return data;
    }

    function requireFarmUuid() {
        const auth = global.AgriviaAuth;
        const farmUuid = auth && auth.getFarmUuid();
        if (!farmUuid) {
            throw new Error("Sign in to save a farm profile.");
        }
        return farmUuid;
    }

    function asArray(data, key) {
        const value = data && data[key];
        return Array.isArray(value) ? value : [];
    }

    function settledValue(result, fallback) {
        return result.status === "fulfilled" ? result.value : fallback;
    }

    function readText(value) {
        if (typeof value !== "string") {
            return "";
        }
        return value.trim();
    }

    const NEVER_TITLE_TOKENS = {
        not: true, sure: true, none: true, nothing: true, skip: true,
        yet: true, will: true, try: true, trying: true, gonna: true, going: true,
        still: true, already: true, just: true, planned: true, planning: true,
        planted: true, everyday: true, daily: true, weekly: true,
        water: true, watering: true, watern: true, evening: true, morning: true,
        help: true, please: true, need: true, setup: true,
        same: true, like: true, similar: true, other: true, others: true, also: true,
    };

    function isPlausibleAssetTitle(title) {
        const tokens = String(title || "").toLowerCase().match(/[a-z]+/g) || [];
        if (!tokens.length) {
            return false;
        }
        return tokens.some((token) => !NEVER_TITLE_TOKENS[token]);
    }

    function readRoi(container) {
        if (!container || typeof container !== "object") {
            return "";
        }
        const direct = readText(container.roi_estimate || container.roiEstimate);
        if (direct) {
            return direct;
        }
        const stats = container.performance_stats || container.performanceStats;
        if (!Array.isArray(stats)) {
            return "";
        }
        const hit = stats.find((stat) => {
            if (!stat || typeof stat !== "object") {
                return false;
            }
            const key = stat.key || stat.id;
            return key === "roi_estimate" || key === "roiEstimate";
        });
        return hit ? readText(hit.value || hit.displayValue) : "";
    }

    function operationalOf(item) {
        return (item && (item.operational_details || item.operationalDetails || item.extra_details || item.extraDetails)) || {};
    }

    function emptyProfile() {
        return {
            userName: "",
            email: "",
            phoneNumber: "",
            zipCode: "",
            address: "",
            farmSizeAcres: 0,
            totalLivestock: 0,
            totalCrops: 0,
            totalGarden: 0,
            totalPoultry: 0,
            totalBirdsBees: 0,
            totalFishShrimp: 0,
        };
    }

    function normalizeProfile(raw) {
        const source = raw || {};
        return {
            userName: readText(source.userName),
            email: readText(source.email),
            phoneNumber: readText(source.phoneNumber),
            zipCode: readText(source.zipCode),
            address: readText(source.address),
            farmSizeAcres: Number(source.farmSizeAcres) || 0,
            totalLivestock: Number(source.totalLivestock) || 0,
            totalCrops: Number(source.totalCrops) || 0,
            totalGarden: Number(source.totalGarden) || 0,
            totalPoultry: Number(source.totalPoultry) || 0,
            totalBirdsBees: Number(source.totalBirdsBees) || 0,
            totalFishShrimp: Number(source.totalFishShrimp) || 0,
        };
    }

    function mapCrop(crop) {
        const ops = operationalOf(crop);
        return {
            id: String(crop.id || ""),
            kind: "Crops",
            title: readText(crop.name) || "Crop",
            variety: readText(crop.variety),
            status: readText(crop.status),
            acres: Number(crop.acres) || 0,
            plantedDate: crop.planted_date || crop.plantedDate || "",
            harvestDate: crop.estimated_harvest_date || crop.estimatedHarvestDate || "",
            subtitle: "",
            roiEstimate: readRoi(ops),
            healthAlerts: "",
        };
    }

    function mapGeneric(asset, kind) {
        const extra = operationalOf(asset);
        return {
            id: String(asset.id || ""),
            kind: kind,
            title: readText(asset.title) || kind,
            variety: "",
            status: readText(asset.status),
            acres: 0,
            plantedDate: "",
            harvestDate: "",
            subtitle: readText(asset.subtitle),
            roiEstimate: readRoi(extra),
            healthAlerts: "",
        };
    }

    function groupCattle(rows) {
        const groups = new Map();
        rows.forEach((row) => {
            const tag = readText(row.tag_number || row.tagNumber) || "Cattle";
            const breed = readText(row.breed);
            const key = `${tag.toLowerCase()}|${breed.toLowerCase()}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    id: String(row.id || key),
                    kind: "Cattle",
                    title: breed && breed.toLowerCase() !== tag.toLowerCase() ? `${tag} · ${breed}` : tag,
                    variety: breed,
                    status: readText(row.status),
                    acres: 0,
                    plantedDate: "",
                    harvestDate: "",
                    subtitle: "",
                    roiEstimate: readRoi(operationalOf(row)),
                    healthAlerts: "",
                    count: 0,
                });
            }
            const group = groups.get(key);
            group.count += 1;
            const alerts = row.health_alerts || row.healthAlerts;
            if (typeof alerts === "string" && alerts.trim()) {
                group.healthAlerts = group.healthAlerts ? `${group.healthAlerts}; ${alerts.trim()}` : alerts.trim();
            } else if (Array.isArray(alerts) && alerts.length) {
                const joined = alerts.filter((item) => typeof item === "string" && item.trim()).join("; ");
                if (joined) {
                    group.healthAlerts = group.healthAlerts ? `${group.healthAlerts}; ${joined}` : joined;
                }
            }
        });
        return Array.from(groups.values()).map((group) => {
            group.subtitle = group.count === 1 ? "1 head" : `${group.count} head`;
            return group;
        });
    }

    async function getProfile() {
        const farmUuid = requireFarmUuid();
        return request(`/users/${farmUuid}/profile`, { method: "GET" });
    }

    async function getCrops() {
        const farmUuid = requireFarmUuid();
        const data = await request(`/crops/${farmUuid}`, { method: "GET" });
        return asArray(data, "crops");
    }

    async function getCattle() {
        const farmUuid = requireFarmUuid();
        const data = await request(`/cattle/${farmUuid}`, { method: "GET" });
        return asArray(data, "cattle");
    }

    async function getGenericAssets(category) {
        const farmUuid = requireFarmUuid();
        const data = await request(
            `/generic_assets/${farmUuid}/${encodeURIComponent(category)}`,
            { method: "GET" }
        );
        return asArray(data, "assets");
    }

    async function getPendingDetails() {
        const farmUuid = requireFarmUuid();
        return request(`/users/${farmUuid}/pending-details`, { method: "GET" });
    }

    async function getPortfolio() {
        requireFarmUuid();
        const settled = await Promise.allSettled([
            getProfile(),
            getCrops(),
            getCattle(),
            getPendingDetails(),
            ...GENERIC_CATEGORIES.map((category) => getGenericAssets(category)),
        ]);
        const profileRaw = settledValue(settled[0], null);
        if (!profileRaw && settled[0].status === "rejected") {
            throw settled[0].reason;
        }
        const crops = settledValue(settled[1], []).map(mapCrop);
        const cattle = groupCattle(settledValue(settled[2], []));
        const pending = settledValue(settled[3], null);
        const generic = GENERIC_CATEGORIES.flatMap((category, index) => {
            return settledValue(settled[4 + index], []).map((asset) => mapGeneric(asset, category));
        });
        return {
            profile: normalizeProfile(profileRaw) || emptyProfile(),
            assets: crops.concat(cattle, generic).filter((asset) => {
                if (!asset.id && !asset.title) {
                    return false;
                }
                if (asset.kind === "Crops" || asset.kind === "Garden") {
                    return isPlausibleAssetTitle(asset.title);
                }
                return true;
            }),
            pending: pending,
            listErrors: settled.slice(1).some((result) => result.status === "rejected"),
        };
    }

    function totalsFingerprint(profile) {
        const p = profile || emptyProfile();
        return [
            p.farmSizeAcres,
            p.totalCrops,
            p.totalLivestock,
            p.totalGarden,
            p.totalPoultry,
            p.totalBirdsBees,
            p.totalFishShrimp,
        ].join("|");
    }

    function diffPortfolio(before, after) {
        const previous = (before && before.assets) || [];
        const next = (after && after.assets) || [];
        const seen = new Set(previous.map((asset) => `${asset.kind}:${asset.id}`));
        const added = next.filter((asset) => asset.id && !seen.has(`${asset.kind}:${asset.id}`));
        const totalsChanged = totalsFingerprint(before && before.profile) !== totalsFingerprint(after && after.profile);
        return {
            added: added,
            totalsChanged: totalsChanged,
        };
    }

    async function saveProfile(fields) {
        const farmUuid = requireFarmUuid();
        return request("/users", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                deviceUuid: farmUuid,
                userName: fields.userName || "",
                email: fields.email || "",
                phoneNumber: fields.phoneNumber || "",
                zipCode: fields.zipCode || "",
                address: fields.address || "",
            }),
        });
    }

    async function addAsset(kind, title) {
        const farmUuid = requireFarmUuid();
        const name = (title || "").trim();
        if (!name) {
            throw new Error("Name the plant, animal, or flock first.");
        }
        if (kind === "Cattle") {
            return request("/cattle", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    deviceUuid: farmUuid,
                    tagNumber: name.slice(0, 50),
                    breed: "Mixed",
                    ageMonths: 0,
                    status: "Healthy",
                }),
            });
        }
        if (kind === "Crops") {
            return request("/crops", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    deviceUuid: farmUuid,
                    name: name,
                    variety: "Standard",
                    acres: 0,
                    plantedDate: new Date().toISOString(),
                    status: "Planted",
                }),
            });
        }
        return request("/generic_assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                deviceUuid: farmUuid,
                category: kind,
                title: name,
                status: "Active",
                statusColorName: "green",
            }),
        });
    }

    global.AgriviaFarmApi = {
        getProfile: getProfile,
        getCrops: getCrops,
        getCattle: getCattle,
        getGenericAssets: getGenericAssets,
        getPendingDetails: getPendingDetails,
        getPortfolio: getPortfolio,
        diffPortfolio: diffPortfolio,
        saveProfile: saveProfile,
        addAsset: addAsset,
        genericCategories: GENERIC_CATEGORIES,
    };
})(window);
