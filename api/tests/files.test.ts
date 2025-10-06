import { describe, expect, it, vi } from 'vitest';
import app from '../src/worker';
import { createTestEnv } from './helpers/mock-env';

vi.mock('../src/lib/access', () => ({
  authenticateRequest: vi.fn(async () => ({
    id: 'user@example.com',
    email: 'user@example.com',
    displayName: 'Test User',
    tenant: 'default',
  })),
}));

const timestamp = new Date().toISOString();

describe('files route permissions', () => {
  it('blocks uploads to shared folders owned by another user', async () => {
    const { env, db, ctx } = createTestEnv();

    db.folders.set('public-root', {
      id: 'public-root',
      tenant: 'default',
      name: 'Org Shared',
      visibility: 'public',
      owner_id: null,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    });

    db.folders.set('shared-not-owned', {
      id: 'shared-not-owned',
      tenant: 'default',
      name: 'Team Handbook',
      visibility: 'public',
      owner_id: 'owner@example.com',
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    });

    const form = new FormData();
    form.append('file', new File(['Hello world'], 'notes.txt', { type: 'text/plain' }));
    form.append('folderId', 'shared-not-owned');
    form.append('visibility', 'public');

    const request = new Request('https://example.com/api/files', {
      method: 'POST',
      body: form,
      headers: {
        'cf-access-jwt-assertion': 'test-token',
      },
    });

    const response = await app.fetch(request, env, ctx);
    expect(response.status).toBe(403);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain('owner');
  });

  it('allows uploads to shared folders you own', async () => {
    const { env, db, r2, ctx } = createTestEnv();

    db.folders.set('public-root', {
      id: 'public-root',
      tenant: 'default',
      name: 'Org Shared',
      visibility: 'public',
      owner_id: null,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    });

    db.folders.set('shared-owned', {
      id: 'shared-owned',
      tenant: 'default',
      name: 'My Shared Docs',
      visibility: 'public',
      owner_id: 'user@example.com',
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    });

    const form = new FormData();
    form.append('file', new File(['Hello world'], 'notes.txt', { type: 'text/plain' }));
    form.append('folderId', 'shared-owned');
    form.append('visibility', 'public');

    const request = new Request('https://example.com/api/files', {
      method: 'POST',
      body: form,
      headers: {
        'cf-access-jwt-assertion': 'test-token',
      },
    });

    const response = await app.fetch(request, env, ctx);
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { file: { id: string; folder: { id: string } } };
    expect(payload.file.folder.id).toBe('shared-owned');

    // Ensure object persisted to R2 and record stored in D1 mock
    const storedKeys = Array.from(r2.objects.keys());
    expect(storedKeys.some((key) => key.includes('shared-owned'))).toBe(true);
    expect(db.files.size).toBe(1);
  });
});

describe('file download route', () => {
  it('returns text content when the requester owns the private file', async () => {
    const { env, db, r2, ctx } = createTestEnv();

    const folderId = 'private-root';
    const fileId = 'file-123';
    const timestamp = new Date().toISOString();

    db.folders.set(folderId, {
      id: folderId,
      tenant: 'default',
      name: 'My Space',
      visibility: 'private',
      owner_id: 'user@example.com',
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    });

    const objectKey = `users/user@example.com/${folderId}/${fileId}.txt`;
    db.files.set(fileId, {
      id: fileId,
      tenant: 'default',
      folder_id: folderId,
      owner_id: 'user@example.com',
      visibility: 'private',
      file_name: 'notes.txt',
      r2_key: objectKey,
      size: 12,
      mime_type: 'text/plain',
      status: 'ready',
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    });

    db.users.set('user@example.com', {
      id: 'user@example.com',
      email: 'user@example.com',
      display_name: 'Test User',
      avatar_url: null,
      tenant: 'default',
      last_seen: timestamp,
      created_at: timestamp,
    });

    await r2.put(objectKey, 'Hello Marble!', {
      httpMetadata: { contentType: 'text/plain' },
    });

    const request = new Request(`https://example.com/api/files/${fileId}/download`, {
      headers: {
        'cf-access-jwt-assertion': 'test-token',
      },
    });

    const response = await app.fetch(request, env, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(response.headers.get('content-disposition')).toContain('notes.txt');
    const text = await response.text();
    expect(text).toBe('Hello Marble!');
  });

  it('rejects access to private files owned by another user', async () => {
    const { env, db, r2, ctx } = createTestEnv();

    const folderId = 'private-root';
    const fileId = 'file-secret';
    const timestamp = new Date().toISOString();

    db.folders.set(folderId, {
      id: folderId,
      tenant: 'default',
      name: 'My Space',
      visibility: 'private',
      owner_id: 'other@example.com',
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    });

    const objectKey = `users/other@example.com/${folderId}/${fileId}.txt`;
    db.files.set(fileId, {
      id: fileId,
      tenant: 'default',
      folder_id: folderId,
      owner_id: 'other@example.com',
      visibility: 'private',
      file_name: 'secrets.txt',
      r2_key: objectKey,
      size: 20,
      mime_type: 'text/plain',
      status: 'ready',
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    });

    db.users.set('other@example.com', {
      id: 'other@example.com',
      email: 'other@example.com',
      display_name: 'Other User',
      avatar_url: null,
      tenant: 'default',
      last_seen: timestamp,
      created_at: timestamp,
    });

    await r2.put(objectKey, 'Top secret', {
      httpMetadata: { contentType: 'text/plain' },
    });

    const request = new Request(`https://example.com/api/files/${fileId}/download`, {
      headers: {
        'cf-access-jwt-assertion': 'test-token',
      },
    });

    const response = await app.fetch(request, env, ctx);
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload).toMatchObject({ error: expect.stringContaining('access') });
  });
});
