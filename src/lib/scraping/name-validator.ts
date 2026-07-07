// ─── Person Name Validator ───
// Filters out non-person entities (journals, fields, departments, garbled text)
// that APIs like ORCID and Semantic Scholar incorrectly return as "authors".
// This is the primary quality gate — run BEFORE any DB insertion.

// ─── Rejected Patterns ───

/** Field/academic discipline names that APIs commonly return as "persons" */
const FIELD_NAMES = new Set([
  'artificial intelligence', 'computer science', 'biology', 'chemistry',
  'physics', 'mathematics', 'economics', 'medicine', 'epidemiology',
  'science', 'neuroscience', 'engineering', 'psychology', 'sociology',
  'linguistics', 'philosophy', 'statistics', 'geography', 'geology',
  'astronomy', 'botany', 'zoology', 'ecology', 'genetics', 'biochemistry',
  'microbiology', 'immunology', 'pharmacology', 'pathology', 'radiology',
  'anesthesiology', 'cardiology', 'dermatology', 'endocrinology',
  'gastroenterology', 'hematology', 'nephrology', 'oncology',
  'ophthalmology', 'orthopedics', 'pediatrics', 'psychiatry',
  'rheumatology', 'urology', 'virology', 'nanotechnology',
  'biotechnology', 'robotics', 'cybersecurity', 'data science',
  'machine learning', 'deep learning', 'natural language processing',
  'computer vision', 'reinforcement learning',
  'mobile computing', 'new algorithm', 'pattern recognition',
  'computational biology', 'systems biology', 'materials chemistry',
]);

/** Journal/publication keywords — these are NOT people */
const PUBLICATION_KEYWORDS = [
  'journal', 'transactions', 'bulletin', 'proceedings', 'annals',
  'review of', 'textbook of', 'a review', 'editor', 'publications',
  'publisher', 'press', 'edition', 'volume', 'issue',
  'international conference', 'symposium', 'workshop',
];

/** Organization/department keywords — these are NOT people */
const ORG_KEYWORDS = [
  'department', 'institute', 'center for', 'centre for',
  'laboratory', 'college', 'university', 'school of',
  'faculty of', 'division of', 'academy of', 'society of',
  'association of', 'foundation', 'research group',
  'research center', 'research centre', 'research unit',
  'research institute', 'corp', 'inc', 'ltd', 'llc',
  'limited', 'corporation', 'company',
];

/** Known non-person entities that appear in name fields */
const KNOWN_ENTITIES = new Set([
  'eli lilly', 'pfizer', 'roche', 'novartis', 'merck', 'astrazeneca',
  'johnson & johnson', 'sanofi', 'gsk', 'glaxosmithkline',
  'google', 'microsoft', 'apple', 'amazon', 'meta', 'facebook',
  'tencent', 'alibaba', 'baidu', 'huawei', 'bytedance',
  'international journal', 'journal of', 'ieee', 'acm', 'springer',
  'elsevier', 'wiley', 'nature publishing',
]);

/** Financial/business terms frequently appearing as garbage names */
const BUSINESS_KEYWORDS = [
  'stock market', 'stock exchange', 'hedge fund', 'investment',
  'securities', 'banking', 'insurance', 'real estate',
  'market research', 'consulting', 'holdings', 'capital',
  'private equity', 'venture capital', 'asset management',
];

/** Non-person title prefixes that shouldn't appear in name fields */
const TITLE_PREFIXES = [
  'professor ', 'prof ', 'doctor ', 'dr ',
  'mr ', 'mrs ', 'ms ', 'miss ',
  'chairman ', 'president ', 'ceo ', 'cto ', 'cfo ',
  'director ', 'manager ', 'engineer ', 'researcher ',
  'scientist ', 'analyst ', 'consultant ',
];

/** Chinese academic field names — these are NOT people */
const FIELD_NAMES_ZH = new Set([
  '人工智能', '机器学习', '深度学习', '计算机科学', '计算机科学与技术',
  '软件工程', '数据科学', '大数据', '云计算', '物联网',
  '生物医学', '生物医学工程', '生物信息学', '分子生物学', '细胞生物学',
  '化学', '有机化学', '无机化学', '分析化学', '物理化学', '高分子化学',
  '物理学', '理论物理', '凝聚态物理', '光学', '量子力学', '粒子物理',
  '数学', '应用数学', '统计学', '概率论', '计算数学',
  '经济学', '金融学', '管理学', '会计学', '市场营销',
  '机械工程', '电气工程', '电子工程', '土木工程', '材料科学', '材料科学与工程',
  '环境科学', '环境工程', '地理学', '地质学', '地球科学',
  '临床医学', '基础医学', '药学', '公共卫生', '护理学',
  '心理学', '社会学', '哲学', '历史学', '考古学',
  '法学', '政治学', '语言学', '新闻传播学', '教育学',
  '控制科学', '控制科学与工程', '自动化',
  '通信工程', '信息与通信工程', '电子科学与技术',
  '网络安全', '信息安全', '网络空间安全',
  '遥感科学', '遥感', '测绘科学', '测绘',
  '食品科学', '食品科学与工程',
  '农学', '作物学', '园艺学', '植物保护',
  '畜牧学', '兽医学', '水产学',
  '力学', '动力工程', '工程热物理',
  '微电子', '集成电路', '半导体',
  '纳米科学', '纳米技术',
  '机器人学', '机器人技术',
  '天文学', '海洋科学', '大气科学',
]);

