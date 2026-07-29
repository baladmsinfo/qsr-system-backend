// Deploy provider: DigitalOcean Spaces static website hosting + CDN.
//
// Why Spaces and not DigitalOcean App Platform: App Platform only deploys
// from a Git repo or container image - there's no "upload a folder of static
// files" API, so it doesn't fit "publish this generated static site" without
// adding a GitHub/GitLab integration or a Docker build step. Spaces is
// S3-compatible object storage with a static-website-hosting mode and a CDN
// in front - "deploy" is just PutObject calls, using the same S3 client
// pattern already proven in plugins/uploadToSpaces.js.
//
// Layout in the bucket (DO_SPACE_SITES_BUCKET, a DEDICATED bucket - kept
// separate from the existing asset bucket so enabling static-website-hosting
// mode on it doesn't affect normal asset URLs):
//   sites/{websiteId}/versions/{version}/...   <- every publish, kept forever (rollback source)
//   sites/{websiteId}/live/...                 <- what the CDN actually serves; a publish or
//                                                  rollback is just re-copying a version's
//                                                  objects on top of this prefix
const { S3Client, PutObjectCommand, CopyObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");

function getClient() {
  return new S3Client({
    region: process.env.DO_SPACE_REGION,
    endpoint: process.env.DO_SPACE_ENDPOINT,
    forcePathStyle: false,
    credentials: {
      accessKeyId: process.env.DO_SPACE_KEY,
      secretAccessKey: process.env.DO_SPACE_SECRET,
    },
  });
}

function bucketConfig() {
  const bucket = process.env.DO_SPACE_SITES_BUCKET;
  const cdnBase = process.env.DO_SPACE_SITES_CDN || `https://${bucket}.${process.env.DO_SPACE_REGION}.cdn.digitaloceanspaces.com`;
  return { bucket, cdnBase };
}

async function uploadFiles(s3, bucket, prefix, files) {
  for (const file of files) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${prefix}/${file.path}`,
        Body: file.content,
        ACL: "public-read",
        ContentType: file.contentType || "application/octet-stream",
      })
    );
  }
}

async function listAllKeys(s3, bucket, prefix) {
  const keys = [];
  let continuationToken;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }));
    (res.Contents || []).forEach((obj) => keys.push(obj.Key));
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function clearPrefix(s3, bucket, prefix) {
  const keys = await listAllKeys(s3, bucket, prefix);
  if (!keys.length) return;
  // DeleteObjects takes at most 1000 keys per call.
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk.map((Key) => ({ Key })) } }));
  }
}

async function copyPrefix(s3, bucket, fromPrefix, toPrefix) {
  const keys = await listAllKeys(s3, bucket, fromPrefix);
  for (const key of keys) {
    const relative = key.slice(fromPrefix.length);
    await s3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `/${bucket}/${key}`,
        Key: `${toPrefix}${relative}`,
        ACL: "public-read",
      })
    );
  }
}

// Uploads a version, then copies it into live/ (what's actually served).
// Returns the CDN preview URL - this is real, working, automatic HTTPS from
// DigitalOcean's own certificate on the CDN's own domain, unlike a custom
// domain (which needs its own cert - out of scope for this pass, see plan).
//
// The URL points at index.html explicitly, not just the bare `live/`
// directory: Spaces only resolves a directory path to its index document
// when static-website-hosting mode is turned on for the bucket (a control-
// panel/separate-API setting, not something the S3-compatible PutObject
// API can turn on) - without it, GETting a path with no matching object key
// returns AccessDenied (Spaces' quirk - not 404) instead of the page.
async function deploy({ websiteId, version, files }) {
  const s3 = getClient();
  const { bucket, cdnBase } = bucketConfig();
  const versionPrefix = `sites/${websiteId}/versions/${version}`;
  const livePrefix = `sites/${websiteId}/live`;

  await uploadFiles(s3, bucket, versionPrefix, files);
  await clearPrefix(s3, bucket, livePrefix);
  await copyPrefix(s3, bucket, `${versionPrefix}/`, `${livePrefix}/`);

  return { previewUrl: `${cdnBase}/sites/${websiteId}/live/index.html` };
}

// Rollback: re-copy an already-uploaded older version's objects into live/ -
// no regeneration needed, the old version's files are still in Spaces.
async function rollback({ websiteId, version }) {
  const s3 = getClient();
  const { bucket, cdnBase } = bucketConfig();
  const versionPrefix = `sites/${websiteId}/versions/${version}`;
  const livePrefix = `sites/${websiteId}/live`;

  const exists = await listAllKeys(s3, bucket, `${versionPrefix}/`);
  if (!exists.length) throw new Error(`No uploaded files found for version ${version}`);

  await clearPrefix(s3, bucket, livePrefix);
  await copyPrefix(s3, bucket, `${versionPrefix}/`, `${livePrefix}/`);

  return { previewUrl: `${cdnBase}/sites/${websiteId}/live/index.html` };
}

module.exports = { deploy, rollback };
