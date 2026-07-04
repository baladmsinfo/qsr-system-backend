// plugins/axiosIsg.js
const fp = require("fastify-plugin");
const axios = require("axios");

async function subscriptionPlugin(fastify, opts) {
  console.log("subscriptionPlugin root url-", opts.SUBSCRIPTION_BASE_URL);
  const Axios = axios.create({
    baseURL: opts.SUBSCRIPTION_BASE_URL || undefined,
    timeout: opts.timeout || 5000,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.SUBSCRIPTION_APIKEY,
      ...(opts.headers || {}),
    },
  });

  // Log outgoing requests
  Axios.interceptors.request.use(
    (config) => {
      fastify.log.debug(
        { url: config.url, method: config.method },
        "subscription API Request"
      );
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Log responses and errors
  Axios.interceptors.response.use(
    (response) => response.data, // return only response data
    (error) => {
      fastify.log.error(error, "subscription API Error");
      return Promise.reject(error);
    }
  );

  // Attach raw axios instance (optional)
  fastify.decorate("subscriptionAxios", Axios);

  // POST helper
  fastify.decorate("initiate", async function (data = {}, config = {}) {
    try {
      console.log("Request body received:", data);
      let response = await Axios.post("/subscriptions/initiate", data, config);
      return response;
    } catch (err) {
      fastify.log.error(err, "subscriptionAxiosPost error");
      return {
        statusCode: "03",
        message: "Unable to initiate",
      };
    }
  });

  fastify.decorate("updateMandate", async function (data = {}, config = {}) {
    try {
      console.log("Request body received:", data);
      let response = await Axios.post(
        "/subscriptions/updateMandate",
        data,
        config
      );
      return response;
    } catch (err) {
      fastify.log.error(err, "subscriptionAxiosPost error");
      return {
        statusCode: "03",
        message: "Unable to initiate",
      };
    }
  });

  fastify.decorate("getPlan", async function (SUBS_PRODUCT_ID, baseURL, apiKey, config = {}) {
    try {
      console.log("Subscription", SUBS_PRODUCT_ID, baseURL, apiKey);
      
      const url = `${baseURL}/plans/products/${SUBS_PRODUCT_ID}/plans`;
      const headers = {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      };

      const response = await axios.get(url, {
        headers,
        timeout: 5000,
        ...config,
      });

      fastify.log.info("Fetched plans:", response.data);
      return response.data.plans;
    } catch (err) {
      fastify.log.error(err, "getPlan error");
      throw err;
    }
  });

  // PUT helper
  fastify.decorate(
    "subscriptionAxiosPut",
    async function (url, data = {}, config = {}) {
      try {
        return await Axios.put(url, data, config);
      } catch (err) {
        fastify.log.error(err, "subscriptionAxiosPut error");
        throw err;
      }
    }
  );

  // DELETE helper
  fastify.decorate(
    "subscriptionAxiosDelete",
    async function (url, config = {}) {
      try {
        return await Axios.delete(url, config);
      } catch (err) {
        fastify.log.error(err, "subscriptionAxiosDelete error");
        throw err;
      }
    }
  );

  fastify.log.info("✅ subscriptionAxios plugin registered");
}

module.exports = fp(subscriptionPlugin, {
  name: "subscriptionAxios-plugin",
});
