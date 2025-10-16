// src/users/queries/aggregations.ts
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

/**
 * Пайплайн категорій користувача
 * - збирає всі категорії з опублікованих кейсів, де користувач є автором або контриб’ютором
 * - рахує кількість появ
 */
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

/**
 * Формує фільтр і початкове сортування для списку кейсів користувача.
 * - Фільтр: isPublished=true AND (authorId=user OR contributors contains user)
 * - Додатково: фільтр по categories (IN)
 * - Сортування:
 *    - date:     publishedAt desc
 *    - popular:  score desc, views desc, publishedAt desc
 *    - author:   publishedAt desc (далі в сервісі виконується авторський порядок)
 * Повертає ще й caseOrder з профілю (для author-сорту).
 */
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
      // популярне — за балами (score), далі views, потім дата
      sort = { score: -1, views: -1, publishedAt: -1 };
      break;
    case 'author':
      // первинно тягнемо за датою (новіші спочатку), а далі сервіс розкладає:
      // нові (не в caseOrder) — догори; решта — за ручним порядком
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
