// plugins/uploadToSpaces.js
const fp = require('fastify-plugin')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const crypto = require('crypto')
const path = require('path')

async function uploadToSpacesPlugin(fastify, opts) {
  const {
    maxSize = 5 * 1024 * 1024 // 5MB
  } = opts || {}

  const s3 = new S3Client({
    region: process.env.DO_SPACE_REGION,
    endpoint: process.env.DO_SPACE_ENDPOINT,
    forcePathStyle: false,
    credentials: {
      accessKeyId: process.env.DO_SPACE_KEY,
      secretAccessKey: process.env.DO_SPACE_SECRET
    }
  })

  // Sanitize filename
  const sanitizeFilename = (name) =>
    name.replace(/[^a-zA-Z0-9.\-_]/g, '').toLowerCase()

  const baseUrl =
    process.env.DO_SPACE_CDN ||
    `https://${process.env.DO_SPACE_BUCKET}.${process.env.DO_SPACE_REGION}.digitaloceanspaces.com`

  fastify.decorate(
    'uploadToSpaces',
    async ({ files, filename }) => {
      if (!files || !files.length) {
        throw new Error('No files received')
      }

      const uploaded = []

      for (const file of files) {
        const fileBuffer =
          file.file instanceof Buffer
            ? file.file
            : Buffer.from(await file.toBuffer())

        // Validate size
        if (fileBuffer.length > maxSize) {
          throw new Error(`File too large. Max allowed: ${maxSize / 1024 / 1024}MB`)
        }

        // Determine original extension
        const originalExt = path.extname(file.filename) || ''

        // Build safe filename
        let finalName
        if (filename) {
          finalName = sanitizeFilename(filename)
          if (!finalName.endsWith(originalExt)) {
            finalName += originalExt
          }
        } else {
          const base = path.basename(file.filename, originalExt)
          finalName = `${sanitizeFilename(base)}-${crypto.randomUUID()}${originalExt}`
        }

        // Folder structure by date
        const folder = new Date().toISOString().slice(0, 10)
        const objectKey = `${folder}/${finalName}`

        const uploadParams = {
          Bucket: process.env.DO_SPACE_BUCKET,
          Key: objectKey,
          Body: fileBuffer,
          ACL: 'public-read',
          ContentType: file.mimetype || 'application/octet-stream'
        }

        await s3.send(new PutObjectCommand(uploadParams))

        uploaded.push({
          url: `${baseUrl}/${objectKey}`,
          key: objectKey,
          filename: finalName,
          type: file.mimetype,
          size: fileBuffer.length
        })
      }

      return uploaded
    }
  )
}

module.exports = fp(uploadToSpacesPlugin)
