/**
 * Website API config. Paths match iOS/Android BackendConfig:
 *   prodApiURL = https://api.agrivia.ai/api
 *
 * Call the origin API directly so chat works from S3 and local preview.
 * After the Cloudflare Worker route (agrivia.ai/api/*) is live, switch
 * apiBasePath to "/api" to enforce the 1–2 rps cap at the edge.
 */
window.AgriviaConfig = {
    apiBasePath: "https://api.agrivia.ai/api",
    category: "General",
    deviceUuidStorageKey: "agrivia_web_device_uuid",
    chatTimeoutMs: 60000,
    welcomeTimeoutMs: 15000,
    rateTimeoutMs: 15000,
    maxQueryLength: 2000,
};
