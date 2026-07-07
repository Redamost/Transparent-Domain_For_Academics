// ─── Data Normalizer ───
// Merges scraped data from multiple sources into a unified NormalizedPerson.
// Handles: name canonicalization, field mapping, institution normalization,
//          publication dedup within a person, and confidence scoring.

import type { ScrapedPerson, ScrapedPublication, NormalizedPerson } from './types';

// ─── Name Canonicalization ───

const NAME_NORMALIZE_PATTERNS = [
  /Prof\.?\s*/gi,
  /Dr\.?\s*/gi,
  /Mr\.?\s*/gi,
  /Ms\.?\s*/gi,
  /Mrs\.?\s*/gi,
  /Ph\.?D\.?\s*/gi,
  /M\.?D\.?\s*/gi,
  /Sc\.?D\.?\s*/gi,
  /\s+\([^)]*\)/g, // Remove parenthetical suffixes
];

/**
 * Clean and canonicalize a person name.
 */
export function canonicalizeName(name: string): string {
  let cleaned = name.trim();
  for (const pattern of NAME_NORMALIZE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Generate name variants for fuzzy matching.
 */
export function generateNameVariants(name: string): string[] {
  const variants: string[] = [name];
  const parts = name.split(/\s+/);

  if (parts.length >= 2) {
    // First Last
    variants.push(`${parts[0]} ${parts[parts.length - 1]}`);
    // Last, First
    variants.push(`${parts[parts.length - 1]}, ${parts[0]}`);
    // F. Last
    if (parts[0].length > 0) {
      variants.push(`${parts[0][0]}. ${parts[parts.length - 1]}`);
    }
    // Last F.
    variants.push(`${parts[parts.length - 1]} ${parts[0][0]}.`);
    // Reversed (for Chinese name format)
    if (parts.length === 2) {
      variants.push(`${parts[1]} ${parts[0]}`);
    }
  }

  return [...new Set(variants)];
}

// ─── Institution Normalization ───

const INSTITUTION_ABBREV: Record<string, string> = {
  'mit': 'Massachusetts Institute of Technology',
  'cmu': 'Carnegie Mellon University',
  'ucb': 'University of California, Berkeley',
  'ucla': 'University of California, Los Angeles',
  'ucsd': 'University of California, San Diego',
  'eth': 'ETH Zurich',
  'epfl': 'École Polytechnique Fédérale de Lausanne',
  'caltech': 'California Institute of Technology',
  'tsinghua': 'Tsinghua University',
  'pku': 'Peking University',
  'zju': 'Zhejiang University',
  'fudan': 'Fudan University',
  'sjtu': 'Shanghai Jiao Tong University',
  'ustc': 'University of Science and Technology of China',
  'nus': 'National University of Singapore',
  'ntu': 'Nanyang Technological University',
  'hku': 'University of Hong Kong',
  'cuhk': 'Chinese University of Hong Kong',
};

/**
 * Normalize institution name to a canonical form.
 */
export function normalizeInstitution(name: string | null): string | null {
  if (!name) return null;

  const cleaned = name.trim();

  // Check abbreviation map
  const lower = cleaned.toLowerCase();
  for (const [abbrev, full] of Object.entries(INSTITUTION_ABBREV)) {
    if (lower === abbrev) {
      return full;
    }
    // Use word-boundary matching to prevent false substring matches
    // e.g. "nus" should NOT match "GenusBio" or "sinus"
    const escaped = abbrev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`).test(lower)) {
      return full;
    }
  }

  // Remove common suffixes
  let normalized = cleaned
    .replace(/\s*,\s*(USA|US|United States|UK|China|Germany|France|Japan|Canada)$/i, '')
    .replace(/\s+University$/, ' University')
    .trim();

  return normalized || cleaned;
}

// ─── Field Mapping ───

/**
 * Map raw research interest strings to our internal field slugs.
 * Uses keyword matching against common research areas.
 */
const FIELD_KEYWORD_MAP: Record<string, string> = {
  // Computer Science
  'artificial_intelligence': 'ai-machine-learning',
  'machine_learning': 'ai-machine-learning',
  'deep_learning': 'ai-machine-learning',
  'neural_network': 'ai-machine-learning',
  'computer_vision': 'computer-vision',
  'natural_language_processing': 'nlp',
  'nlp': 'nlp',
  'robotics': 'robotics',
  'data_mining': 'data-science',
  'data_science': 'data-science',
  'cybersecurity': 'cybersecurity',
  'software_engineering': 'software-engineering',
  'distributed_systems': 'distributed-systems',
  'computer_networks': 'computer-networks',
  'human_computer_interaction': 'hci',
  'hci': 'hci',
  'theoretical_computer_science': 'theory',
  'algorithms': 'algorithms',
  // Biology
  'molecular_biology': 'molecular-biology',
  'genetics': 'genetics',
  'genomics': 'genomics',
  'bioinformatics': 'bioinformatics',
  'cell_biology': 'cell-biology',
  'neuroscience': 'neuroscience',
  'immunology': 'immunology',
  'microbiology': 'microbiology',
  'ecology': 'ecology',
  'evolutionary_biology': 'evolutionary-biology',
  // Physics
  'quantum_mechanics': 'quantum-physics',
  'quantum_physics': 'quantum-physics',
  'particle_physics': 'particle-physics',
  'astrophysics': 'astrophysics',
  'condensed_matter': 'condensed-matter',
  'optics': 'optics-photonics',
  'photonics': 'optics-photonics',
  'nuclear_physics': 'nuclear-physics',
  // Medicine
  'cardiology': 'cardiology',
  'oncology': 'oncology',
  'neurology': 'neurology',
  'immunology_medical': 'immunology',
  'epidemiology': 'epidemiology',
  'public_health': 'public-health',
  'surgery': 'surgery',
  'pediatrics': 'pediatrics',
  'psychiatry': 'psychiatry',
};

/** Chinese research keyword → field slug mapping */
const FIELD_KEYWORD_MAP_ZH: Record<string, string> = {
  // Computer Science
  '人工智能': 'ai-machine-learning',
  '机器学习': 'ai-machine-learning',
  '深度学习': 'ai-machine-learning',
  '神经网络': 'ai-machine-learning',
  '计算机视觉': 'computer-vision',
  '自然语言处理': 'nlp',
  '机器人': 'robotics',
  '机器人学': 'robotics',
  '数据挖掘': 'data-science',
  '数据科学': 'data-science',
  '大数据': 'data-science',
  '网络安全': 'cybersecurity',
  '信息安全': 'cybersecurity',
  '网络空间安全': 'cybersecurity',
  '软件工程': 'software-engineering',
  '分布式系统': 'distributed-systems',
  '计算机网络': 'computer-networks',
  '人机交互': 'hci',
  '算法': 'algorithms',
  '计算理论': 'theory',
  '计算机理论': 'theory',
  '物联网': 'distributed-systems',
  '云计算': 'distributed-systems',
  // Biology
  '分子生物学': 'molecular-biology',
  '遗传学': 'genetics',
  '基因组学': 'genomics',
  '生物信息学': 'bioinformatics',
  '细胞生物学': 'cell-biology',
  '神经科学': 'neuroscience',
  '免疫学': 'immunology',
  '微生物学': 'microbiology',
  '生态学': 'ecology',
  '进化生物学': 'evolutionary-biology',
  // Physics
  '量子力学': 'quantum-physics',
  '量子物理': 'quantum-physics',
  '粒子物理': 'particle-physics',
  '天体物理': 'astrophysics',
  '凝聚态物理': 'condensed-matter',
  '光学': 'optics-photonics',
  '光子学': 'optics-photonics',
  '核物理': 'nuclear-physics',
  // Medicine
  '心脏病学': 'cardiology',
  '肿瘤学': 'oncology',
  '神经病学': 'neurology',
  '流行病学': 'epidemiology',
  '公共卫生': 'public-health',
  '外科学': 'surgery',
  '儿科学': 'pediatrics',
  '精神病学': 'psychiatry',
  '免疫医学': 'immunology',
  // Materials / Chemistry
  '材料科学': 'materials-science',
  '纳米材料': 'materials-science',
  '材料科学与工程': 'materials-science',
  '有机化学': 'organic-chemistry',
  '无机化学': 'inorganic-chemistry',
  '物理化学': 'physical-chemistry',
  '高分子化学': 'organic-chemistry',
  // Economics / Management
  '经济学': 'economics',
  '金融学': 'finance',
  '管理学': 'management',
  // Engineering
  '电气工程': 'electrical-engineering',
  '机械工程': 'mechanical-engineering',
  '土木工程': 'civil-engineering',
  '化学工程': 'chemical-engineering',
  '环境工程': 'environmental-engineering',
  '环境科学': 'environmental-science',
  '电子工程': 'electrical-engineering',
  '控制科学': 'robotics',
  '控制科学与工程': 'robotics',
  '自动化': 'robotics',
  '通信工程': 'computer-networks',
  '信息与通信工程': 'computer-networks',
};

export function mapToFieldSlugs(rawFields: string[]): string[] {
  const mapped = new Set<string>();

  for (const raw of rawFields) {
    let matched = false;

    // 1. Check Chinese keyword map (exact match)
    if (FIELD_KEYWORD_MAP_ZH[raw]) {
      mapped.add(FIELD_KEYWORD_MAP_ZH[raw]);
      continue;
    }

    // 2. Check if raw contains a Chinese keyword (substring match)
    for (const [zhKeyword, slug] of Object.entries(FIELD_KEYWORD_MAP_ZH)) {
      if (raw.includes(zhKeyword)) {
        mapped.add(slug);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // 3. Fall through to English keyword matching
    const normalized = raw.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
    const slug = FIELD_KEYWORD_MAP[normalized] || normalized;
    if (slug) mapped.add(slug);
  }

  return [...mapped];
}

// ─── Publication Dedup (within person) ───

/**
 * Deduplicate publications within a single person's record.
 * Uses DOI first, then fuzzy title matching.
 */
export function dedupPersonPublications(
  publications: ScrapedPublication[]
): ScrapedPublication[] {
  const seen = new Set<string>();
  const merged: ScrapedPublication[] = [];

  for (const pub of publications) {
    // DOI match (strongest)
    if (pub.doi) {
      const normalizedDoi = pub.doi.toLowerCase().trim();
      if (seen.has(`doi:${normalizedDoi}`)) continue;
      seen.add(`doi:${normalizedDoi}`);
    }

    // Title fuzzy match — preserves CJK and accented characters
    const titleKey = pub.title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')  // Unicode-aware: keep letters + numbers
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 120);  // Longer key for CJK titles (one char ≈ one word)

    if (titleKey.length > 0) {
      if (seen.has(`title:${titleKey}`)) continue;
      seen.add(`title:${titleKey}`);
    } else {
      // Fallback: if title is all-symbols after normalization, dedup by year+journal
      const fallbackKey = `${pub.year || 'unknown'}|${(pub.journal || '').toLowerCase().trim()}`;
      if (seen.has(`fallback:${fallbackKey}`)) continue;
      seen.add(`fallback:${fallbackKey}`);
    }

    merged.push(pub);
  }

  return merged;
}

// ─── Confidence Calculation ───

/**
 * Calculate confidence score based on both source count and data completeness.
 * A single source with rich data is more trustworthy than 3 empty sources.
 */
function calculateConfidence(
  sources: ScrapedPerson[],
  completeness: {
    hasPublications: boolean;
    hasEmail: boolean;
    hasHIndex: boolean;
    hasCitationCount: boolean;
    hasBio: boolean;
    hasInstitution: boolean;
    hasDepartment: boolean;
    hasOrcid: boolean;
  }
): number {
  // Base confidence from number of corroborating sources
  let confidence = sources.length >= 3 ? 0.7 : sources.length >= 2 ? 0.6 : 0.4;

  // Bonus for data completeness (max +0.3)
  let bonus = 0;
  if (completeness.hasPublications) bonus += 0.08;
  if (completeness.hasEmail) bonus += 0.05;
  if (completeness.hasHIndex) bonus += 0.04;
  if (completeness.hasCitationCount) bonus += 0.03;
  if (completeness.hasBio) bonus += 0.03;
  if (completeness.hasInstitution) bonus += 0.03;
  if (completeness.hasDepartment) bonus += 0.02;
  if (completeness.hasOrcid) bonus += 0.02;

  confidence = Math.min(1.0, confidence + bonus);
  return Math.round(confidence * 100) / 100;
}

// ─── Merge Multiple Sources ───

/**
 * Merge multiple ScrapedPerson records (from different sources) for the same person
 * into a single NormalizedPerson with combined data.
 */
export function mergePersonSources(sources: ScrapedPerson[]): NormalizedPerson {
  if (sources.length === 0) throw new Error('No sources to merge');
  if (sources.length === 1) {
    const s = sources[0];
    return {
      id: '', // Will be set by deduplicator
      nameZh: s.nameZh,
      nameEn: s.nameEn,
      alternativeNames: s.alternativeNames,
      title: s.title,
      institution: s.institution,
      department: s.department,
      orcidId: s.source === 'ORCID' ? s.sourceId : null,
      googleScholarId: s.source === 'GOOGLE_SCHOLAR' ? s.sourceId : null,
      researchGateId: s.source === 'RESEARCHGATE' ? s.sourceId : null,
      semanticScholarId: s.source === 'SEMANTIC_SCHOLAR' ? s.sourceId : null,
      email: s.email,
      website: s.website,
      avatarUrl: s.avatarUrl,
      bio: s.bio,
      hIndex: s.hIndex,
      citationCount: s.citationCount,
      publicationCount: s.publicationCount,
      fields: mapToFieldSlugs(s.fields),
      publications: s.publications,
      researchUpdates: s.researchUpdates || [],
      competitionUpdates: s.competitionUpdates || [],
      evaluationUpdates: s.evaluationUpdates || [],
      sources: [s.source],
      confidence: 1.0,
      metadata: s.rawMetadata,
    };
  }

  // Merge strategy: prefer ORCID for names, Scholar/S2 for metrics, CN_UNIVERSITY for basic info
  const scholar = sources.find((s) => s.source === 'GOOGLE_SCHOLAR');
  const s2 = sources.find((s) => s.source === 'SEMANTIC_SCHOLAR');
  const orcid = sources.find((s) => s.source === 'ORCID');
  const rg = sources.find((s) => s.source === 'RESEARCHGATE');
  const cn = sources.find((s) => s.source === 'CN_UNIVERSITY');

  // Name — prefer ORCID (most authoritative), then CN University
  const nameZh = orcid?.nameZh || cn?.nameZh || scholar?.nameZh || s2?.nameZh || rg?.nameZh || null;
  const nameEn = orcid?.nameEn || cn?.nameEn || scholar?.nameEn || s2?.nameEn || rg?.nameEn || null;

  // Collect all alternative names
  const altNames = new Set<string>();
  for (const s of sources) {
    for (const alt of s.alternativeNames) altNames.add(alt);
  }

  // Institution — prefer most recent (CN_UNIVERSITY > ORCID > S2 > RG > Scholar)
  const institution = normalizeInstitution(
    cn?.institution || orcid?.institution || s2?.institution || rg?.institution || scholar?.institution || null
  );

  // Metrics — prefer S2 (best citation data, accessible from China), fallback to Scholar then RG
  const hIndex = s2?.hIndex || scholar?.hIndex || rg?.hIndex || null;
  const citationCount = s2?.citationCount || scholar?.citationCount || rg?.citationCount || null;

  // Publications — merge all sources, dedup
  const allPubs = sources.flatMap((s) => s.publications);
  const publications = dedupPersonPublications(allPubs);

  // Fields — merge all
  const allFields = new Set<string>();
  for (const s of sources) {
    for (const f of mapToFieldSlugs(s.fields)) {
      allFields.add(f);
    }
  }

  // Bio — prefer ORCID, then CN University
  const bio = orcid?.bio || cn?.bio || rg?.bio || null;

  // Email — prefer CN University (most up-to-date), then ORCID
  const email = cn?.email || orcid?.email || scholar?.email || rg?.email || null;

  // Department — prefer CN University, then ORCID
  const department = cn?.department || orcid?.department || rg?.department || null;

  return {
    id: '',
    nameZh,
    nameEn,
    alternativeNames: [...altNames],
    title: cn?.title || orcid?.title || scholar?.title || null,
    institution,
    department,
    orcidId: orcid?.sourceId || null,
    googleScholarId: scholar?.sourceId || null,
    researchGateId: rg?.sourceId || null,
    semanticScholarId: s2?.sourceId || null,
    email,
    website: cn?.website || orcid?.website || scholar?.website || rg?.website || null,
    avatarUrl: scholar?.avatarUrl || rg?.avatarUrl || null,
    bio,
    hIndex,
    citationCount,
    publicationCount: publications.length || null,
    fields: [...allFields],
    publications,
    researchUpdates: [
      ...(cn?.researchUpdates || []),
      ...(orcid?.researchUpdates || []),
      ...(s2?.researchUpdates || []),
      ...(scholar?.researchUpdates || []),
      ...(rg?.researchUpdates || []),
    ],
    competitionUpdates: [
      ...(cn?.competitionUpdates || []),
    ],
    evaluationUpdates: [
      ...(cn?.evaluationUpdates || []),
    ],
    sources: sources.map((s) => s.source),
    confidence: calculateConfidence(sources, {
      hasPublications: allPubs.length > 0,
      hasEmail: !!email,
      hasHIndex: hIndex !== null,
      hasCitationCount: citationCount !== null,
      hasBio: !!bio,
      hasInstitution: !!institution,
      hasDepartment: !!department,
      hasOrcid: !!orcid?.sourceId,
    }),
    metadata: {
      sourceProfiles: sources.map((s) => ({
        source: s.source,
        sourceId: s.sourceId,
        ...s.rawMetadata,
      })),
    },
  };
}

/**
 * Calculate confidence that two ScrapedPerson records refer to the same real person.
 * Uses name similarity, institution overlap, field overlap, and ORCID/email matching.
 */
export function calculatePersonSimilarity(a: ScrapedPerson, b: ScrapedPerson): number {
  let score = 0;
  let total = 0;

  // Same source and ID = definite match
  if (a.source === b.source && a.sourceId === b.sourceId) {
    return 1.0;
  }

  // Name similarity (40%)
  const nameScore = calculateNameSimilarity(
    a.nameEn || a.nameZh || '',
    b.nameEn || b.nameZh || ''
  );
  score += nameScore * 0.4;
  total += 0.4;

  // Institution match (25%)
  if (a.institution && b.institution) {
    const aNorm = normalizeInstitution(a.institution);
    const bNorm = normalizeInstitution(b.institution);
    if (aNorm && bNorm && aNorm.toLowerCase() === bNorm.toLowerCase()) {
      score += 0.25;
    } else if (aNorm && bNorm && (
      aNorm.toLowerCase().includes(bNorm.toLowerCase()) ||
      bNorm.toLowerCase().includes(aNorm.toLowerCase())
    )) {
      score += 0.15;
    }
  }
  total += 0.25;

  // Field overlap (15%)
  if (a.fields.length > 0 && b.fields.length > 0) {
    const aSet = new Set(mapToFieldSlugs(a.fields));
    const bSet = new Set(mapToFieldSlugs(b.fields));
    const intersection = new Set([...aSet].filter((f) => bSet.has(f)));
    const union = new Set([...aSet, ...bSet]);
    if (union.size > 0) {
      score += (intersection.size / union.size) * 0.15;
    }
  }
  total += 0.15;

  // Email match (10%)
  if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) {
    score += 0.1;
  }
  total += 0.1;

  // Department match (10%)
  if (a.department && b.department) {
    if (a.department.toLowerCase() === b.department.toLowerCase()) {
      score += 0.1;
    }
  }
  total += 0.1;

  return total > 0 ? score / total : 0;
}

/**
 * Simple name similarity using trigram overlap.
 */
function calculateNameSimilarity(nameA: string, nameB: string): number {
  const a = nameA.toLowerCase();
  const b = nameB.toLowerCase();

  if (a === b) return 1.0;

  // Check if one contains the other
  if (a.includes(b) || b.includes(a)) return 0.9;

  // Check for swapped order (common in Western/Chinese name differences)
  const partsA = a.split(/\s+/);
  const partsB = b.split(/\s+/);
  if (partsA.length === 2 && partsB.length === 2) {
    if (partsA[0] === partsB[1] && partsA[1] === partsB[0]) return 0.85;
  }

  // Trigram similarity
  const trigramsA = getTrigrams(a);
  const trigramsB = getTrigrams(b);
  if (trigramsA.length === 0 && trigramsB.length === 0) return 0;

  const intersection = trigramsA.filter((t) => trigramsB.includes(t)).length;
  const union = new Set([...trigramsA, ...trigramsB]).size;

  return union > 0 ? intersection / union : 0;
}

function getTrigrams(s: string): string[] {
  const trigrams: string[] = [];
  const padded = `  ${s} `;
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.push(padded.substring(i, i + 3));
  }
  return trigrams;
}
