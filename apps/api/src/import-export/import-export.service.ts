import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@kernle/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CompletenessService } from '../pim/completeness.service';
import { BillingService } from '../billing/billing.service';
import { StorageService } from '../dam/storage.service';

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.length);
  if (!lines.length) return { headers: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => esc(row[h])).join(','));
  }
  return lines.join('\n');
}

@Injectable()
export class ImportExportService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private completeness: CompletenessService,
    private billing: BillingService,
    private storage: StorageService,
  ) {}

  // ─── Import profiles ──────────────────────────────────────

  listProfiles(organizationId: string) {
    return this.prisma.importProfile.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createProfile(
    organizationId: string,
    actorId: string,
    data: {
      name: string;
      sourceType?: string;
      columnMapping?: Record<string, string>;
      updateBehavior?: 'create_only' | 'update_only' | 'upsert';
      scheduleCron?: string;
    },
  ) {
    const profile = await this.prisma.importProfile.create({
      data: {
        organizationId,
        name: data.name,
        sourceType: data.sourceType || 'csv',
        columnMapping: (data.columnMapping || {}) as Prisma.InputJsonValue,
        updateBehavior: (data.updateBehavior || 'upsert') as any,
        scheduleCron: data.scheduleCron,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'import_profile.create',
      entityType: 'ImportProfile',
      entityId: profile.id,
      after: profile,
    });
    return profile;
  }

  async updateProfile(
    organizationId: string,
    actorId: string,
    id: string,
    data: Partial<{
      name: string;
      columnMapping: Record<string, string>;
      updateBehavior: 'create_only' | 'update_only' | 'upsert';
      scheduleCron: string | null;
    }>,
  ) {
    const before = await this.prisma.importProfile.findFirst({ where: { id, organizationId } });
    if (!before) throw new NotFoundException('Import profile not found');
    const profile = await this.prisma.importProfile.update({
      where: { id },
      data: {
        name: data.name,
        columnMapping: data.columnMapping as Prisma.InputJsonValue | undefined,
        updateBehavior: data.updateBehavior as any,
        scheduleCron: data.scheduleCron === undefined ? undefined : data.scheduleCron,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'import_profile.update',
      entityType: 'ImportProfile',
      entityId: id,
      before,
      after: profile,
    });
    return profile;
  }

  async deleteProfile(organizationId: string, actorId: string, id: string) {
    const before = await this.prisma.importProfile.findFirst({ where: { id, organizationId } });
    if (!before) throw new NotFoundException('Import profile not found');
    await this.prisma.importProfile.delete({ where: { id } });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'import_profile.delete',
      entityType: 'ImportProfile',
      entityId: id,
      before,
    });
    return { deleted: true };
  }

  /**
   * CSV import with column mapping, per-row validation, partial success.
   * columnMapping: { csvHeader: productField } where productField is sku|familyCode|enabled|values.<attr>
   */
  async importCsv(
    organizationId: string,
    actorId: string,
    input: {
      csvText: string;
      profileId?: string;
      columnMapping?: Record<string, string>;
      updateBehavior?: 'create_only' | 'update_only' | 'upsert';
    },
  ) {
    let mapping = input.columnMapping || {};
    let behavior = input.updateBehavior || 'upsert';
    if (input.profileId) {
      const profile = await this.prisma.importProfile.findFirst({
        where: { id: input.profileId, organizationId },
      });
      if (!profile) throw new NotFoundException('Import profile not found');
      mapping = { ...(profile.columnMapping as Record<string, string>), ...mapping };
      behavior = (input.updateBehavior || profile.updateBehavior) as any;
    }

    const { headers, rows } = parseCsv(input.csvText);
    if (!headers.length) throw new BadRequestException('CSV has no headers');

    const job = await this.prisma.importJob.create({
      data: {
        organizationId,
        profileId: input.profileId,
        status: 'running',
        totalRows: rows.length,
        startedById: actorId,
        startedAt: new Date(),
      },
    });

    const errors: Array<{ row: number; error: string }> = [];
    let successRows = 0;

    const families = await this.prisma.family.findMany({ where: { organizationId } });
    const familyByCode = new Map(families.map((f) => [f.code, f]));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        const record: Record<string, string> = {};
        headers.forEach((h, idx) => {
          record[h] = row[idx] ?? '';
        });

        const mapped: Record<string, string> = {};
        for (const [csvCol, field] of Object.entries(mapping)) {
          if (csvCol in record) mapped[field] = record[csvCol];
        }
        // Default identity mapping when empty
        if (!Object.keys(mapping).length) {
          for (const h of headers) mapped[h] = record[h];
        }

        const sku = mapped.sku || mapped.SKU || mapped.Sku;
        if (!sku) throw new Error('Missing sku');

        let familyId: string | undefined;
        const familyCode = mapped.familyCode || mapped.family;
        if (familyCode) {
          const fam = familyByCode.get(familyCode);
          if (!fam) throw new Error(`Unknown family: ${familyCode}`);
          familyId = fam.id;
        }

        const enabled =
          mapped.enabled === undefined || mapped.enabled === ''
            ? undefined
            : !['false', '0', 'no', 'disabled'].includes(String(mapped.enabled).toLowerCase());

        const values: Record<string, any> = {};
        for (const [field, val] of Object.entries(mapped)) {
          if (['sku', 'SKU', 'Sku', 'familyCode', 'family', 'enabled'].includes(field)) continue;
          const code = field.startsWith('values.') ? field.slice(7) : field;
          values[code] = { '<all_channels>': { '<all_locales>': val } };
        }

        const existing = await this.prisma.product.findFirst({ where: { organizationId, sku } });

        if (existing) {
          if (behavior === 'create_only') throw new Error('Product exists (create_only)');
          const merged = {
            ...((existing.values as Record<string, any>) || {}),
            ...values,
          };
          await this.prisma.product.update({
            where: { id: existing.id },
            data: {
              values: merged as Prisma.InputJsonValue,
              familyId: familyId ?? existing.familyId,
              enabled: enabled ?? existing.enabled,
              updatedById: actorId,
            },
          });
          await this.completeness.refreshProduct(existing.id);
        } else {
          if (behavior === 'update_only') throw new Error('Product missing (update_only)');
          await this.billing.assertSkuLimit(organizationId);
          const product = await this.prisma.product.create({
            data: {
              organizationId,
              sku,
              familyId,
              enabled: enabled ?? true,
              values: values as Prisma.InputJsonValue,
              updatedById: actorId,
            },
          });
          await this.completeness.refreshProduct(product.id);
        }
        successRows += 1;
      } catch (err) {
        errors.push({ row: rowNum, error: (err as Error).message });
      }
    }

    const status =
      errors.length === 0 ? 'success' : successRows === 0 ? 'failed' : 'partial';

    const updated = await this.prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: status as any,
        successRows,
        errorRows: errors.length,
        errorLog: errors as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: 'import.csv',
      entityType: 'ImportJob',
      entityId: job.id,
      after: { status, successRows, errorRows: errors.length },
    });

    return { job: updated, errors, successRows, totalRows: rows.length };
  }

  listImportJobs(organizationId: string) {
    return this.prisma.importJob.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ─── Export ───────────────────────────────────────────────

  async exportCsv(
    organizationId: string,
    actorId: string,
    input: {
      filter?: {
        familyId?: string;
        enabled?: boolean;
        categoryId?: string;
        search?: string;
      };
      fields?: string[];
      profileId?: string;
    },
  ) {
    let filter = input.filter || {};
    let fields = input.fields || ['sku', 'familyCode', 'enabled'];
    if (input.profileId) {
      const profile = await this.prisma.exportProfile.findFirst({
        where: { id: input.profileId, organizationId },
      });
      if (profile) {
        filter = { ...(profile.filter as any), ...filter };
        const sel = profile.fieldSelection as string[];
        if (Array.isArray(sel) && sel.length) fields = sel;
      }
    }

    const where: Prisma.ProductWhereInput = {
      organizationId,
      ...(filter.familyId ? { familyId: filter.familyId } : {}),
      ...(filter.enabled !== undefined ? { enabled: filter.enabled } : {}),
      ...(filter.categoryId ? { categories: { some: { categoryId: filter.categoryId } } } : {}),
      ...(filter.search
        ? {
            OR: [
              { sku: { contains: filter.search, mode: 'insensitive' } },
              { searchText: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const products = await this.prisma.product.findMany({
      where,
      include: { family: true },
      take: 10000,
    });

    const getVal = (values: Record<string, any>, code: string) => {
      const v = values?.[code];
      if (v === undefined || v === null) return '';
      if (typeof v !== 'object') return v;
      const ch = v['<all_channels>'] || Object.values(v)[0];
      if (typeof ch !== 'object' || ch === null) return ch ?? '';
      return ch['<all_locales>'] ?? Object.values(ch)[0] ?? '';
    };

    const rows = products.map((p) => {
      const values = (p.values as Record<string, any>) || {};
      const row: Record<string, unknown> = {};
      for (const f of fields) {
        if (f === 'sku') row.sku = p.sku;
        else if (f === 'familyCode') row.familyCode = p.family?.code || '';
        else if (f === 'enabled') row.enabled = p.enabled;
        else if (f === 'geoScore') row.geoScore = p.geoScore;
        else row[f] = getVal(values, f.startsWith('values.') ? f.slice(7) : f);
      }
      return row;
    });

    const csv = toCsv(fields, rows);
    const key = `exports/${organizationId}/${Date.now()}-export.csv`;
    const stored = await this.storage.putObject(organizationId, key.replace(`${organizationId}/`, ''), Buffer.from(csv, 'utf8'), 'text/csv');

    const job = await this.prisma.exportJob.create({
      data: {
        organizationId,
        profileId: input.profileId,
        status: 'success',
        fileKey: stored.storageKey,
        rowCount: rows.length,
        startedById: actorId,
        finishedAt: new Date(),
      },
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: 'export.csv',
      entityType: 'ExportJob',
      entityId: job.id,
      after: { rowCount: rows.length, fileKey: stored.storageKey },
    });

    return {
      job,
      fileKey: stored.storageKey,
      downloadUrl: this.storage.getSignedUrl(stored.storageKey),
      rowCount: rows.length,
      csvPreview: csv.slice(0, 2000),
    };
  }

  listExportProfiles(organizationId: string) {
    return this.prisma.exportProfile.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createExportProfile(
    organizationId: string,
    actorId: string,
    data: {
      name: string;
      targetFormat?: string;
      filter?: object;
      fieldSelection?: string[];
      destination?: string;
      webhookUrl?: string;
    },
  ) {
    const profile = await this.prisma.exportProfile.create({
      data: {
        organizationId,
        name: data.name,
        targetFormat: data.targetFormat || 'csv',
        filter: (data.filter || {}) as Prisma.InputJsonValue,
        fieldSelection: (data.fieldSelection || []) as Prisma.InputJsonValue,
        destination: data.destination || 'download',
        webhookUrl: data.webhookUrl,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'export_profile.create',
      entityType: 'ExportProfile',
      entityId: profile.id,
      after: profile,
    });
    return profile;
  }
}
