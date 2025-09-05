import { graphFetch } from './client';

export interface DriveItem {
  id: string;
  name: string;
  file?: {
    mimeType: string;
  };
  folder?: Record<string, unknown>;
  size?: number;
  webUrl?: string;
}

export interface FolderChildrenResponse {
  items: DriveItem[];
  next?: string;
}

export async function listFolderChildren(
  folderId: string,
  next?: string
): Promise<FolderChildrenResponse> {
  let url: string;
  if (next) {
    // Use the full next link provided by Microsoft Graph
    url = next;
  } else {
    url = `/v1.0/me/drive/items/${folderId}/children?$top=200`;
  }

  const response = await graphFetch(url);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list folder children: ${response.status} ${error}`);
  }

  const data = await response.json();
  
  return {
    items: data.value || [],
    next: data['@odata.nextLink']
  };
}

export async function downloadFile(fileId: string): Promise<Uint8Array> {
  const url = `/v1.0/me/drive/items/${fileId}/content`;
  const response = await graphFetch(url);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to download file: ${response.status} ${error}`);
  }

  // Microsoft Graph returns the file content directly
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}