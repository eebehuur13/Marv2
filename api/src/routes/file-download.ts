import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../context';
import { getFile } from '../lib/db';

/**
 * GET /api/files/:id/download
 * Streams the stored text file when the requester has permission to view it.
 */
export async function handleDownloadFile(c: AppContext) {
  const user = c.get('user');
  const fileId = c.req.param('id');

  if (!fileId) {
    throw new HTTPException(400, { message: 'File id is required.' });
  }

  const file = await getFile(c.env, fileId, user.tenant);
  if (!file) {
    throw new HTTPException(404, { message: 'File not found.' });
  }

  if (file.visibility === 'private' && file.owner_id !== user.id) {
    throw new HTTPException(403, { message: 'You do not have access to this file.' });
  }

  if (!file.r2_key) {
    throw new HTTPException(500, { message: 'File is missing its storage reference.' });
  }

  const object = await c.env.MARBLE_FILES.get(file.r2_key);
  if (!object) {
    throw new HTTPException(404, { message: 'Stored file not found.' });
  }

  const [body, contentType] = await Promise.all([
    typeof object.text === 'function' ? object.text() : Promise.resolve(String(object.body ?? '')),
    Promise.resolve(object.httpMetadata?.contentType ?? undefined),
  ]);

  const filename = file.file_name || 'document.txt';
  const resolvedContentType = contentType && contentType.length > 0 ? contentType : 'text/plain; charset=utf-8';

  return new Response(body, {
    headers: {
      'Content-Type': resolvedContentType,
      'Content-Disposition': `inline; filename="${filename.replace(/"/g, '\\"')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
