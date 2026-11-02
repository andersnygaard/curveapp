#!/usr/bin/env node
// File transfer for the linear-task skill, which linear.mjs does not cover.
//   upload <file>          stores the file in Linear and prints the asset URL to use in Markdown
//   download <url> <out>   saves a file linked from an issue or comment
// The key is found the same way as in linear.mjs and is never printed. It is sent only to
// api.linear.app and uploads.linear.app. Uploads go to a signed URL that does not carry it.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

const ENDPOINT = 'https://api.linear.app/graphql';
const KEY_FILE = process.env.LINEAR_KEY_FILE || 'C:\\code\\linear.key.txt';
const ASSET_HOST = 'uploads.linear.app';
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const FILE_UPLOAD = `mutation($contentType: String!, $filename: String!, $size: Int!) {
  fileUpload(contentType: $contentType, filename: $filename, size: $size) {
    uploadFile { uploadUrl assetUrl headers { key value } }
  }
}`;

function auth() {
  const raw = process.env.LINEAR_API_KEY || readFileSync(KEY_FILE, 'utf8');
  const m = raw.match(/lin_(api|oauth)_[A-Za-z0-9]+/);
  const key = m ? m[0] : raw.trim();
  return key.startsWith('lin_oauth_') ? `Bearer ${key}` : key;
}

async function upload(path) {
  const body = readFileSync(path);
  const contentType = TYPES[extname(path).toLowerCase()] || 'application/octet-stream';
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth() },
    body: JSON.stringify({ query: FILE_UPLOAD, variables: { contentType, filename: basename(path), size: body.length } }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('\n'));
  const { uploadUrl, assetUrl, headers } = json.data.fileUpload.uploadFile;

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, ...Object.fromEntries(headers.map(h => [h.key, h.value])) },
    body,
  });
  if (!put.ok) throw new Error(`upload failed: HTTP ${put.status}`);
  console.log(assetUrl);
}

async function download(url, out) {
  if (new URL(url).hostname !== ASSET_HOST) throw new Error(`only ${ASSET_HOST} links get the key, not ${url}`);
  const res = await fetch(url, { headers: { Authorization: auth() } });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(out);
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'upload' && args.length === 1) await upload(args[0]);
  else if (command === 'download' && args.length === 2) await download(args[0], args[1]);
  else throw new Error('usage: linear-files.mjs upload <file> | download <url> <out>');
} catch (e) {
  // exitCode, not process.exit: exiting while fetch handles are open trips a libuv assertion on Windows.
  console.error(`linear-files: ${e.message}`);
  process.exitCode = 1;
}
