(function attachSyncClient(globalObject) {
  function trimTrailingSlash(value) {
    return String(value || "").trim().replace(/\/+$/g, "");
  }

  function parseJson(response) {
    return response.text().then((text) => {
      if (!text) {
        return null;
      }

      try {
        return JSON.parse(text);
      } catch (error) {
        return {
          error: text,
        };
      }
    });
  }

  function buildHeaders(deviceToken) {
    const headers = {
      "Content-Type": "application/json",
    };

    if (deviceToken) {
      headers.Authorization = `Bearer ${deviceToken}`;
    }

    return headers;
  }

  function createSyncClient(config = {}) {
    const apiBaseUrl = trimTrailingSlash(config.apiBaseUrl);

    async function request(pathname, options = {}) {
      if (!apiBaseUrl) {
        throw new Error("Cloud sync is not configured yet.");
      }

      const response = await fetch(`${apiBaseUrl}${pathname}`, options);
      const payload = await parseJson(response);

      if (!response.ok) {
        const message =
          payload?.error ||
          payload?.message ||
          `Cloud sync request failed with ${response.status}.`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }

      return payload;
    }

    return {
      isConfigured() {
        return Boolean(apiBaseUrl);
      },

      async bootstrap(appState) {
        return request("/api/session/bootstrap", {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify({ appState }),
        });
      },

      async fetchLibrary(deviceToken) {
        return request("/api/library", {
          method: "GET",
          headers: buildHeaders(deviceToken),
        });
      },

      async pushLibrary(deviceToken, appState) {
        return request("/api/library", {
          method: "PUT",
          headers: buildHeaders(deviceToken),
          body: JSON.stringify({ appState }),
        });
      },

      async createPairingCode(deviceToken) {
        return request("/api/pairing-codes", {
          method: "POST",
          headers: buildHeaders(deviceToken),
        });
      },

      async pairWithCode(code) {
        return request("/api/pair/consume", {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify({ code }),
        });
      },

      async disconnect(deviceToken) {
        return request("/api/device", {
          method: "DELETE",
          headers: buildHeaders(deviceToken),
        });
      },
    };
  }

  globalObject.SufraSyncClient = {
    createSyncClient,
  };
})(window);
