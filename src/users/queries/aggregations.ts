
import { PipelineStage, Types } from 'mongoose';
import { Model } from 'mongoose';
import { UserProfile } from '../schemas/user-profile.schema';

type SortKind = 'author' | 'popular' | 'date';

export interface CasesQueryOpts {
  sort: SortKind;
  categories?: string[];
  limit: number;
  offset: number;
}


export function buildUserCategoriesPipeline(userId: Types.ObjectId): PipelineStage[] {
  return [
    {
      $match: {
        isPublished: true,
        $or: [{ authorId: userId }, { contributors: userId }],
      },
    },
    { $unwind: '$categories' },
    {
      $group: {
        _id: '$categories',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1, _id: 1 } },
    {
      $project: {
        _id: 0,
        name: '$_id',
        count: 1,
      },
    },
  ];
}


export async function buildUserCasesQuery(
  profileModel: Model<UserProfile>,
  userId: Types.ObjectId,
  opts: CasesQueryOpts,
): Promise<{ filter: any; sort: Record<string, 1 | -1>; caseOrder?: Types.ObjectId[] }> {
  const filter: any = {
    isPublished: true,
    $or: [{ authorId: userId }, { contributors: userId }],
  };

  if (opts.categories && opts.categories.length > 0) {
    filter.categories = { $in: opts.categories };
  }

  let sort: Record<string, 1 | -1>;
  switch (opts.sort) {
    case 'popular':
      
      sort = { score: -1, views: -1, publishedAt: -1 };
      break;
    case 'author':
      
      sort = { publishedAt: -1 };
      break;
    case 'date':
    default:
      sort = { publishedAt: -1 };
      break;
  }

  let caseOrder: Types.ObjectId[] | undefined = undefined;
  if (opts.sort === 'author') {
    const prof = await profileModel.findOne({ userId }, { caseOrder: 1 }).lean();
    caseOrder = (prof?.caseOrder as unknown as Types.ObjectId[]) || [];
  }

  return { filter, sort, caseOrder };
}
