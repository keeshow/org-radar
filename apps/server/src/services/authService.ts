import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const SESSION_COOKIE = 'organization_radar_session';
const LEGACY_SESSION_COOKIE = 'org_radar_legacy_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const sessions = new Map<string, number>();

function getAccessCode(): string | null {
  return process.env.ACCESS_CODE?.trim() || null;
}

function isAccessControlEnabled(): boolean {
  return Boolean(getAccessCode());
}

function safeEquals(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function getSessionToken(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE] || cookies[LEGACY_SESSION_COOKIE] || null;
}

function isHttpsRequest(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function buildSessionCookie(req: Request, name: string, value: string, maxAgeSeconds: number): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isHttpsRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

export function isAuthenticated(req: Request): boolean {
  if (!isAccessControlEnabled()) return true;

  const token = getSessionToken(req);
  if (!token) return false;

  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isAuthenticated(req)) {
    next();
    return;
  }
  res.status(401).json({ error: '未授权', message: '请先输入权限码' });
}

export function verifyAccessCode(req: Request, res: Response): void {
  const accessCode = getAccessCode();
  if (!accessCode) {
    res.json({ success: true });
    return;
  }

  const { code } = req.body as { code?: string };
  if (!code || !safeEquals(code, accessCode)) {
    res.status(401).json({ success: false, message: '权限码不正确' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);

  res.setHeader('Set-Cookie', buildSessionCookie(req, SESSION_COOKIE, token, Math.floor(SESSION_TTL_MS / 1000)));
  res.json({ success: true });
}

export function clearAuth(req: Request, res: Response): void {
  const token = getSessionToken(req);
  if (token) sessions.delete(token);

  res.setHeader('Set-Cookie', [
    buildSessionCookie(req, SESSION_COOKIE, '', 0),
    buildSessionCookie(req, LEGACY_SESSION_COOKIE, '', 0),
  ]);
  res.json({ success: true });
}
