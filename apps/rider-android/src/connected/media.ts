import type { DeetooApiClient } from '@deetoo/api-client';

type PrivatePurpose = 'RIDER_DOCUMENT' | 'RIDER_INCIDENT' | 'SUPPORT_ATTACHMENT';
/** No mock/photo filename may be sent as proof; camera bytes must be uploaded and verified. */
export async function uploadRiderImage(
  client: DeetooApiClient,
  uri: string,
  purpose: PrivatePurpose,
  referenceId?: string,
): Promise<string> {
  if (purpose !== 'RIDER_DOCUMENT' && !referenceId) throw new Error('A real reference ID is required for this upload.');
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not read camera media.');
  const blob = await response.blob();
  const data = await client.request<{ media_id: string; upload_url: string; upload_headers: Record<string,string> }>('/media/uploads', {
    method: 'POST',
    body: JSON.stringify({
      purpose,
      content_type: blob.type || 'image/jpeg',
      ...(referenceId ? { reference_id: referenceId, reference_type: purpose === 'RIDER_INCIDENT' ? 'INCIDENT' : 'SUPPORT_CASE' } : {}),
    }),
  });
  const intent = data.data;
  if (!intent.upload_url.startsWith('memory://')) {
    const upload = await fetch(intent.upload_url, {method:'PUT',headers:intent.upload_headers,body:blob});
    if (!upload.ok) throw new Error('Private media upload failed (HTTP '+upload.status+').');
  }
  await client.request('/media/uploads/'+encodeURIComponent(intent.media_id)+'/complete',{method:'POST'});
  return intent.media_id;
}
