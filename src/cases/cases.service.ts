import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Case, CaseDocument } from './schemas/case.schema';
import { Model } from 'mongoose';

@Injectable()
export class CasesService {
  constructor(@InjectModel(Case.name) private caseModel: Model<CaseDocument>) {}

  async create(ownerId: string, dto: any) {
    const doc = await this.caseModel.create({ ...dto, ownerId });
    return doc;
  }

  async findPublicById(id: string) {
    const doc = await this.caseModel.findById(id);
    if (!doc) throw new NotFoundException('Case not found');
    return doc;
  }

  async updateOwned(userId: string, id: string, patch: any) {
    const doc = await this.caseModel.findById(id);
    if (!doc) throw new NotFoundException('Case not found');
    if (String(doc.ownerId) !== String(userId)) throw new ForbiddenException('Not owner');
    Object.assign(doc, patch);
    await doc.save();
    return doc;
  }

  async setCover(userId: string, id: string, cover: any) {
    const doc = await this.caseModel.findById(id);
    if (!doc) throw new NotFoundException('Case not found');
    if (String(doc.ownerId) !== String(userId)) throw new ForbiddenException('Not owner');
    doc.cover = cover;
    await doc.save();
    return doc;
  }

  async pushVideoMeta(caseId: string, meta: any) {
    return this.caseModel.findByIdAndUpdate(caseId, { $push: { videos: meta } }, { new: true });
  }

  async updateVideoStatus(caseId: string, vimeoId: string, patch: any) {
    return this.caseModel.updateOne({ _id: caseId, 'videos.vimeoId': vimeoId }, { $set: {
      'videos.$.status': patch.status,
      'videos.$.playbackUrl': patch.playbackUrl,
      'videos.$.thumbnailUrl': patch.thumbnailUrl,
    }});
  }
}
