import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'

type UploadMeta = { caseId: string; sectionIndex: number; blockIndex: number }

@Injectable()
export class VimeoApi {
  private readonly log = new Logger(VimeoApi.name)
  private readonly token = process.env.VIMEO_TOKEN || ''
  private readonly baseURL = 'https://api.vimeo.com'

  private client = axios.create({
    baseURL: this.baseURL,
    headers: {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.vimeo.*+json;version=3.4',
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    validateStatus: s => s >= 200 && s < 300,
  })

  /** Створюємо/дістаємо папку-проект для кейса */
  async ensureFolder(caseId: string) {
    const name = `case-${caseId}`
    try {
      const res = await this.client.post('/me/projects', { name })
      const folderId = res.data?.uri?.split('/').pop()
      return { folderId }
    } catch (e: any) {
      // Якщо існує — шукаємо
      const list = await this.client.get('/me/projects', { params: { query: name, per_page: 50 } })
      const found = (list.data?.data || []).find((p: any) => p.name === name)
      if (!found) throw e
      return { folderId: found.uri?.split('/').pop() }
    }
  }

  /** tus-аплоад: створюємо відео й вантажимо файл шматками */
  async uploadFile(caseId: string, filePath: string, meta?: UploadMeta) {
    const stat = fs.statSync(filePath)
    const size = stat.size
    const fileName = path.basename(filePath)

    // 1) Створюємо video зі схемою tus
    const createRes = await this.client.post('/me/videos', {
      upload: { approach: 'tus', size },
      name: fileName,
      description: meta ? JSON.stringify({ kind: 'case-media', ...meta }) : undefined,
    })
    const videoUri: string = createRes.data?.uri // "/videos/{id}"
    const uploadLink: string = createRes.data?.upload?.upload_link
    if (!uploadLink || !videoUri) throw new Error('Vimeo: no upload_link or video uri')

    // 2) Робимо tus-аплоад (без сторонніх пакетів)
    const stream = fs.createReadStream(filePath)
    const req = await axios({
      method: 'PATCH',
      url: uploadLink,
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': '0',
        'Content-Type': 'application/offset+octet-stream',
      },
      data: stream,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: s => s >= 200 && s < 400, // tus повертає 204
    })

    if (req.status !== 204) {
      throw new Error(`Vimeo tus upload failed: ${req.status} ${req.statusText}`)
    }

    const id = videoUri.split('/').pop()!
    const link = `https://vimeo.com/${id}`
    return { id, link, uri: videoUri }
  }

  /** Додаємо відео до папки-проекту (case folder) */
  async addVideoToFolder(folderId: string, videoId: string) {
    await this.client.put(`/me/projects/${folderId}/videos/${videoId}`)
  }

  /** Прочитати метадані відео (щоб вебхук міг дістати наш caseId/section/block) */
  async getVideoMeta(videoIdOrUri: string) {
    const id = videoIdOrUri.includes('/videos/') ? videoIdOrUri.split('/').pop()! : videoIdOrUri
    const res = await this.client.get(`/videos/${id}`)
    return res.data
  }

  /** Видалення всіх відео з папки + самої папки (якщо потрібно) */
  async cleanupFolder(caseId: string) {
    const { folderId } = await this.ensureFolder(caseId).catch(() => ({ folderId: null }))
    if (!folderId) return
    // перелікуємо відео в проекті й видаляємо
    const list = await this.client.get(`/me/projects/${folderId}/videos`, { params: { per_page: 100 } })
    const items: any[] = list.data?.data || []
    for (const v of items) {
      const vid = v.uri?.split('/').pop()
      if (vid) {
        await this.client.delete(`/videos/${vid}`).catch(e => this.log.warn(`cleanup video ${vid} failed: ${e}`))
      }
    }
    // видалити папку необов’язково; інколи краще залишити для історії
    // await this.client.delete(`/me/projects/${folderId}`).catch(() => {})
  }

  async deleteVideo(videoId: string) {
  await this.client.delete(`/videos/${videoId}`)
}

}
