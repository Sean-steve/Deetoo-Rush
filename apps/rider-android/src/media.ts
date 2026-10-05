import type { DeetooApiClient } from '@deetoo/api-client';

export async function uploadDeliveryPhoto(
  client: DeetooApiClient,
  deliveryId: string,
  uri: string,
): Promise<string> {
  const photoResponse = await fetch(uri);
  if (!photoResponse.ok) throw new Error('Could not read captured proof photo');
  const blob = await photoResponse.blob();
  const contentType = blob.type || 'image/jpeg';

  const intent = await client.request<{
    media_id: string;
    upload_url: string;
    upload_headers: Record<string, string>;
  }>('/media/uploads', {
    method: 'POST',
    body: JSON.stringify({
      purpose: 'DELIVERY_PROOF',
      content_type: contentType,
      reference_type: 'DELIVERY',
      reference_id: deliveryId,
    }),
  });

  if (!intent.data.upload_url.startsWith('memory://')) {
    const upload = await fetch(intent.data.upload_url, {
      method: 'PUT',
      headers: intent.data.upload_headers,
      body: blob,
    });
    if (!upload.ok) {
      throw new Error(`Private proof upload failed with HTTP ${upload.status}`);
    }
  }

  await client.request(`/media/uploads/${encodeURIComponent(intent.data.media_id)}/complete`, {
    method: 'POST',
  });
  return intent.data.media_id;
}
