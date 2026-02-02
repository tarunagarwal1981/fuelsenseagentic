/**
 * World Port Repository (Pub150 / NGA World Port Index)
 *
 * CSV-based implementation: reads UpdatedPub150.csv, indexes by main/alternate
 * port name and by code. Supports findByName (with multi-match rule) and findByCode.
 * Later: swap to DB implementation with same interface.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { WorldPortEntry, IWorldPortRepository } from './types';

/** Raw row from CSV (column index -> value) */
type CsvRow = string[];

/** Harbor size rank for multi-match rule: higher = prefer */
const HARBOR_SIZE_RANK: Record<string, number> = {
  Large: 4,
  Medium: 3,
  Small: 2,
  'Very Small': 1,
  Unknown: 0,
};

/**
 * Parse a CSV line respecting quoted fields (handles commas inside quotes).
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Normalize port name for matching: lowercase, collapse spaces, optional strip of "port of" / "harbor".
 */
function normalizeName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  let s = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\bport of\b/gi, '')
    .replace(/\bharbor\b/gi, '')
    .replace(/\bport\b/gi, '')
    .trim();
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Normalize UN/LOCODE: remove space, uppercase (e.g. "JP TYO" -> "JPTYO").
 */
function normalizeCode(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, '').toUpperCase().trim();
}

export class WorldPortRepositoryCSV implements IWorldPortRepository {
  private entries: WorldPortEntry[] = [];
  private byMainName: Map<string, WorldPortEntry[]> = new Map();
  private byAlternateName: Map<string, WorldPortEntry[]> = new Map();
  private byCode: Map<string, WorldPortEntry> = new Map();
  private loaded = false;
  private readonly csvPath: string;

  constructor(csvPath?: string) {
    this.csvPath =
      csvPath ??
      path.join(process.cwd(), 'lib', 'data', 'UpdatedPub150.csv');
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    const content = await fs.readFile(this.csvPath, 'utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length < 2) {
      console.warn('[WorldPortRepository] CSV has no data rows');
      this.loaded = true;
      return;
    }
    const header = parseCsvLine(lines[0]);
    const col = (name: string): number => {
      const i = header.indexOf(name);
      if (i === -1) throw new Error(`[WorldPortRepository] Missing column: ${name}`);
      return i;
    };
    const oidCol = col('OID_');
    const mainCol = col('Main Port Name');
    const altCol = col('Alternate Port Name');
    const codeCol = col('UN/LOCODE');
    const countryCol = col('Country Code');
    const sizeCol = col('Harbor Size');
    const latCol = header.indexOf('Latitude');
    const lonCol = header.indexOf('Longitude');
    if (latCol === -1 || lonCol === -1) {
      throw new Error('[WorldPortRepository] Missing Latitude or Longitude column');
    }

    for (let r = 1; r < lines.length; r++) {
      const row = parseCsvLine(lines[r]);
      if (row.length <= Math.max(latCol, lonCol)) continue;
      const mainName = row[mainCol] ?? '';
      const altName = row[altCol] ?? '';
      const rawCode = (row[codeCol] ?? '').trim();
      const code = rawCode ? normalizeCode(rawCode) : null;
      const oid = String(row[oidCol] ?? r).replace(/\D/g, '') || String(r);
      const id = code ?? `WPI_${oid}`;
      const lat = parseFloat(row[latCol]);
      const lon = parseFloat(row[lonCol]);
      if (Number.isNaN(lat) || Number.isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        continue;
      }
      const entry: WorldPortEntry = {
        id,
        code,
        name: mainName || altName || id,
        coordinates: [lat, lon],
        countryCode: row[countryCol] ?? undefined,
        harborSize: row[sizeCol] ?? undefined,
      };
      this.entries.push(entry);
      this.byCode.set(id, entry);
      if (code) this.byCode.set(code, entry);

      const mainNorm = normalizeName(mainName);
      if (mainNorm) {
        const list = this.byMainName.get(mainNorm) ?? [];
        if (!list.some((e) => e.id === entry.id)) list.push(entry);
        this.byMainName.set(mainNorm, list);
        for (const word of mainNorm.split(/\s+/).filter((w) => w.length >= 2)) {
          const listW = this.byMainName.get(word) ?? [];
          if (!listW.some((e) => e.id === entry.id)) listW.push(entry);
          this.byMainName.set(word, listW);
        }
      }
      // Split alternate names by semicolon and index each part separately
      // e.g., "Dubai; Mina Rashid" → ["Dubai", "Mina Rashid"]
      const altNames = altName.split(';').map(n => n.trim()).filter(n => n.length > 0);
      for (const singleAltName of altNames) {
        const altNorm = normalizeName(singleAltName);
        if (altNorm && altNorm !== mainNorm) {
          const list = this.byAlternateName.get(altNorm) ?? [];
          if (!list.some((e) => e.id === entry.id)) list.push(entry);
          this.byAlternateName.set(altNorm, list);
          for (const word of altNorm.split(/\s+/).filter((w) => w.length >= 2)) {
            const listW = this.byAlternateName.get(word) ?? [];
            if (!listW.some((e) => e.id === entry.id)) listW.push(entry);
            this.byAlternateName.set(word, listW);
          }
        }
      }
    }
    this.loaded = true;
    console.log(`[WorldPortRepository] Loaded ${this.entries.length} ports from Pub150 CSV`);
  }

