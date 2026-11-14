import axios, { AxiosHeaders, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { NvrCredentials } from './types.js';
import { createAuthHandler } from './httpAuth.js';

type NvrRequestConfig = InternalAxiosRequestConfig & { nvrAuthRetried?: boolean };

/** Shared HTTP helper with challenge-based authentication and timeouts. */
export function createNvrHttpClient(creds: NvrCredentials, timeoutMs = 10000): AxiosInstance {
  const client = axios.create({
    baseURL: `http://${creds.host}:${creds.httpPort}`,
    timeout: timeoutMs,
    headers: { 'Content-Type': 'application/json' },
    validateStatus: () => true, // we handle status codes manually
  });

  client.interceptors.response.use(async (response) => {
    const request = response.config as NvrRequestConfig;
    const challenge = response.headers['www-authenticate'];
    if (
      response.status !== 401 ||
      request.nvrAuthRetried ||
      !challenge
    ) {
      return response;
    }

    const authorization = createAuthHandler(
      Array.isArray(challenge) ? challenge : [challenge],
      creds.username,
      creds.password,
    );
    if (!authorization) return response;

    const requestUrl = new URL(request.url ?? '/', request.baseURL);
    const uri = `${requestUrl.pathname}${requestUrl.search}`;
    const headers = AxiosHeaders.from(request.headers);
    headers.set('Authorization', authorization.authorization((request.method ?? 'get').toUpperCase(), uri));

    return client.request({
      ...request,
      headers,
      nvrAuthRetried: true,
    } as NvrRequestConfig);
  });

  return client;
}

export function rtspBase(creds: NvrCredentials): string {
  const auth = creds.username ? `${encodeURIComponent(creds.username)}:${encodeURIComponent(creds.password ?? '')}@` : '';
  return `rtsp://${auth}${creds.host}:${creds.rtspPort}`;
}
