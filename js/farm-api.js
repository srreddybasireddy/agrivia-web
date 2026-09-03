/**
 * Signed-in farm profile and assets. Guests never call these.
 * Uses the same /users, /crops, /cattle, /generic_assets contracts as the apps.
 */
(function (global) {
    const config = global.AgriviaConfig;

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
            throw new Error(typeof detail === "string" ? detail : "The farm API could not save that.");
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

    async function getProfile() {
        const farmUuid = requireFarmUuid();
        return request(`/users/${farmUuid}/profile`, { method: "GET" });
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
        saveProfile: saveProfile,
        addAsset: addAsset,
    };
})(window);
