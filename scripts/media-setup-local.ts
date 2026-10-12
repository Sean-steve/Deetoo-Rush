/**
 * Initialize the opt-in, loopback-only S3-compatible local media store.
 * Never configures public bucket access or runs against remote/production URLs.
 *
 * Usage: pnpm media:setup:local
 * Requires OBJECT_STORAGE_* in .env (also used by the DeeToo API).
 */
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";

const allowedLocalHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
export function localMediaSettings(env: NodeJS.ProcessEnv) {
  const stage = String(env.APP_ENV || env.NODE_ENV || "development").toLowerCase();
  if (stage !== "development" || env.NODE_ENV === "production") {
    throw new Error("Local media setup is only allowed in APP_ENV=development.");
  }
  const endpoint = env.OBJECT_STORAGE_ENDPOINT || "";
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error("Set OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:9000 in .env"); }
  if (url.protocol !== "http:" || !allowedLocalHosts.has(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Local media setup only accepts a plain HTTP loopback endpoint (127.0.0.1 or localhost).");
  }
  const bucket = env.OBJECT_STORAGE_BUCKET || "";
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error("Set a valid lowercase OBJECT_STORAGE_BUCKET in .env");
  }
  const accessKeyId = env.OBJECT_STORAGE_ACCESS_KEY_ID || "";
  const secretAccessKey = env.OBJECT_STORAGE_SECRET_ACCESS_KEY || "";
  if (!accessKeyId || secretAccessKey.length < 8) {
    throw new Error("Configure OBJECT_STORAGE_ACCESS_KEY_ID and OBJECT_STORAGE_SECRET_ACCESS_KEY (at least 8 characters) in .env");
  }
  return {
    endpoint: url.origin,
    bucket,
    region: env.OBJECT_STORAGE_REGION || "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
  };
}

export async function setupLocalMedia(env: NodeJS.ProcessEnv = process.env) {
  const cfg = localMediaSettings(env);
  const s3 = new S3Client({region:cfg.region,endpoint:cfg.endpoint,
    credentials:cfg.credentials,forcePathStyle:true});
  try {
    try {
      await s3.send(new HeadBucketCommand({ Bucket:cfg.bucket }));
      process.stdout.write("Local private-media bucket already exists.\\n");
    } catch (error:any) {
      if (error?.$metadata?.httpStatusCode !== 404 &&
          error?.name !== "NotFound" &&
          error?.name !== "NoSuchBucket") throw error;
      await s3.send(new CreateBucketCommand({ Bucket:cfg.bucket }));
      process.stdout.write("Created the local private-media bucket.\\n");
    }
    await s3.send(new PutBucketCorsCommand({
      Bucket:cfg.bucket,
      CORSConfiguration:{ CORSRules:[{
        AllowedOrigins:[
          "http://localhost:5173","http://127.0.0.1:5173",
          "http://localhost:5174","http://127.0.0.1:5174",
          "http://localhost:5175","http://127.0.0.1:5175",
          "http://localhost:5178","http://127.0.0.1:5178",
        ],
        AllowedMethods:["GET","PUT","HEAD"],
        AllowedHeaders:["*"],
        ExposeHeaders:["ETag"],
        MaxAgeSeconds:3600,
      }]},
    }));
    process.stdout.write("Private media is ready. CORS allows only local DeeToo portals; anonymous bucket access remains disabled.\\n");
  } finally {
    s3.destroy();
  }
}

// Do not connect to S3 when imported from a unit test.
if (process.argv[1] && /media-setup-local\\.(?:ts|js)$/.test(process.argv[1])) {
  setupLocalMedia().catch(err=>{process.stderr.write("Local media setup failed: "+String(err?.message||err)+"\\n");process.exitCode=1;});
}
