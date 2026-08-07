import { Injectable } from '@nestjs/common';
import { Prisma } from '@kernle/db';
import { PrismaService } from '../prisma/prisma.service';

export type CompletenessMap = Record<string, number>;

export interface GeoBreakdown {
  completeness: number;
  descriptionLength: number;
  altText: number;
  structuredAttrs: number;
  total: number;
}

@Injectable()
export class CompletenessService {
  constructor(private prisma: PrismaService) {}

  /** Extract a channel/locale-aware value from product.values JSON. */
  getValue(
    values: Record<string, any>,
    code: string,
    channel?: string | null,
    locale?: string | null,
  ): unknown {
    const attr = values?.[code];
    if (attr === undefined || attr === null) return undefined;
    if (typeof attr !== 'object' || Array.isArray(attr)) return attr;

    const channelKey = channel || '<all_channels>';
    const scoped = attr[channelKey] ?? attr['<all_channels>'] ?? attr;
    if (typeof scoped !== 'object' || Array.isArray(scoped) || scoped === null) {
      return scoped;
    }

    const localeKey = locale || '<all_locales>';
    if (localeKey in scoped) return scoped[localeKey];
    if ('<all_locales>' in scoped) return scoped['<all_locales>'];
    const vals = Object.values(scoped);
    return vals.length === 1 ? vals[0] : undefined;
  }

  isFilled(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return !Number.isNaN(value);
    if (typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') {
      return Object.keys(value as object).length > 0;
    }
    return Boolean(value);
  }

  buildSearchText(values: Record<string, any>): string {
    const parts: string[] = [];
    const walk = (node: unknown) => {
      if (node === null || node === undefined) return;
      if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
        parts.push(String(node));
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node === 'object') {
        Object.values(node as object).forEach(walk);
      }
    };
    walk(values);
    return parts.join(' ').slice(0, 8000);
  }

  /**
   * Compute completeness % per channel+locale using family required attrs.
   * requiredForCompleteness is Json array of { channel, locale }.
   */
  async computeForProduct(productId: string): Promise<{
    completeness: CompletenessMap;
    searchText: string;
    geoScore: number;
    geoBreakdown: GeoBreakdown;
  }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        family: { include: { attributes: { include: { attribute: true } } } },
        assetLinks: { include: { asset: true } },
      },
    });
    if (!product) {
      return {
        completeness: {},
        searchText: '',
        geoScore: 0,
        geoBreakdown: {
          completeness: 0,
          descriptionLength: 0,
          altText: 0,
          structuredAttrs: 0,
          total: 0,
        },
      };
    }

    const values = (product.values as Record<string, any>) || {};
    const completeness: CompletenessMap = {};

    const channels = await this.prisma.channel.findMany({
      where: { organizationId: product.organizationId },
    });
    const locales = await this.prisma.locale.findMany({
      where: { organizationId: product.organizationId, enabled: true },
    });

    const requiredByScope = new Map<string, string[]>();
    for (const fa of product.family?.attributes || []) {
      const reqs = (fa.requiredForCompleteness as Array<{ channel?: string; locale?: string }>) || [];
      for (const r of reqs) {
        const key = `${r.channel || '*'}|${r.locale || '*'}`;
        const list = requiredByScope.get(key) || [];
        list.push(fa.attribute.code);
        requiredByScope.set(key, list);
      }
    }

    const scopeKeys = new Set<string>();
    for (const ch of channels) {
      for (const loc of locales) {
        if (ch.locales?.length && !ch.locales.includes(loc.code)) continue;
        scopeKeys.add(`${ch.code}|${loc.code}`);
      }
    }
    if (scopeKeys.size === 0) {
      for (const loc of locales) scopeKeys.add(`*|${loc.code}`);
      if (scopeKeys.size === 0) scopeKeys.add('*|*');
    }

    for (const scopeKey of scopeKeys) {
      const [channel, locale] = scopeKey.split('|');
      const codes = new Set<string>();
      for (const [reqKey, attrs] of requiredByScope) {
        const [rc, rl] = reqKey.split('|');
        const channelOk = rc === '*' || rc === channel || channel === '*';
        const localeOk = rl === '*' || rl === locale || locale === '*';
        if (channelOk && localeOk) attrs.forEach((c) => codes.add(c));
      }
      // Also match family attrs that list this exact channel/locale
      for (const fa of product.family?.attributes || []) {
        const reqs = (fa.requiredForCompleteness as Array<{ channel?: string; locale?: string }>) || [];
        for (const r of reqs) {
          if (
            (!r.channel || r.channel === channel || channel === '*') &&
            (!r.locale || r.locale === locale || locale === '*')
          ) {
            codes.add(fa.attribute.code);
          }
        }
      }

      if (codes.size === 0) {
        completeness[scopeKey] = 100;
        continue;
      }
      let filled = 0;
      for (const code of codes) {
        const v = this.getValue(values, code, channel === '*' ? null : channel, locale === '*' ? null : locale);
        if (this.isFilled(v)) filled += 1;
      }
      completeness[scopeKey] = Math.round((filled / codes.size) * 100);
    }

    const searchText = this.buildSearchText(values);
    const { geoScore, geoBreakdown } = this.computeGeoScore(values, completeness, product.assetLinks);

    return { completeness, searchText, geoScore, geoBreakdown };
  }

  computeGeoScore(
    values: Record<string, any>,
    completeness: CompletenessMap,
    assetLinks: Array<{ asset: { metadata: unknown; tags: string[] }; role: string }>,
  ): { geoScore: number; geoBreakdown: GeoBreakdown } {
    const comps = Object.values(completeness);
    const avgCompleteness = comps.length ? comps.reduce((a, b) => a + b, 0) / comps.length : 0;
    const completenessPts = Math.round((avgCompleteness / 100) * 40);

    const description =
      this.getValue(values, 'description') ||
      this.getValue(values, 'long_description') ||
      this.getValue(values, 'body') ||
      '';
    const descLen = String(description || '').length;
    const descriptionPts = Math.min(25, Math.round((Math.min(descLen, 500) / 500) * 25));

    const hasAlt =
      assetLinks.some((l) => {
        const meta = (l.asset.metadata as Record<string, unknown>) || {};
        return Boolean(meta.alt || meta.altText);
      }) || this.isFilled(this.getValue(values, 'image_alt'));
    const altTextPts = hasAlt ? 15 : 0;

    const structuredTypes = ['brand', 'gtin', 'ean', 'upc', 'mpn', 'color', 'size', 'material', 'weight'];
    let structuredFilled = 0;
    for (const code of structuredTypes) {
      if (this.isFilled(this.getValue(values, code))) structuredFilled += 1;
    }
    // Also count select/number-like non-empty top-level attrs beyond description
    const structuredPts = Math.min(20, structuredFilled * 4 + (Object.keys(values).length > 3 ? 4 : 0));

    const total = Math.min(100, completenessPts + descriptionPts + altTextPts + structuredPts);
    return {
      geoScore: total,
      geoBreakdown: {
        completeness: completenessPts,
        descriptionLength: descriptionPts,
        altText: altTextPts,
        structuredAttrs: structuredPts,
        total,
      },
    };
  }

  async refreshProduct(productId: string) {
    const result = await this.computeForProduct(productId);
    return this.prisma.product.update({
      where: { id: productId },
      data: {
        completeness: result.completeness as Prisma.InputJsonValue,
        searchText: result.searchText,
        geoScore: result.geoScore,
        geoBreakdown: result.geoBreakdown as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
