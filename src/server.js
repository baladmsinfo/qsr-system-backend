'use strict'
require('dotenv').config()

const fastify = require('fastify')({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty' }
  },
  ajv: {
    customOptions: {
      strict: false,
      keywords: ['example']
    }
  }
})

const view = require("@fastify/view");
const ejs = require("ejs");
const path = require("path");

fastify.register(view, {
  engine: { ejs },
  root: path.join(__dirname, "views"),
  viewExt: "ejs",
});

fastify.register(require("./plugins/env"));

fastify.ready((err) => {
  if (err) throw err;
  console.log("Config loaded:", fastify.config);
});

fastify.after(async () => {

  const multipart = require("@fastify/multipart");

  fastify.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5 MB
    },
  });

  const rateLimit = require('@fastify/rate-limit')
  fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  })

  // Swagger
  fastify.register(require('@fastify/swagger'), {
    openapi: {
      info: {
        title: 'My API Docs',
        description: 'API documentation for my Fastify project',
        version: '1.0.0'
      },
      servers: [{ url: 'http://localhost:8080', description: 'Local server' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      },
      security: [{ bearerAuth: [] }] // apply globally
    }
  })

  fastify.register(require('@fastify/swagger-ui'), {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'none',
      deepLinking: false
    }
  })

  const uploadToSpacesPlugin = require("./plugins/uploadToSpaces");
  fastify.register(uploadToSpacesPlugin);

  // Common plugins
  fastify.register(require('@fastify/helmet'))

  fastify.register(require('@fastify/cors'), {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      'X-API-Key'
    ],
  })

  // App plugins
  fastify.register(require('./plugins/prisma'))

  fastify.register(require('./plugins/auth'))

  fastify.register(require('./plugins/socket'))

  fastify.addHook("preHandler", async (req, reply) => {
    console.log("Request URL:", req.raw.url);
    let publicPaths;
    publicPaths = [
      "/public/",
      "/public/assets/js/",
      "/public/output.css",
      "/api/users/login",
      "/api/users/register",
      "/api/users/check-tenant",
      "/api/users/currencies",
      "/api/public/",
      "/api/payment/callback",
      "/socket.io/",
      "/docs",
      "/images",
    ];
    console.log("ENV", fastify.config.ENV)
    console.log(publicPaths, "public paths")

    if (publicPaths.some((path) => req.raw.url.startsWith(path))) {
      return;
    }

    try {
      console.log("Requests:", req.headers["x-api-key"]);

      const apiKey = req.headers["x-api-key"];
      const bearer = req.headers["authorization"]?.split(" ")[1];

      if (apiKey) {
        const company = await fastify.prisma.company.findFirst({
          where: {
            OR: [
              { publicapiKey: apiKey },
              { tenant: apiKey }
            ]
          },
          include: {
            users: true,
            currency: true,
          },
        });

        req.log.info(`Accessed ${req.raw.url} using API Key`);

        if (!company) {
          return reply.code(403).send({ error: "Invalid API Key" });
        }

        req.company = company;
        req.companyId = company.id;
        req.role = "STOREADMIN";

        console.log(req.user, "req from user");


        return;
      }

      if (bearer) {
        try {
          // ✅ JWT logic (User/Admin)
          const decoded = fastify.jwt.verify(bearer);
          console.log(decoded);
          req.user = decoded;
          req.role = decoded.role;
          req.companyId = decoded.companyId;

          if (decoded.branchId) {
            req.branchId = decoded.branchId;
          }

          req.log.info(
            `Accessed ${req.raw.url} by ${req.headers["token"] || "MID- " + req.merchantId
            }`
          );

          return;
        } catch (err) {
          return reply.code(401).send({ error: "Invalid token" });
        }
      }
      return reply.code(401).send({
        statusCode: "05",
        message: "Missing Authorization or API Key",
      });
    } catch (err) {
      return reply
        .code(401)
        .send({ statusCode: "05", message: "Unauthorized" });
    }
  });

  // Routes
  fastify.register(require('./routes/users'), { prefix: '/api/users' })
  fastify.register(require('./routes/account'), { prefix: '/api/account' })
  fastify.register(require('./routes/expense'), { prefix: '/api/expenses' })
  fastify.register(require('./routes/companies'), { prefix: '/api/company' })
  fastify.register(require("./routes/subscription"));
  fastify.register(require('./routes/payment'), { prefix: '/api/payments' })
  fastify.register(require('./routes/callback'), { prefix: '/api' })
  fastify.register(require('./routes/reports'), { prefix: '/api/reports' })
  fastify.register(require('./routes/customers'), { prefix: '/api/customers' })
  fastify.register(require('./routes/vendor'), { prefix: '/api/vendor' })
  fastify.register(require('./routes/purchases'), { prefix: '/api/purchases' })
  fastify.register(require('./routes/dashboard-reports'))
  fastify.register(require('./routes/taxRates'), { prefix: '/api/tax-rates' })
  fastify.register(require('./routes/upload'), { prefix: '/api' });

  // Restaurant platform
  fastify.register(require('./routes/menu-categories'), { prefix: '/api/menu-categories' })
  fastify.register(require('./routes/menu-items'), { prefix: '/api/menu-items' })
  fastify.register(require('./routes/tables'), { prefix: '/api/tables' })
  fastify.register(require('./routes/orders'), { prefix: '/api/orders' })
  fastify.register(require('./routes/kitchen'), { prefix: '/api/kitchen' })
  fastify.register(require('./routes/pos'), { prefix: '/api/pos' })
  fastify.register(require('./routes/public'), { prefix: '/api/public' })
  fastify.register(require('./routes/customerAccount'), { prefix: '/api/customer' })

  fastify.register(require("./plugins/subscription.js"), {
    SUBSCRIPTION_BASE_URL: fastify.config.SUBSCRIPTION_BASE_URL,
    SUBSCRIPTION_APIKEY: fastify.config.SUBSCRIPTION_APIKEY,
  });

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error)
    if (error.validation) {
      return reply.status(400).send({ error: 'Validation error', details: error.validation })
    }
    const status = error.statusCode || 500
    reply.status(status).send({ error: error.message || 'Internal Server Error' })
  })

  const start = async () => {
    try {
      const port = fastify.config.PORT || 8081
      const host = fastify.config.host || "0.0.0.0"
      await fastify.listen({ port, host: host })
      fastify.log.info(`Server listening on http://${host}:${port}`)
    } catch (err) {
      fastify.log.error(err)
      process.exit(1)
    }
  }
  start()
})