/** Chinese organization/department keywords — these are NOT people */
const ORG_KEYWORDS_ZH = [
  '学院', '大学', '系', '研究所', '研究院', '研究中心',
  '实验室', '重点实验室', '工程中心', '工程技术中心',
  '教研室', '学部', '中心', '部门',
  '学会', '协会', '委员会', '专家组',
  '科学院', '工程院', '社科院',
  '课题组', '团队',
];

/** Garbled encoding patterns — GBK/UTF-8 mojibake artifacts */
const GARBLED_CHARS = /[Ã¢âàäåçèêëìîïòôùûýÿĀāĂăĄą]/;

/**
 * Names consisting purely of Latin-script characters (including common accented
 * European letters) should skip the GARBLED_CHARS check. The check was designed
 * to catch mojibake artifacts mixed with CJK characters, not European names.
 * e.g. "José Silva", "Müller", "François", "Muñoz" are all valid.
 */
const EUROPEAN_NAME = /^[A-Za-zÀ-ÖØ-öø-ÿ\s.\-'Š-šŽž]+$/;

/** Single-letter-initial patterns: "A.", "A. B.", "A. B. C.", "X. Y." */
const INITIALS_ONLY = /^[A-Z]\.(\s+[A-Z]\.)*$/;

/** Starts with garbage: "-. Chemistry", ".. O. Physics", "1. Something" */
const STARTS_WITH_GARBAGE = /^[-–—.…\d]+\s/;

/** Name is too short (less than 2 meaningful characters) */
const TOO_SHORT = /^.{0,1}$/;

/** Name length is too long for a person (likely a title/job) */
const TOO_LONG = 120;

/** Name contains excessive punctuation */
const EXCESSIVE_PUNCTUATION = /[(){}\[\]<>|\\]{2,}/;

/** Name matches common degree/certification patterns */
const DEGREE_PATTERNS = /\b(PhD|M\.?Sc|M\.?A\.?|B\.?Sc|B\.?A\.?|M\.?Tech|B\.?Tech|M\.?D\.?|Dr\.?|Prof\.?)\b/i;

// ─── Validation Logic ───

export interface NameValidationResult {
  valid: boolean;
  reason: string;
  /** Suggested sanitized name if fixable */
  sanitized?: string;
  /** Non-fatal warning when one language name is valid but the other looks suspicious */
  crossLanguageWarning?: string;
}

/**
 * Main validation: determine if a name string represents a real person.
 * Returns detailed rejection reasons for logging/debugging.
 */
export function isValidPersonName(name: string | null | undefined): NameValidationResult {
  // Null/empty check
  if (!name || !name.trim()) {
    return { valid: false, reason: 'Name is empty or null' };
  }

  const original = name.trim();

  // Too short — different thresholds for CJK vs Latin scripts
  // A single CJK character can be a valid surname (e.g. "何", "李")
  const hasCJK = /[一-鿿㐀-䶿豈-﫿]/.test(original);
  const minLength = hasCJK ? 1 : 2;
  if (original.length < minLength) {
    return { valid: false, reason: `Name too short (${original.length} chars): "${original}"` };
  }

  // Too long (likely a title or full sentence)
  if (original.length > TOO_LONG) {
    return { valid: false, reason: `Name too long (${original.length} chars): "${original.substring(0, 80)}..."` };
  }

  // Starts with garbage characters
  if (STARTS_WITH_GARBAGE.test(original)) {
    return { valid: false, reason: `Name starts with garbage: "${original}"` };
  }

  // Garbled encoding — skip check for pure European/Latin-script names
  if (!EUROPEAN_NAME.test(original) && GARBLED_CHARS.test(original)) {
    return { valid: false, reason: `Name contains garbled characters: "${original}"` };
  }

  // Single-letter initials only: "A.", "A. B.", "X. Y. Z."
  if (INITIALS_ONLY.test(original)) {
    return { valid: false, reason: `Name is initials only: "${original}"` };
  }

  // Is it an academic field/discipline name? (English)
  const lower = original.toLowerCase().trim();
  if (FIELD_NAMES.has(lower)) {
    return { valid: false, reason: `Name matches academic field: "${original}"` };
  }

  // Field name with prefix like "B. Biology", "C. Chemistry"
  const withoutPrefix = lower.replace(/^[a-z]\.\s+/i, '').trim();
  if (FIELD_NAMES.has(withoutPrefix)) {
    return { valid: false, reason: `Name is field with letter prefix: "${original}"` };
  }

  // Chinese academic field names (exact match or stripped of whitespace)
  const zhCompact = original.replace(/\s+/g, '');
  if (FIELD_NAMES_ZH.has(original) || FIELD_NAMES_ZH.has(zhCompact)) {
    return { valid: false, reason: `Name matches Chinese academic field: "${original}"` };
  }

  // Contains publication keywords
  for (const keyword of PUBLICATION_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { valid: false, reason: `Name contains publication keyword "${keyword}": "${original}"` };
    }
  }

  // Contains organization keywords (English)
  for (const keyword of ORG_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { valid: false, reason: `Name contains organization keyword "${keyword}": "${original}"` };
    }
  }

  // Contains organization keywords (Chinese)
  for (const keyword of ORG_KEYWORDS_ZH) {
    if (original.includes(keyword)) {
      return { valid: false, reason: `Name contains Chinese organization keyword "${keyword}": "${original}"` };
    }
  }

  // Known non-person entities (company names, publishers, etc.)
  if (KNOWN_ENTITIES.has(lower)) {
    return { valid: false, reason: `Name is a known entity (not a person): "${original}"` };
  }

  // Contains business/financial keywords
  for (const keyword of BUSINESS_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { valid: false, reason: `Name contains business keyword "${keyword}": "${original}"` };
    }
  }

  // Starts with a non-person title prefix
  for (const prefix of TITLE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return { valid: false, reason: `Name starts with non-person title "${prefix.trim()}": "${original}"` };
    }
  }

  // Contains degree/certification patterns
  if (DEGREE_PATTERNS.test(original)) {
    return { valid: false, reason: `Name appears to contain degree/certification: "${original}"` };
  }

  // Excessive punctuation
  if (EXCESSIVE_PUNCTUATION.test(original)) {
    return { valid: false, reason: `Name has excessive punctuation: "${original}"` };
  }

  // Names with single-letter prefix and no Chinese characters
  // e.g. "A Chemistry" is bad but "A. Einstein" is a real-style name
  // Rule: if it has "X. Y. FieldName" where FieldName is an actual field, reject
  const singleLetterFieldPattern = /^[A-Z]\.\s+(Chemistry|Biology|Physics|Science|Mathematics|Economics|Medicine|Epidemiology|Engineering)$/i;
  if (singleLetterFieldPattern.test(original)) {
    return { valid: false, reason: `Name is letter initial + field name: "${original}"` };
  }

  // "Along" suffix pattern (garbled from scraping)
  const alongSuffix = /\b\w+ing\s+(Along|Alongside|With)\b/i;
  if (alongSuffix.test(original)) {
    return { valid: false, reason: `Name has garbled along-suffix: "${original}"` };
  }

  // All caps + no Chinese = suspicious (real names are rarely all-caps)
  // Exception: short organization abbreviations can pass the initials check
  if (original === original.toUpperCase() && original.length > 5 && !/[一-鿿]/.test(original)) {
    // Check if it looks like a real name (has a space or common name pattern)
    if (!/\s/.test(original) || /^[A-Z]{3,}$/.test(original)) {
      return { valid: false, reason: `Name is all-caps without spaces or Chinese: "${original}"` };
    }
  }

  return { valid: true, reason: 'OK' };
}

