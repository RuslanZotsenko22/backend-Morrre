// src/cases/schemas/case.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';

export type CaseDocument = HydratedDocument<Case>;

type CaseStatus = 'draft' | 'published';
type VideoStatus = 'queued' | 'uploading' | 'processing' | 'ready' | 'error';

export const INDUSTRY_ENUM = [
  'fashion', 'tech', 'health', 'finance', 'education',
  'entertainment', 'food', 'travel', 'automotive', 'other',
] as const;

export const WHAT_DONE_ENUM = [
  'naming', 'logo', 'branding', 'art-direction', 'ui-ux',
  '3d', 'motion', 'typography', 'illustration', 'copywriting',
  'packaging', 'web',
] as const;

@Schema({ timestamps: true })
export class Case {
  // ===== базові поля =====
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '' })
  description?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true })
  ownerId: string;

  // ⬇️ contributors як масив об'єктів { userId, role }
  @Prop({
    type: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        role: { type: String, default: '' },
      },
    ],
    default: [],
  })
  contributors: { userId: string; role?: string }[];

  // категорії / теги / індустрія
  @Prop({ type: [String], default: [] })
  categories: string[]; // ≤3

  // ⬇️ industry як enum
  @Prop({ type: String, enum: INDUSTRY_ENUM, index: true })
  industry?: (typeof INDUSTRY_ENUM)[number]; // 1

  @Prop({ type: [String], default: [] })
  tags: string[]; // ≤20

  // ⬇️ що було зроблено (масив enum-значень)
  @Prop({ type: [String], enum: WHAT_DONE_ENUM, default: [] })
  whatWasDone?: (typeof WHAT_DONE_ENUM)[number][];

  // обкладинка (гнучкий формат: url + sizes як довільний об’єкт)
  @Prop({ type: Object, default: null })
  cover?: {
    url: string;
    type: 'image';
    alt?: string;
    sizes?: Record<
      string,
      | string
      | {
          url: string;
          width?: number;
          height?: number;
          [k: string]: unknown;
        }
    >;
  };

  // відео-мета
  @Prop({ type: [Object], default: [] })
  videos?: {
    vimeoId?: string;
    status: VideoStatus;
    playbackUrl?: string;
    thumbnailUrl?: string;

    // службові поля завантаження
    originalName?: string;
    size?: number;
    mimetype?: string;
  }[];

  @Prop({ enum: ['draft', 'published'], default: 'draft', index: true })
  status: CaseStatus;

  // ===== поля для головної / popular / discover =====

  /** Ручна позначка кейса для блоку «Популярне сьогодні» (слайди) */
  @Prop({ type: Boolean, default: false, index: true })
  featuredSlides: boolean;

  /** Додано в curated-чергу */
  @Prop({ type: Boolean, default: false, index: true })
  popularQueued: boolean;

  /** Час додавання в чергу (для FIFO) */
  @Prop({ type: Date })
  queuedAt?: Date;

  /** Форс-публікація під час найближчого оновлення популярних */
  @Prop({ type: Boolean, default: false })
  forceToday?: boolean;

  /** Активний у «Popular» (вже опублікований у батчі) */
  @Prop({ type: Boolean, default: false, index: true })
  popularActive: boolean;

  /** Дата батча (початок доби UTC) */
  @Prop({ type: Date, index: true })
  popularBatchDate?: Date;

  /** Фактичний час публікації у «Popular» */
  @Prop({ type: Date, index: true })
  popularPublishedAt?: Date;

  // ===== MVP рейтинг/життя та лічильники взаємодій =====

  /** “Життя” кейса: використовується для сортування/вигоряння у Popular */
  @Prop({ type: Number, default: 100, min: 0, index: true })
  lifeScore: number;

  /** Лічильники взаємодій (накопичувальні) */
  @Prop({ type: Number, default: 0 })
  views: number;

  @Prop({ type: Number, default: 0 })
  saves: number;

  @Prop({ type: Number, default: 0 })
  shares: number;

  @Prop({ type: Number, default: 0 })
  refsLikes: number;

  // --- BADGE (агрегат голосів) ---
  @Prop({ type: Object, default: null })
  badge?: { design?: number; creativity?: number; content?: number; overall?: number };

  // --- Палітра кольорів (до 8 кольорів HEX) ---
  @Prop({ type: [String], default: [] })
  palette!: string[];

  // --- Блоковий контент кейсу ---
  @Prop({
    type: [
      {
        kind: { type: String, enum: ['text', 'iframe', 'media'], required: true },

        // text блок
        text: { type: String }, // markdown/html

        // iframe блок (YouTube/Vimeo)
        iframe: {
          url: { type: String },
          provider: { type: String, enum: ['youtube', 'vimeo'] },
        },

        // media блок (масив елементів)
        media: [
          {
            type: { type: String, enum: ['image', 'video'], required: true },
            url: { type: String, required: true },
            alt: String,
            width: Number,
            height: Number,
          },
        ],
      },
    ],
    default: [],
  })
  blocks!: any[];

  // --- Налаштування стилю сторінки кейса ---
  @Prop({ type: Object, default: { radius: 0, gap: 24 } })
  style?: { radius?: number; gap?: number };

  // --- Унікальні перегляди (число) ---
  @Prop({ type: Number, default: 0 })
  viewsUnique!: number;
}

export const CaseSchema = SchemaFactory.createForClass(Case);

// ===== індекси пошуку / фільтрації =====

// Текстовий індекс — тільки по рядках
CaseSchema.index(
  { title: 'text', description: 'text' },
  { weights: { title: 5, description: 1 }, name: 'text_title_description' }
);

// Звичайні індекси для фільтрації
CaseSchema.index({ tags: 1 }, { name: 'idx_tags' });
CaseSchema.index({ categories: 1 }, { name: 'idx_categories' });
CaseSchema.index({ industry: 1 }, { name: 'idx_industry' });
// (опційно) індекс під фільтрацію по зробленому
CaseSchema.index({ whatWasDone: 1 }, { name: 'idx_what_was_done' });

// Індекси для головної / popular
CaseSchema.index({ status: 1, featuredSlides: 1, updatedAt: -1 }, { name: 'idx_featuredSlides' });
CaseSchema.index(
  { popularActive: 1, popularBatchDate: -1, popularPublishedAt: -1 },
  { name: 'idx_popular_active_batch' }
);
CaseSchema.index({ popularQueued: 1, queuedAt: 1 }, { name: 'idx_popular_queue' });

// Індекси для lifeScore/сортування у Popular
CaseSchema.index({ lifeScore: -1 }, { name: 'idx_lifeScore_desc' });
CaseSchema.index(
  { popularActive: 1, lifeScore: -1, popularPublishedAt: -1 },
  { name: 'idx_popular_rank' }
);
