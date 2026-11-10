import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

export interface ReceiptObjectStorage {
  put(key:string,bytes:Buffer,mimeType:string,hash:string):Promise<void>;
  get(key:string):Promise<{body:Readable; mimeType:string}>;
  delete(key:string):Promise<void>;
}
export type RailwayBucketSettings = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  urlStyle: 'virtual' | 'path';
};

/**
 * Private Railway Bucket S3 configuration. The STORAGE_* names are ours;
 * AWS_* aliases match the credentials exported by Railway's bucket CLI.
 */
export function readRailwayBucketSettings(env: NodeJS.ProcessEnv = process.env): RailwayBucketSettings | null {
  const bucket = env.STORAGE_BUCKET || env.AWS_S3_BUCKET_NAME || env.BUCKET;
  const endpoint = env.STORAGE_ENDPOINT || env.AWS_ENDPOINT_URL || env.ENDPOINT;
  const region = env.STORAGE_REGION || env.AWS_DEFAULT_REGION || env.REGION || 'auto';
  const accessKeyId = env.STORAGE_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID || env.ACCESS_KEY_ID;
  const secretAccessKey = env.STORAGE_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY || env.SECRET_ACCESS_KEY;
  const urlStyle = env.STORAGE_URL_STYLE || env.AWS_S3_URL_STYLE || 'virtual';
  const provider = env.STORAGE_PROVIDER;
  if (provider && provider !== 'railway') throw new Error('STORAGE_PROVIDER must be railway');
  const configured = [bucket, endpoint, accessKeyId, secretAccessKey].filter(Boolean).length;
  if (!configured) {
    if (provider === 'railway') throw new Error('Railway bucket settings required when STORAGE_PROVIDER=railway');
    return null;
  }
  if (configured !== 4) throw new Error('Railway bucket credentials incomplete (bucket, endpoint, access key, secret key required)');
  // Never allow credentials to be sent to arbitrary or unencrypted endpoints.
  let url: URL;
  try { url = new URL(endpoint!); } catch { throw new Error('Invalid Railway bucket endpoint URL'); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.storageapi.dev') || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Railway bucket endpoint must be an HTTPS storageapi.dev base URL');
  }
  if (urlStyle !== 'virtual' && urlStyle !== 'path') throw new Error('STORAGE_URL_STYLE must be virtual or path');
  if (!/^[a-zA-Z0-9._-]+$/.test(bucket!)) throw new Error('Invalid storage bucket name');
  if (!/^[a-zA-Z0-9-]+$/.test(region)) throw new Error('Invalid storage region');
  return {bucket:bucket!,endpoint:url.origin,region,accessKeyId:accessKeyId!,secretAccessKey:secretAccessKey!,urlStyle};
}

export function createRailwayBucketStorage(config: RailwayBucketSettings): ReceiptObjectStorage {
  const client = new S3Client({
    region:config.region,
    endpoint:config.endpoint,
    credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},
    forcePathStyle:config.urlStyle==='path',
  });
  return {
    async put(key,bytes,mimeType,hash){
      await client.send(new PutObjectCommand({Bucket:config.bucket,Key:key,Body:bytes,ContentType:mimeType,Metadata:{sha256:hash},CacheControl:'private, no-store'}));
    },
    async get(key){
      const out=await client.send(new GetObjectCommand({Bucket:config.bucket,Key:key}));
      if(!out.Body)throw new Error('Object body missing');
      // AWS SDK's Node response is a Node.js readable stream.
      return {body:out.Body as Readable,mimeType:out.ContentType || 'application/octet-stream'};
    },
    async delete(key){await client.send(new DeleteObjectCommand({Bucket:config.bucket,Key:key}));},
  };
}
