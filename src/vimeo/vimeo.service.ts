// src/vimeo/vimeo.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { createReadStream, statSync } from 'fs';
import { basename, extname } from 'path';

type CreateVideoResp = {
  uri: string; // "/videos/{id}"
  upload?: { upload_link?: string };
};

type ProjectListResp = {
  data: Array<{ uri: string; name?: string }>;
};

type ClipMetaResp = {
  uri: string;
  link?: string;
  files?: { link?: string; quality?: string }[];
  pictures?: { sizes?: { link?: string }[] };
};

function guessVideoContentType(filePath: string) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.webm') return 'video/webm';
  // остання лінія оборони
  return 'application/octet-stream';
}

@Injectable()
export class VimeoService {
  private readonly logger = new Logger(VimeoService.name);
  private readonly api: AxiosInstance;

  constructor() {
    const token = process.env.VIMEO_ACCESS_TOKEN;
    if (!token) {
      this.logger.warn('VIMEO_ACCESS_TOKEN is missing — Vimeo upload will fail.');
    }
    this.api = axios.create({
      baseURL: 'https://api.vimeo.com',
      headers: { Authorization: `Bearer ${token}` },
      timeout: 60_000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
  }

  /**
   * Знаходимо або створюємо папку (проект) на Vimeo для caseId.
   * Повертаємо projectId (останній сегмент з URI).
   */
  async ensureFolder(caseId: string): Promise<string> {
    // 1) пошук за назвою
    try {
      const { data } = await this.api.get<ProjectListResp>('/me/projects', {
        params: { query: caseId, per_page: 50 },
      });
      const hit = (data?.data || []).find((p) => p?.name === caseId);
      if (hit?.uri) {
        const foundId = hit.uri.split('/').pop()!;
        return foundId;
      }
    } catch (e: any) {
      this.logger.warn(`Vimeo list projects failed: ${e?.message}`);
    }

    // 2) створення
    const created = await this.api.post<{ uri: string }>('/me/projects', { name: caseId });
    const projectUri = created.data?.uri; // "/users/{uid}/projects/{pid}"
    const folderId = projectUri?.split('/').pop();
    if (!folderId) throw new Error('Vimeo folderId not returned');
    return folderId;
  }

  /**
   * Реальний аплоад:
   * 1) POST /me/videos з approach: "post" -> отримаємо upload_link
   * 2) PUT файл на upload_link
   * 3) Додамо відео у проект (папку)
   */
  async uploadVideo(filePath: string, folderId: string): Promise<{ vimeoId: string }> {
    const fileSize = statSync(filePath).size;
    const filename = basename(filePath);

    // 1) створити відео і отримати upload_link
    const createResp = await this.api.post<CreateVideoResp>('/me/videos', {
      upload: { approach: 'post', size: fileSize },
      name: filename,
      privacy: { view: 'unlisted' }, // або "anybody" / як тобі потрібно
    });

    const videoUri = createResp.data?.uri;
    const uploadUrl = createResp.data?.upload?.upload_link;
    if (!videoUri || !uploadUrl) {
      throw new Error('Vimeo did not return video URI or upload_link');
    }

    // 2) PUT файл на видаданий одноразовий upload_link
    await axios.put(uploadUrl, createReadStream(filePath), {
      headers: { 'Content-Type': guessVideoContentType(filePath) },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 0, // великі файли можуть вантажитись довго
    });

    // 3) додати відео у проект/папку
    const videoId = videoUri.split('/').pop()!;
    await this.api.put(`/me/projects/${folderId}/videos/${videoId}`);

    this.logger.log(`Upload finished: file ${filename} -> vimeoId ${videoId}, folder ${folderId}`);
    return { vimeoId: videoId };
  }

  /**
   * Отримати мета-дані відео (playback + thumbnail)
   */
  async getVideoMeta(vimeoId: string): Promise<{ playbackUrl?: string; thumbnailUrl?: string }> {
    const { data } = await this.api.get<ClipMetaResp>(`/videos/${vimeoId}`, {
      params: { fields: 'link,files,pictures.sizes' },
    });

    const playbackUrl =
      data.files?.find((f) => f.quality === 'hd')?.link ||
      data.files?.[0]?.link ||
      data.link;

    const thumbnailUrl =
      data.pictures?.sizes?.[data.pictures.sizes.length - 1]?.link ||
      data.pictures?.sizes?.[0]?.link;

    return { playbackUrl, thumbnailUrl };
  }

  // залишаємо аліас, якщо десь у коді ще є старе імʼя
  async uploadToVimeo(filePath: string, folderId: string) {
    return this.uploadVideo(filePath, folderId);
  }
}