/**
 * Validate a full ScrapedPerson — checks nameZh, nameEn, and institution.
 * Returns false if all name variants fail validation.
 */
export function isValidScrapedPerson(person: {
  nameZh?: string | null;
  nameEn?: string | null;
  institution?: string | null;
}): NameValidationResult {
  const zhResult = isValidPersonName(person.nameZh);
  const enResult = isValidPersonName(person.nameEn);

  // If both names are invalid, reject
  if (!zhResult.valid && !enResult.valid) {
    const reason = `All names invalid: zh="${person.nameZh}" (${zhResult.reason}), en="${person.nameEn}" (${enResult.reason})`;
    return { valid: false, reason };
  }

  // Cross-language consistency check: flag when one name looks suspicious
  // while the other is valid (e.g. nameEn="Department of Chemistry" but nameZh="王伟")
  const isOrgOrField = (r: NameValidationResult) =>
    !r.valid && (r.reason.includes('organization keyword') || r.reason.includes('field'));

  if (zhResult.valid && isOrgOrField(enResult)) {
    return {
      valid: true,
      reason: 'OK',
      crossLanguageWarning: `NameEn appears to be organization/field: "${person.nameEn}" (${enResult.reason})`,
    };
  }
  if (enResult.valid && isOrgOrField(zhResult)) {
    return {
      valid: true,
      reason: 'OK',
      crossLanguageWarning: `NameZh appears to be organization/field: "${person.nameZh}" (${zhResult.reason})`,
    };
  }

  // If at least one is valid, accept
  return { valid: true, reason: 'OK' };
}

/**
 * Quick check: is this name definitely garbage?
 * Use at scraper level to skip fetching full profiles.
 */
export function isDefinitelyGarbage(name: string | null | undefined): boolean {
  if (!name || !name.trim()) return true;
  const result = isValidPersonName(name);
  return !result.valid;
}
