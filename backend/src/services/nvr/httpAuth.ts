import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';

interface AuthChallenge {
  name: string;
  params: Record<string, string>;
}

export interface AuthHandler {
  authorization(method: string, uri: string): string;
}

interface HttpAuthClient {
  parseHeaders(...headers: string[]): AuthChallenge[];
  pick(challenges: AuthChallenge[]): AuthChallenge[];
}

const require = createRequire(import.meta.url);
const httpAuth = require('http-auth-client') as HttpAuthClient;

export function createAuthHandler(
  challengeHeaders: string[],
  username?: string,
  password?: string,
): AuthHandler | undefined {
  if (!username || password === undefined) return undefined;

  const challenges = httpAuth.parseHeaders(...challengeHeaders);
  const supportedChallenges = httpAuth.pick(challenges);
  if (supportedChallenges.length === 0) return undefined;

  const challenge = supportedChallenges[0];
  if (challenge.name.toLowerCase() === 'basic') {
    const secret = Buffer.from(`${username}:${password}`).toString('base64');
    return {
      authorization: () => `Basic ${secret}`,
    };
  }
  if (challenge.name.toLowerCase() !== 'digest') return undefined;

  const algorithm = (challenge.params.algorithm ?? 'MD5').toLowerCase();
  if (!['md5', 'md5-sess', 'sha-256', 'sha-256-sess'].includes(algorithm)) return undefined;

  return new DigestAuthHandler(challenge.params, algorithm, username, password);
}

class DigestAuthHandler implements AuthHandler {
  private nonceCount = 0;
  private readonly realm: string;
  private readonly nonce: string;
  private readonly opaque?: string;
  private readonly algorithm: string;
  private readonly qop?: 'auth' | 'auth-int';
  private readonly sessionAlgorithm: boolean;
  private readonly initialHa1: string;
  private readonly username: string;

  constructor(params: Record<string, string>, algorithm: string, username: string, password: string) {
    this.realm = params.realm ?? '';
    this.nonce = params.nonce ?? '';
    this.opaque = params.opaque;
    this.algorithm = algorithm;
    this.sessionAlgorithm = algorithm.endsWith('-sess');
    this.username = username;
    this.initialHa1 = hash(algorithm, `${username}:${this.realm}:${password}`);

    const offeredQop = params.qop?.split(',').map((value) => value.trim().toLowerCase()) ?? [];
    this.qop = offeredQop.includes('auth') ? 'auth' : offeredQop.includes('auth-int') ? 'auth-int' : undefined;
    if (offeredQop.length > 0 && !this.qop) {
      throw new Error('NVR requested an unsupported Digest quality of protection');
    }
    if (!this.nonce) throw new Error('NVR returned an invalid Digest challenge');
  }

  authorization(method: string, uri: string): string {
    const cnonce = randomBytes(16).toString('hex');
    const nonceCount = (++this.nonceCount).toString(16).padStart(8, '0');
    const ha1 = this.sessionAlgorithm
      ? hash(this.algorithm, `${this.initialHa1}:${this.nonce}:${cnonce}`)
      : this.initialHa1;
    const ha2 = this.qop === 'auth-int'
      ? hash(this.algorithm, `${method}:${uri}:${hash(this.algorithm, '')}`)
      : hash(this.algorithm, `${method}:${uri}`);
    const response = this.qop
      ? hash(this.algorithm, `${ha1}:${this.nonce}:${nonceCount}:${cnonce}:${this.qop}:${ha2}`)
      : hash(this.algorithm, `${ha1}:${this.nonce}:${ha2}`);

    const fields = [
      `username=${quote(this.username)}`,
      `realm=${quote(this.realm)}`,
      `nonce=${quote(this.nonce)}`,
      `uri=${quote(uri)}`,
      `response=${quote(response)}`,
      `algorithm=${this.algorithm}`,
    ];
    if (this.qop) fields.push(`qop=${this.qop}`, `nc=${nonceCount}`, `cnonce=${quote(cnonce)}`);
    else if (this.sessionAlgorithm) fields.push(`cnonce=${quote(cnonce)}`);
    if (this.opaque) fields.push(`opaque=${quote(this.opaque)}`);
    return `Digest ${fields.join(', ')}`;
  }
}

function hash(algorithm: string, value: string): string {
  const hashAlgorithm = algorithm.startsWith('sha-256') ? 'sha256' : 'md5';
  return createHash(hashAlgorithm).update(value, 'utf8').digest('hex');
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
