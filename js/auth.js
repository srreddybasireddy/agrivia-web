/**
 * Optional Google session for the website.
 * Guest chat still uses agrivia_web_device_uuid. Apps do not use this module.
 */
(function (global) {
    const config = global.AgriviaConfig;
    const SESSION_KEY = "agrivia_web_session";
    const FARM_UUID_KEY = "agrivia_web_farm_uuid";
    const EMAIL_KEY = "agrivia_web_email";
    const NAME_KEY = "agrivia_web_name";

    function apiUrl(path) {
        return `${config.apiBasePath}${path}`;
    }

    function read(key) {
        try {
            return localStorage.getItem(key);
        } catch (err) {
            return null;
        }
    }

    function write(key, value) {
        try {
            if (value) {
                localStorage.setItem(key, value);
            } else {
                localStorage.removeItem(key);
            }
        } catch (err) {
            // private mode
        }
    }

    function isSignedIn() {
        return Boolean(read(SESSION_KEY) && read(FARM_UUID_KEY));
    }

    function getFarmUuid() {
        const value = read(FARM_UUID_KEY);
        return value || null;
    }

    function getSessionToken() {
        return read(SESSION_KEY);
    }

    function getEmail() {
        return read(EMAIL_KEY);
    }

    function getName() {
        return read(NAME_KEY);
    }

    function notify() {
        global.dispatchEvent(new CustomEvent("agrivia-auth-changed", {
            detail: { signedIn: isSignedIn(), farmUuid: getFarmUuid() },
        }));
    }

    function clearSession() {
        write(SESSION_KEY, null);
        write(FARM_UUID_KEY, null);
        write(EMAIL_KEY, null);
        write(NAME_KEY, null);
        notify();
    }

    async function fetchAuthConfig() {
        try {
            const response = await fetch(apiUrl("/auth/config"), {
                headers: { Accept: "application/json" },
            });
            if (!response.ok) {
                return { enabled: false, clientId: config.googleClientId || "" };
            }
            const data = await response.json();
            const clientId = data.clientId || config.googleClientId || "";
            return {
                enabled: Boolean(data.enabled) || Boolean(clientId),
                clientId: clientId,
            };
        } catch (err) {
            return { enabled: Boolean(config.googleClientId), clientId: config.googleClientId || "" };
        }
    }

    async function signInWithGoogleToken(idToken) {
        const response = await fetch(apiUrl("/auth/google"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({ idToken: idToken }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.detail || data.error || "Google sign-in failed.");
        }
        write(SESSION_KEY, data.sessionToken);
        write(FARM_UUID_KEY, data.deviceUuid);
        write(EMAIL_KEY, data.email || "");
        write(NAME_KEY, data.userName || "");
        notify();
        return data;
    }

    async function signOut() {
        try {
            await fetch(apiUrl("/auth/logout"), { method: "POST", headers: { Accept: "application/json" } });
        } catch (err) {
            // still clear local session
        }
        clearSession();
    }

    function loadGis(callback) {
        if (global.google && global.google.accounts && global.google.accounts.id) {
            callback();
            return;
        }
        const existing = document.querySelector("script[data-agrivia-gis]");
        if (existing) {
            existing.addEventListener("load", callback, { once: true });
            return;
        }
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.setAttribute("data-agrivia-gis", "true");
        script.addEventListener("load", callback, { once: true });
        document.head.appendChild(script);
    }

    function renderGoogleButton(container, clientId) {
        if (!container || !clientId) {
            return;
        }
        loadGis(() => {
            if (!global.google || !global.google.accounts || !global.google.accounts.id) {
                return;
            }
            global.google.accounts.id.initialize({
                client_id: clientId,
                callback: (response) => {
                    signInWithGoogleToken(response.credential).catch((err) => {
                        container.setAttribute("data-auth-error", err.message || "Sign-in failed.");
                    });
                },
            });
            container.replaceChildren();
            global.google.accounts.id.renderButton(container, {
                theme: "outline",
                size: "medium",
                type: "standard",
                text: "signin_with",
                shape: "pill",
            });
        });
    }

    global.AgriviaAuth = {
        isSignedIn: isSignedIn,
        getFarmUuid: getFarmUuid,
        getSessionToken: getSessionToken,
        getEmail: getEmail,
        getName: getName,
        fetchAuthConfig: fetchAuthConfig,
        signInWithGoogleToken: signInWithGoogleToken,
        signOut: signOut,
        renderGoogleButton: renderGoogleButton,
        clearSession: clearSession,
    };
})(window);
