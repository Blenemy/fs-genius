import {
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { env } from "../config/env.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

export type StorageCheck =
  | { ok: true; skipped: true }
  | { ok: true; bucket: string }
  | { ok: false; error: string };

interface S3Config {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
  forcePathStyle: boolean;
}

function readS3Config(): S3Config | null {
  const {
    S3_ENDPOINT,
    S3_BUCKET,
    S3_ACCESS_KEY,
    S3_SECRET_KEY,
    S3_REGION,
    S3_FORCE_PATH_STYLE,
  } = env;

  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
    return null;
  }

  return {
    endpoint: S3_ENDPOINT,
    bucket: S3_BUCKET,
    accessKey: S3_ACCESS_KEY,
    secretKey: S3_SECRET_KEY,
    region: S3_REGION,
    forcePathStyle: S3_FORCE_PATH_STYLE,
  };
}

let client: S3Client | null = null;

export function isS3Configured(): boolean {
  return readS3Config() !== null;
}

function assertS3Configured(): S3Config {
  const config = readS3Config();

  if (!config) {
    throw new Error("S3 is not configured");
  }
  return config;
}

export function getS3(): S3Client {
  const config = assertS3Configured();

  client ??= new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: config.forcePathStyle,
    // SDK начиная с 3.729 сам добавляет к загрузкам CRC32 тела. В presigned-
    // ссылку он зашивает сумму от пустого тела (x-amz-checksum-crc32=AAAAAA==):
    // тела в момент подписи ещё нет. Браузер кладёт настоящий файл, R2 сверяет
    // суммы и отвечает 403. Из потока (воркер) SDK шлёт сумму хвостом
    // aws-chunked, чего R2 тоже не принимает. MinIO всё это пропускает, поэтому
    // локально поломка не видна. WHEN_REQUIRED — считать только там, где
    // операция без суммы невозможна.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return client;
}

export async function checkStorage(): Promise<StorageCheck> {
  const config = readS3Config();
  if (!config) {
    return { ok: true, skipped: true };
  }

  try {
    await getS3().send(new HeadBucketCommand({ Bucket: config.bucket }), {
      abortSignal: AbortSignal.timeout(2000),
    });
    return { ok: true, bucket: config.bucket };
  } catch (err) {
    return { ok: false, error: storageErrorMessage(err) };
  }
}

function storageErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "storage unreachable";
  const name = err.name && err.name !== "Error" ? err.name : "";
  return (
    [name, err.message].filter(Boolean).join(": ") || "storage unreachable"
  );
}

export function destroyS3(): void {
  if (!client) return;
  client.destroy();
  client = null;
}

export async function presignPut(
  key: string,
  contentType: string,
): Promise<string> {
  const config = assertS3Configured();

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getS3(), command, { expiresIn: 900 });
}

export async function presignGet(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  const config = assertS3Configured();
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  });
  return getSignedUrl(getS3(), command, { expiresIn });
}

export async function deleteObject(key: string): Promise<void> {
  const config = assertS3Configured();

  await getS3().send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
    { abortSignal: AbortSignal.timeout(5000) },
  );
}

export async function headObject(
  key: string,
): Promise<{ contentLength: number } | null> {
  const config = assertS3Configured();

  try {
    const result = await getS3().send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(5000) },
    );
    return { contentLength: result.ContentLength ?? 0 };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function getObjectToFile(
  key: string,
  filePath: string,
): Promise<void> {
  const config = assertS3Configured();

  const { Body } = await getS3().send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { abortSignal: AbortSignal.timeout(10000) },
  );

  if (!Body) {
    throw new Error("S3 object has no body");
  }

  const writeStream = createWriteStream(filePath);
  await pipeline(Body as NodeJS.ReadableStream, writeStream);
}

export async function putObjectToS3(
  key: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  const config = assertS3Configured();

  const readStream = createReadStream(filePath);
  await getS3().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: readStream,
      ContentType: contentType,
    }),
    { abortSignal: AbortSignal.timeout(10000) },
  );
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String(err.name) : "";
  if (name === "NotFound" || name === "NoSuchKey") return true;
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata
    ?.httpStatusCode;
  return status === 404;
}
