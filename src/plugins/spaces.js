const AWS = require('aws-sdk')
const fp = require('fastify-plugin')

async function spacesPlugin(fastify) {
  const spacesEndpoint = new AWS.Endpoint(process.env.DO_SPACE_ENDPOINT)
  const s3 = new AWS.S3({
    endpoint: spacesEndpoint,
    accessKeyId: process.env.DO_SPACE_KEY,
    secretAccessKey: process.env.DO_SPACE_SECRET,
    region: process.env.DO_SPACE_REGION
  })

  fastify.decorate('spaces', s3)
}

module.exports = fp(spacesPlugin)
