/**
 * Website API config. Paths match iOS/Android BackendConfig:
 *   prodApiURL = https://api.agrivia.ai/api
 *
 * On agrivia.ai the page calls same-origin /api/* (Cloudflare Worker + rate limit).
 * Local preview calls the origin API directly.
 */
(function (global) {
    const host = global.location && global.location.hostname;
    const useWorker = host === "agrivia.ai" || host === "www.agrivia.ai";

    global.AgriviaConfig = {
        apiBasePath: useWorker ? "/api" : "https://api.agrivia.ai/api",
        category: "General",
        deviceUuidStorageKey: "agrivia_web_device_uuid",
        chatTimeoutMs: 60000,
        welcomeTimeoutMs: 15000,
        rateTimeoutMs: 15000,
        maxQueryLength: 2000,
        // Public OAuth Web client ID (not a secret). Backend must use the same value.
        googleClientId: "642954020467-89m9n76f5lpir54vb82qqbks5315v36f.apps.googleusercontent.com",
        sessionStorageKey: "agrivia_web_session",
        farmUuidStorageKey: "agrivia_web_farm_uuid",
    };
})(window);
