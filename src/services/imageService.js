'use strict'

/**
 * Shared helpers for linking/unlinking uploaded Images rows to a MenuItem,
 * and safely tearing down an image (Spaces object + DB row) when it's
 * replaced or its owning item is deleted. Kept storage-provider agnostic
 * from the caller's point of view - callers only ever deal with imageId.
 */

// Permanently remove an Images row and its backing file in object storage.
// Best-effort: a Spaces failure is logged (see uploadToSpaces.deleteFromSpaces)
// but never blocks the DB row from being removed.
async function deleteImage(fastify, imageId) {
  if (!imageId) return
  const prisma = fastify.prisma

  const image = await prisma.images.findUnique({ where: { id: imageId } })
  if (!image) return

  await fastify.deleteFromSpaces(image.key)
  await prisma.images.delete({ where: { id: imageId } }).catch(() => {})
}

// Point an already-uploaded Images row at the MenuItem that now uses it as
// its cover photo.
async function linkImageToMenuItem(fastify, { imageId, menuItemId }) {
  if (!imageId) return
  await fastify.prisma.images.update({ where: { id: imageId }, data: { menuItemId } }).catch(() => {})
}

// Replace a MenuItem's cover photo: delete every image currently linked to
// it (except the incoming one, in case it's already linked), then link the
// new one. Passing a falsy nextImageId just clears the old image(s).
async function replaceMenuItemImage(fastify, { menuItemId, nextImageId }) {
  const prisma = fastify.prisma
  const existing = await prisma.images.findMany({ where: { menuItemId } })

  for (const img of existing) {
    if (img.id === nextImageId) continue
    await deleteImage(fastify, img.id)
  }

  if (nextImageId) await linkImageToMenuItem(fastify, { imageId: nextImageId, menuItemId })
}

// Called before/when deleting a MenuItem - removes every image still linked
// to it so nothing orphaned is left behind in Spaces or the Images table.
async function deleteMenuItemImages(fastify, menuItemId) {
  const prisma = fastify.prisma
  const existing = await prisma.images.findMany({ where: { menuItemId } })
  for (const img of existing) {
    await deleteImage(fastify, img.id)
  }
}

module.exports = { deleteImage, linkImageToMenuItem, replaceMenuItemImage, deleteMenuItemImages }
