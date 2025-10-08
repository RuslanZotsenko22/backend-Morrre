import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument } from 'mongoose'

export type CaseViewDocument = HydratedDocument<CaseView>

@Schema({ timestamps: true })
export class CaseView {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Case', index: true, required: true })
  caseId!: string

  // якщо користувач авторизований — пишемо userId
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null })
  userId?: string | null

  // якщо гість — пишемо anonToken (cookie/uuid)
  @Prop({ type: String, index: true, default: null })
  anonToken?: string | null
}

export const CaseViewSchema = SchemaFactory.createForClass(CaseView)

// Унікальність за користувачем
CaseViewSchema.index(
  { caseId: 1, userId: 1 },
  {
    unique: true,
    name: 'uniq_view_per_user',
    partialFilterExpression: { userId: { $type: 'objectId' } },
  },
)
// Унікальність за анонімним токеном
CaseViewSchema.index(
  { caseId: 1, anonToken: 1 },
  {
    unique: true,
    name: 'uniq_view_per_anon',
    partialFilterExpression: { anonToken: { $type: 'string' } },
  },
)