  /**
   * Multi-match rule (e.g. Singapore): exact main name > has UN/LOCODE > Harbor Size (Large/Medium) > stable (OID).
   */
  private pickOne(candidates: WorldPortEntry[], queryNorm: string): WorldPortEntry | null {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const exactMain = candidates.filter(
      (e) => normalizeName(e.name) === queryNorm
    );
    if (exactMain.length === 1) return exactMain[0];
    if (exactMain.length > 1) {
      exactMain.sort((a, b) => {
        const aCode = a.code ? 1 : 0;
        const bCode = b.code ? 1 : 0;
        if (bCode !== aCode) return bCode - aCode;
        const aSize = HARBOR_SIZE_RANK[a.harborSize ?? ''] ?? 0;
        const bSize = HARBOR_SIZE_RANK[b.harborSize ?? ''] ?? 0;
        if (bSize !== aSize) return bSize - aSize;
        return a.id.localeCompare(b.id);
      });
      return exactMain[0];
    }

    candidates.sort((a, b) => {
      const aCode = a.code ? 1 : 0;
      const bCode = b.code ? 1 : 0;
      if (bCode !== aCode) return bCode - aCode;
      const aSize = HARBOR_SIZE_RANK[a.harborSize ?? ''] ?? 0;
      const bSize = HARBOR_SIZE_RANK[b.harborSize ?? ''] ?? 0;
      if (bSize !== aSize) return bSize - aSize;
      return a.id.localeCompare(b.id);
    });
    return candidates[0];
  }

  async findByName(name: string): Promise<WorldPortEntry | null> {
    await this.load();
    const norm = normalizeName(name);
    if (!norm) return null;
    
    console.log(`🔍 [WORLD-PORT-REPO] Searching for: "${name}" (normalized: "${norm}")`);
    
    // STEP 1: Try exact match in Main Port Name index
    console.log(`📍 [WORLD-PORT-REPO] Step 1: Searching Main Port Name index...`);
    let fromMain = this.byMainName.get(norm) ?? [];
    
    if (fromMain.length > 0) {
      console.log(`✅ [WORLD-PORT-REPO] Found ${fromMain.length} matches in Main Port Name`);
      const best = this.pickOne(fromMain, norm);
      if (best) {
        console.log(`🏆 [WORLD-PORT-REPO] Selected: ${best.id} - ${best.name}`);
        return best;
      }
    }
    
    // STEP 2: Try exact match in Alternate Port Name index
    console.log(`📍 [WORLD-PORT-REPO] Step 2: Searching Alternate Port Name index...`);
    let fromAlt = this.byAlternateName.get(norm) ?? [];
    
    if (fromAlt.length > 0) {
      console.log(`✅ [WORLD-PORT-REPO] Found ${fromAlt.length} matches in Alternate Port Name`);
      const best = this.pickOne(fromAlt, norm);
      if (best) {
        console.log(`🏆 [WORLD-PORT-REPO] Selected: ${best.id} - ${best.name}`);
        return best;
      }
    }
    
    // STEP 3: Try partial match (word-based search) - combine both indexes
    console.log(`📍 [WORLD-PORT-REPO] Step 3: Trying word-based partial matching...`);
    const words = norm.split(/\s+/).filter(w => w.length >= 2);
    for (const word of words) {
      const mainMatches = this.byMainName.get(word) ?? [];
      const altMatches = this.byAlternateName.get(word) ?? [];
      
      const combined = [...mainMatches];
      for (const e of altMatches) {
        if (!combined.some((c) => c.id === e.id)) combined.push(e);
      }
      
      if (combined.length > 0) {
        console.log(`✅ [WORLD-PORT-REPO] Found ${combined.length} matches for word "${word}"`);
        const best = this.pickOne(combined, norm);
        if (best) {
          console.log(`🏆 [WORLD-PORT-REPO] Selected: ${best.id} - ${best.name}`);
          return best;
        }
      }
    }
    
    // STEP 4: Not found
    console.warn(`❌ [WORLD-PORT-REPO] Port "${name}" not found in any index`);
    return null;
  }

  async findByCode(code: string): Promise<WorldPortEntry | null> {
    await this.load();
    const key = code.replace(/\s+/g, '').toUpperCase().trim();
    return this.byCode.get(key) ?? null;
  }
}
