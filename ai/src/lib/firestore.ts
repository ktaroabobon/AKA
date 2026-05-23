import { Firestore } from "@google-cloud/firestore";

import { loadEnv } from "../config/env.js";

let cached: Firestore | undefined;

/**
 * Cloud Run の ADC で認証された Firestore クライアントを singleton で返す。
 * `lib/` 配下なので module 読み込みでは副作用を起こさず、初回呼び出しで構築する。
 */
export function getFirestore(): Firestore {
  if (!cached) {
    const env = loadEnv();
    cached = new Firestore({
      projectId: env.GCP_PROJECT_ID,
      databaseId: env.FIRESTORE_DATABASE_ID,
    });
  }
  return cached;
}
