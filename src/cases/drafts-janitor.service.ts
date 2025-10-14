import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, isValidObjectId } from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'
import { CaseDraft } from './schemas/case-draft.schema'
import { Case } from './schemas/case.schema'

@Injectable()
export class DraftsJanitorService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DraftsJanitorService.name)
  private timer?: NodeJS.Timeout

  constructor(
    @InjectModel(CaseDraft.name) private draftModel: Model<any>,
    @InjectModel(Case.name) private caseModel: Model<any>,
  ) {}

  /** Базова директорія для кейсів (env або uploads/cases) */
  private getBaseDir() {
    return process.env.CASE_UPLOAD_DIR
      ? path.resolve(process.cwd(), process.env.CASE_UPLOAD_DIR)
      : path.resolve(process.cwd(), 'uploads', 'cases')
  }

  async runOnce() {
    const base = this.getBaseDir()
    if (!fs.existsSync(base)) return

    const entries = fs.readdirSync(base, { withFileTypes: true })
    const dirs = entries.filter((d) => d.isDirectory()).map((d) => d.name)

    // службові папки, які ігноруємо
    const skip = new Set(['covers', '.gitkeep'])

    // забираємо тільки об’єкт-айді подібні папки
    const candidateIds = dirs
      .filter((d) => !skip.has(d))
      .filter((d) => /^[a-f0-9]{24}$/i.test(d) && isValidObjectId(d))

    if (candidateIds.length === 0) return

    // витягуємо існуючі id з БД
    const [draftIds, caseIds] = await Promise.all([
      this.draftModel.distinct('_id'),
      this.caseModel.distinct('_id'),
    ])

    const keep = new Set<string>([
      ...draftIds.map(String),
      ...caseIds.map(String),
    ])

    for (const dir of candidateIds) {
      if (!keep.has(dir)) {
        const full = path.join(base, dir)
        try {
          fs.rmSync(full, { recursive: true, force: true })
          this.log.log(`Cleaned stray folder ${dir}`)
        } catch (e) {
          this.log.warn(`Failed to clean ${dir}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
  }

  onModuleInit() {
    // перший прогін через 2 хв після старту (щоб уникнути гонок зі свіжими аплоадами)
    setTimeout(() => {
      this.runOnce().catch((e) => this.log.error(e))
    }, 2 * 60 * 1000)

    // далі — кожну годину
    this.timer = setInterval(() => {
      this.runOnce().catch((e) => this.log.error(e))
    }, 60 * 60 * 1000)
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }
}
