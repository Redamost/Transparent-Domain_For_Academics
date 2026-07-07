// ─── Chinese University Website Scraper ───
// Crawls faculty profile pages from Chinese university websites (.edu.cn).
// This is the ONLY scraping source — university faculty lists are authoritative
// and naturally limit results to verified Chinese scholars.
//
// Architecture:
//   1. Fetch faculty list page (with encoding detection)
//   2. Discover individual profile links via regex
//   3. Fetch and parse each profile page
//   4. Extract: name, email, title, bio, publications, research, competitions, evaluations
//   5. Return ScrapedPerson for scheduler to persist
//
// Supported: 30+ universities across C9, 985, and CAS.

import type {
  ScrapedPerson,
  ScrapedPublication,
  ScrapedResearchUpdate,
  ScrapedCompetitionUpdate,
  ScrapedEvaluationUpdate,
} from './types';
import { inferFields } from './field-inference';
import { getBucket } from './rate-limiter';
import { metrics } from './metrics';
import { responseCache } from './response-cache';
import { generatePinyinFromChinese } from '@/lib/utils/pinyin';

// ─── Request Deduplication ───
// Prevent redundant HTTP requests within a single scrapeUniversities() run.

/** URLs already attempted in the current run (regardless of success/failure). */
const attemptedUrls = new Set<string>();
/** URLs currently being fetched by another concurrent caller. */
const inFlightUrls = new Set<string>();

/** Encoding cache: domain → effective encoding (avoids redundant detection per request). */
const domainEncodingCache = new Map<string, string>();

/** Clear dedup state and encoding cache — called at the start of each scrapeUniversities() run. */
export function clearRequestDedup(): void {
  attemptedUrls.clear();
  inFlightUrls.clear();
  domainEncodingCache.clear();
}

// ─── Error Types ───

/** Categorized fetch error for monitoring and retry decisions */
type FetchErrorType =
  | 'TIMEOUT'
  | 'DNS_FAILURE'
  | 'HTTP_404'
  | 'HTTP_500'
  | 'ENCODING_ERROR'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR';

interface CategorizedError {
  type: FetchErrorType;
  url: string;
  message: string;
  retryable: boolean;
}

function categorizeFetchError(err: unknown, url: string, statusCode?: number): CategorizedError {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { type: 'TIMEOUT', url, message: 'Request timed out', retryable: true };
  }
  if (statusCode === 404) {
    return { type: 'HTTP_404', url, message: 'Page not found (404)', retryable: false };
  }
  if (statusCode && statusCode >= 500) {
    return { type: 'HTTP_500', url, message: `Server error (${statusCode})`, retryable: true };
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo') || msg.includes('DNS')) {
    return { type: 'DNS_FAILURE', url, message: msg, retryable: false };
  }
  if (msg.includes('ECONNREFUSED') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
    return { type: 'NETWORK_ERROR', url, message: msg, retryable: true };
  }
  return { type: 'NETWORK_ERROR', url, message: msg, retryable: true };
}

/** Per-university scraping statistics */
export interface UniversityScrapeStats {
  key: string;
  nameZh: string;
  listUrlsAttempted: number;
  listUrlsSucceeded: number;
  profileLinksDiscovered: number;
  profilesAttempted: number;
  profilesParsed: number;
  profilesFailed: number;
  errorsByType: Record<string, number>;
  durationMs: number;
}

// ─── Types ───

interface FacultyListConfig {
  /** URL of the faculty list page */
  url: string;
  /** Character encoding of the page (default: 'utf-8') */
  encoding?: 'utf-8' | 'gb2312' | 'gbk';
  /** Additional link discovery patterns for this specific list */
  linkPatterns?: RegExp[];
  /** Maximum pages to paginate through */
  maxPages?: number;
}

interface ProfileParsers {
  nameZh: RegExp[];
  nameEn: RegExp[];
  title: RegExp[];
  department: RegExp[];
  email: RegExp[];
  bio: RegExp[];
  publications: RegExp[];
  researchTopics: RegExp[];
  competitions: RegExp[];
  evaluations: RegExp[];
}

interface UniversityConfig {
  key: string;
  nameZh: string;
  nameEn: string;
  /** Primary domain (used for referrer header) */
  domain: string;
  /** Default encoding for pages from this university */
  encoding: 'utf-8' | 'gb2312' | 'gbk';
  /** Faculty list pages to crawl */
  facultyLists: FacultyListConfig[];
  /** Per-university parser overrides */
  parserOverrides?: Partial<ProfileParsers>;
}

// ─── Default Parsers ───

// Email obfuscation patterns commonly used on Chinese university sites
const EMAIL_PATTERNS: RegExp[] = [
  /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
  /([a-zA-Z0-9._%+-]+)\s*\[at\]\s*([a-zA-Z0-9.-]+)\s*\[dot\]\s*([a-zA-Z]{2,})/g,
  /([a-zA-Z0-9._%+-]+)\s*\(at\)\s*([a-zA-Z0-9.-]+)\s*\(dot\)\s*([a-zA-Z]{2,})/g,
  /([a-zA-Z0-9._%+-]+)#([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
];

const DEFAULT_PARSERS: ProfileParsers = {
  nameZh: [
    /姓名[：:]\s*([^\s<]{2,6})/,
    /<title>([^\s\-|]{2,6})\s*(?:个人主页|个人简介|教师简介|师资队伍|教授|副教授|讲师)/,
    /<title>([^<]{2,30})<\/title>/,
    // Heading-based name extraction
    /<(?:h1|h2|h3)[^>]*>\s*([一-鿿]{2,6})\s*<\/\1>/i,
    /<(?:h1|h2|h3)[^>]*>\s*([一-鿿]{2,6})\s*(?:教授|副教授|讲师|研究员)?\s*<\/\1>/i,
    // Name in page content with common patterns
    /([一-鿿]{2,6})\s*(?:教授|副教授|讲师|研究员|高级工程师)/,
    // Meta author tag
    /<meta[^>]+name="author"[^>]+content="([^"]{2,6})"/i,
  ],
  nameEn: [
    // Label-based English name extraction (most reliable)
    /英文名[：:]\s*([^\s<]{3,40})/,
    /English Name[：:]\s*([^\s<]{3,40})/i,
    /Name[：:]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*</i,
    // Chinese name followed by English name on same line
    /姓名[：:]\s*[一-鿿]{2,6}\s*[\/\(（]\s*([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[\)）]/,
    // Reverse format: "Name (姓名)" — English name first, Chinese in parentheses
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s*[\(（]\s*[一-鿿]{2,6}\s*[\)）]/,
    // Name in pinyin after email (common: xxx@xxx.edu.cn → given.family@ → "Given Family")
    /([A-Z][a-z]+[- ]+[A-Z][a-z]+(?:[- ]+[A-Z][a-z]+)?)\s*(?:教授|副教授|讲师)/,
    // Pinyin from email prefix: xxx@xxx.edu.cn where xxx looks like name.pinyin
    // Extract: match a Western-style name (2-3 words, first letters capitalized)
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s*(?:<|$|\n)/,
  ],
  title: [
    /职称[：:]\s*([^\s<]+)/,
    /职务[：:]\s*([^\s<]+)/,
    /Title[：:]\s*([^\s<]+)/i,
  ],
  department: [
    /所属机构[：:]\s*([^\s<]{2,40})/,
    /所属单位[：:]\s*([^\s<]{2,40})/,
    /所在系[：:]\s*([^\s<]{2,40})/,
    /所在单位[：:]\s*([^\s<]{2,40})/,
    /院系[：:]\s*([^\s<]{2,40})/,
    /学院[：:]\s*([^\s<]{2,40})/,
    /系别[：:]\s*([^\s<]{2,40})/,
    /部门[：:]\s*([^\s<]{2,40})/,
    /工作单位[：:]\s*([^\s<]{2,40})/,
    /单位[：:]\s*([^\s<,，]{2,30})/,
    /所在学院[：:]\s*([^\s<]{2,40})/,
    /所在院系[：:]\s*([^\s<]{2,40})/,
    /机构[：:]\s*([^\s<]{2,40})/,
    /系所[：:]\s*([^\s<]{2,40})/,
    /教研室[：:]\s*([^\s<]{2,40})/,
    /研究所[：:]\s*([^\s<]{2,40})/,
    /中心[：:]\s*([^\s<]{2,40})/,
    /Department[：:]\s*([^\s<]{2,40})/i,
    /School[：:]\s*([^\s<]{2,40})/i,
    /College[：:]\s*([^\s<]{2,40})/i,
  ],
  email: EMAIL_PATTERNS,
  bio: [
    // Label-based patterns (most specific first)
    /教师简介[：:]\s*([\s\S]{20,800}?)(?:研究方向|教育背景|工作经历|联系方式|招生|所属)/,
    /个人简介[：:]\s*([\s\S]{20,800}?)(?:研究方向|教育背景|工作经历|联系方式)/,
    /个人简历[：:]\s*([\s\S]{20,800}?)(?:研究方向|教育背景|工作经历)/,
    /教师简介[：:]\s*([\s\S]{20,1000}?)(?:研究方向|教育背景|论文|科研)/,
    /简介[：:]\s*([\s\S]{20,800}?)(?:研究方向|教育背景|科研)/,
    // Broader patterns — capture intro text
    /基本情况[：:]?\s*([\s\S]{20,600}?)(?:研究方向|教育背景|工作经历|论文|科研)/,
    /个人情况[：:]?\s*([\s\S]{20,600}?)(?:研究方向|教育背景|工作经历)/,
    // Self-introduction section
    /个人陈述[：:]?\s*([\s\S]{20,600}?)(?:研究|教育|工作|论文|科研)/,
    // Education background section (often contains rich bio-like text)
    /教育背景[：:]\s*([\s\S]{20,600}?)(?:工作经历|研究方向|科研项目|联系方式)/,
    /学习经历[：:]\s*([\s\S]{20,600}?)(?:工作经历|研究方向|科研项目|联系方式)/,
    // Work experience as bio supplement
    /工作经历[：:]\s*([\s\S]{20,600}?)(?:研究方向|科研项目|论文|联系方式)/,
    // "Detailed introduction" sections
    /详细介绍[：:]\s*([\s\S]{20,800}?)(?:研究方向|论文|科研|联系|教学)/,
    /详细资料[：:]\s*([\s\S]{20,800}?)(?:研究|论文|科研|联系|教学)/,
  ],
  publications: [
    /论文[发表]?[：:]?\s*([\s\S]{10,3000}?)(?:科研项目|获奖|竞赛|评比|联系方式)/,
    /代表性论著[：:]?\s*([\s\S]{10,3000}?)(?:科研项目|获奖|联系方式)/,
    /发表论文[：:]?\s*([\s\S]{10,3000}?)(?:科研项目|获奖|联系方式)/,
    /学术论文[：:]?\s*([\s\S]{10,3000}?)(?:科研项目|获奖|联系方式)/,
    /期刊论文[：:]?\s*([\s\S]{10,3000}?)(?:科研项目|获奖|联系方式)/,
    /著作[：:]?\s*([\s\S]{10,3000}?)(?:科研项目|获奖|联系方式)/,
  ],
  researchTopics: [
    // Label-based patterns — research directions / fields
    /研究方向\s*[：:：]\s*([\s\S]{5,1500}?)(?:教育背景|工作经历|论文|科研项目|获奖|联系方式|教学|个人|主讲|社会|学术|招生)/,
    /研究领域\s*[：:：]\s*([\s\S]{5,1500}?)(?:教育背景|论文|科研项目|获奖|教学|个人|主讲|联系方式)/,
    /科研项目\s*[：:：]\s*([\s\S]{10,2000}?)(?:获奖|论文|竞赛|联系方式|教学|个人|主讲)/,
    /在研项目\s*[：:：]\s*([\s\S]{10,2000}?)(?:获奖|论文|竞赛|教学|个人)/,
    // Broader patterns — match "研究方向" even without colon
    /研究方向\s*\n\s*([\s\S]{10,1200}?)(?:教育背景|工作经历|论文|科研|获奖|联系|教学|个人|主讲)/,
    /研究领域\s*\n\s*([\s\S]{10,1200}?)(?:教育背景|论文|科研|获奖|教学|个人|主讲)/,
    // Research interests / projects
    /研究兴趣\s*[：:：]\s*([\s\S]{5,800}?)(?:教育|论文|科研|获奖|联系|教学|个人)/,
    /研究课题\s*[：:：]\s*([\s\S]{5,800}?)(?:教育|论文|科研|获奖|联系|教学)/,
    // Grant-funded projects
    /主持项目\s*[：:：]?\s*([\s\S]{10,1500}?)(?:获奖|论文|竞赛|联系|教学|个人)/,
    /承担项目\s*[：:：]?\s*([\s\S]{10,1500}?)(?:获奖|论文|竞赛|联系|教学)/,
    // ── Phase 2: Expanded research topic patterns ──
    /基金项目\s*[：:：]\s*([\s\S]{5,1500}?)(?:获奖|论文|竞赛|教学|个人|主讲|联系方式)/,
    /课题\s*[：:：]\s*([\s\S]{5,1500}?)(?:获奖|论文|竞赛|教学|个人|联系方式)/,
    /承担课题\s*[：:：]?\s*([\s\S]{10,1500}?)(?:获奖|论文|竞赛|教学)/,
    /参与项目\s*[：:：]?\s*([\s\S]{10,1500}?)(?:获奖|论文|竞赛|教学)/,
    /科研课题\s*[：:：]\s*([\s\S]{5,1500}?)(?:获奖|论文|竞赛|教学|联系方式)/,
    /学术方向\s*[：:：]\s*([\s\S]{5,1200}?)(?:教育|论文|科研|获奖|联系方式)/,
    /研究专长\s*[：:：]\s*([\s\S]{5,800}?)(?:教育|论文|科研|获奖|联系方式)/,
    /科研方向\s*[：:：]\s*([\s\S]{5,1200}?)(?:教育|论文|获奖|联系方式|教学)/,
    /学术研究\s*[：:：]\s*([\s\S]{5,800}?)(?:教育|科研|论文|获奖|联系方式)/,
    /重点研发\s*[：:：]?\s*([\s\S]{5,1200}?)(?:获奖|论文|联系方式|教学)/,
    /国家自然科学基金\s*[：:：]?\s*([\s\S]{5,1000}?)(?:获奖|论文|发表|教学|联系方式)/,
    /国家社科基金\s*[：:：]?\s*([\s\S]{5,1000}?)(?:获奖|论文|发表|联系方式)/,
    /\b973\s*(?:计划)?\s*[：:：]?\s*([\s\S]{5,800}?)(?:获奖|论文|联系方式)/,
    /\b863\s*(?:计划)?\s*[：:：]?\s*([\s\S]{5,800}?)(?:获奖|论文|联系方式)/,
    /省部级项目\s*[：:：]?\s*([\s\S]{5,1000}?)(?:获奖|论文|联系方式|教学)/,
    /校企合作\s*[：:：]?\s*([\s\S]{5,800}?)(?:获奖|论文|联系方式|教学)/,
    /横向项目\s*[：:：]?\s*([\s\S]{5,800}?)(?:获奖|论文|联系方式)/,
    /纵向项目\s*[：:：]?\s*([\s\S]{5,800}?)(?:获奖|论文|联系方式)/,
  ],
  competitions: [
    /竞赛\s*(?:获奖|成果|成就)?\s*[：:：]?\s*([\s\S]{5,2000}?)(?:评比|科研|论文|教学|联系|个人|主讲|社会|学术)/,
    /大赛\s*(?:获奖|成果)?\s*[：:：]?\s*([\s\S]{5,2000}?)(?:评比|科研|论文|教学|联系|个人|主讲)/,
    /比赛\s*(?:获奖|成果)?\s*[：:：]?\s*([\s\S]{5,2000}?)(?:评比|科研|论文|教学|联系|个人)/,
    /科创\s*(?:获奖|成果)?\s*[：:：]?\s*([\s\S]{5,2000}?)(?:评比|科研|论文|教学|联系|个人)/,
    // Student competition guidance
    /指导\s*(?:学生)?竞赛\s*[：:：]?\s*([\s\S]{5,1500}?)(?:评比|科研|论文|教学|联系)/,
    // Competition awards
    /竞赛获奖\s*[：:：]?\s*([\s\S]{5,2000}?)(?:评比|科研|论文|教学|联系|个人)/,
    // ── Phase 2: Expanded competition patterns ──
    /学生竞赛\s*[：:：]?\s*([\s\S]{5,1500}?)(?:评比|科研|论文|教学|联系|个人)/,
    /学科竞赛\s*[：:：]?\s*([\s\S]{5,1500}?)(?:评比|科研|论文|教学|联系)/,
    /创新创业\s*(?:大赛|竞赛)?\s*[：:：]?\s*([\s\S]{5,1500}?)(?:评比|科研|论文|教学|联系)/,
    /挑战杯\s*[：:：]?\s*([\s\S]{5,1500}?)(?:评比|科研|论文|教学|联系)/,
    /互联网[＋+]\s*[：:：]?\s*([\s\S]{5,1500}?)(?:评比|科研|论文|教学|联系)/,
    /ACM.*?(?:竞赛|程序设计)\s*[：:：]?\s*([\s\S]{5,1200}?)(?:评比|科研|论文|教学)/,
    /数学建模\s*[：:：]?\s*([\s\S]{5,1200}?)(?:评比|科研|论文|教学|联系)/,
    /电子设计(?:大赛|竞赛)\s*[：:：]?\s*([\s\S]{5,1200}?)(?:评比|科研|论文|教学)/,
    /机器人大赛\s*[：:：]?\s*([\s\S]{5,1200}?)(?:评比|科研|论文|教学|联系)/,
    /程序设计(?:大赛|竞赛)\s*[：:：]?\s*([\s\S]{5,1200}?)(?:评比|科研|论文|教学)/,
    /大学生\s*(?:竞赛|大赛|比赛)\s*[：:：]?\s*([\s\S]{5,1200}?)(?:评比|科研|论文|教学)/,
    /研究生\s*(?:竞赛|大赛)\s*[：:：]?\s*([\s\S]{5,1200}?)(?:评比|科研|论文|教学)/,
    /全国大学生\s*(?:竞赛|大赛)\s*[：:：]?\s*([\s\S]{5,1200}?)(?:评比|科研|论文|教学)/,
  ],
  evaluations: [
    /评比\s*(?:获奖|成果)?\s*[：:：]?\s*([\s\S]{5,2000}?)(?:竞赛|科研|论文|联系|教学|个人|主讲|社会)/,
    /人才称号\s*[：:：]?\s*([\s\S]{5,2000}?)(?:竞赛|科研|论文|联系|教学|个人)/,
    /荣誉称号\s*[：:：]?\s*([\s\S]{5,2000}?)(?:竞赛|科研|论文|联系|教学|个人)/,
    /获奖\s*(?:情况|列表|记录)?\s*[：:：]?\s*([\s\S]{5,2000}?)(?:竞赛|科研|论文|联系|教学|个人|主讲|社会)/,
    /学术荣誉\s*[：:：]?\s*([\s\S]{5,2000}?)(?:竞赛|科研|论文|联系|教学|个人)/,
    /奖励\s*(?:情况|列表)?\s*[：:：]?\s*([\s\S]{5,2000}?)(?:竞赛|科研|论文|联系|教学|个人)/,
    // Teaching evaluations / awards
    /教学\s*(?:成果)?奖\s*[：:：]?\s*([\s\S]{5,1500}?)(?:竞赛|科研|论文|联系|个人|主讲)/,
    /教学名师\s*[：:：]?\s*([\s\S]{5,1500}?)(?:竞赛|科研|论文|联系|个人)/,
    // Honorary titles (common in Chinese universities)
    /(?:入选|获评|当选|荣获)\s*(?:[^。]{2,30}?(?:学者|人才|计划|工程|称号))/,
    // ── Phase 2: Expanded evaluation patterns ──
    /长江学者\s*[：:：]?\s*([\s\S]{5,2000}?)(?:科研|论文|联系|教学|个人)/,
    /杰[出青]青年?\s*[：:：]?\s*([\s\S]{5,2000}?)(?:科研|论文|联系|教学|个人)/,
    /优秀青年\s*[：:：]?\s*([\s\S]{5,2000}?)(?:科研|论文|联系|教学)/,
    /千人计划\s*[：:：]?\s*([\s\S]{5,2000}?)(?:科研|论文|联系|教学)/,
    /万人计划\s*[：:：]?\s*([\s\S]{5,2000}?)(?:科研|论文|联系|教学)/,
    /青年千人\s*[：:：]?\s*([\s\S]{5,2000}?)(?:科研|论文|联系|教学)/,
    /百千万人才\s*[：:：]?\s*([\s\S]{5,2000}?)(?:科研|论文|联系|教学)/,
    /百人计划\s*[：:：]?\s*([\s\S]{5,2000}?)(?:科研|论文|联系|教学)/,
    /精品课程\s*[：:：]?\s*([\s\S]{5,1500}?)(?:科研|论文|联系|个人)/,
    /教学改革\s*[：:：]?\s*([\s\S]{5,1500}?)(?:科研|论文|联系|个人)/,
    /教材[建编]\s*[：:：]?\s*([\s\S]{5,1500}?)(?:科研|论文|联系|个人)/,
    /人才项目\s*[：:：]?\s*([\s\S]{5,2000}?)(?:科研|论文|联系|个人)/,
    /杰出人才\s*[：:：]?\s*([\s\S]{5,2000}?)(?:科研|论文|联系|个人)/,
    /院士\s*[：:：]?\s*([\s\S]{5,2000}?)(?:科研|论文|联系|个人)/,
  ],
};

// ─── University Configuration ───

const UNIVERSITY_CONFIGS: UniversityConfig[] = [
  // ═══ C9 League ═══
  {
    key: 'tsinghua',
    nameZh: '清华大学',
    nameEn: 'Tsinghua University',
    domain: 'tsinghua.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://www.cs.tsinghua.edu.cn/szzk/jzgml.htm', maxPages: 3 },
      { url: 'https://www.ee.tsinghua.edu.cn/szdw.htm', maxPages: 2 },
      { url: 'https://www.au.tsinghua.edu.cn/szdw.htm', maxPages: 2 },
      { url: 'https://www.sem.tsinghua.edu.cn/szdw.htm', maxPages: 2 },
    ],
  },
  {
    key: 'pku',
    nameZh: '北京大学',
    nameEn: 'Peking University',
    domain: 'pku.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cs.pku.edu.cn/szdw/jyxl/amz/ALL.htm', maxPages: 5 },
      { url: 'https://cs.pku.edu.cn/szdw/ys.htm', maxPages: 2 },
      { url: 'https://cs.pku.edu.cn/szdw/jcrc.htm', maxPages: 2 },
      { url: 'https://cs.pku.edu.cn/cse/qtcy.htm', maxPages: 2 },
    ],
  },
  {
    key: 'zju',
    nameZh: '浙江大学',
    nameEn: 'Zhejiang University',
    domain: 'zju.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'http://www.cs.zju.edu.cn/csen/27003/list.htm', maxPages: 5 },
      { url: 'http://www.cs.zju.edu.cn/csen/26695/list.htm', maxPages: 2 },
      { url: 'https://person.zju.edu.cn/index/search', maxPages: 2 },
    ],
    parserOverrides: {
      nameZh: [
        /<title>([^\s\-|]{2,6})\s*(?:-|—|\|)/,
        /<title>([^<]{2,30})<\/title>/,
        /姓名[：:]\s*([^\s<]{2,6})/,
        /([一-鿿]{2,6})\s*(?:教授|副教授|讲师|研究员)/,
      ],
    },
  },
  {
    key: 'fudan',
    nameZh: '复旦大学',
    nameEn: 'Fudan University',
    domain: 'fudan.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cs.fudan.edu.cn/szdw/list.htm', maxPages: 3 },
      { url: 'https://sme.fudan.edu.cn/szdw/list.htm', maxPages: 2 },
      { url: 'https://life.fudan.edu.cn/szdw/list.htm', maxPages: 2 },
    ],
  },
  {
    key: 'sjtu',
    nameZh: '上海交通大学',
    nameEn: 'Shanghai Jiao Tong University',
    domain: 'sjtu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://www.cs.sjtu.edu.cn/teacherlist.html', maxPages: 3 },
      { url: 'https://www.cs.sjtu.edu.cn/jiaoshiml.html', maxPages: 1 },
      { url: 'https://www.seiee.sjtu.edu.cn/szdw.htm', maxPages: 2 },
    ],
    parserOverrides: {
      nameZh: [
        /<title>([^\s\-|]{2,6})\s*(?:-|—|\|)/,
        /姓名[：:]\s*([^\s<]{2,6})/,
        /<title>([^<]{2,30})<\/title>/,
      ],
    },
  },
  {
    key: 'ustc',
    nameZh: '中国科学技术大学',
    nameEn: 'University of Science and Technology of China',
    domain: 'ustc.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cs.ustc.edu.cn/szdw/list.htm', maxPages: 3 },
      { url: 'https://physics.ustc.edu.cn/szdw/list.htm', maxPages: 2 },
      { url: 'https://math.ustc.edu.cn/szdw/list.htm', maxPages: 2 },
    ],
  },
  {
    key: 'nju',
    nameZh: '南京大学',
    nameEn: 'Nanjing University',
    domain: 'nju.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cs.nju.edu.cn/szdw/list.htm', maxPages: 3 },
      { url: 'https://cs.nju.edu.cn/xygk/szdw.htm', maxPages: 2 },
      { url: 'https://physics.nju.edu.cn/szdw.htm', maxPages: 2 },
    ],
  },
  {
    key: 'hit',
    nameZh: '哈尔滨工业大学',
    nameEn: 'Harbin Institute of Technology',
    domain: 'hit.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://computing.hit.edu.cn/11261/list.htm', maxPages: 5 },
      { url: 'https://computing.hit.edu.cn/11261/list2.htm', maxPages: 3 },
      { url: 'http://ee.hit.edu.cn/szdw/list.htm', maxPages: 2 },
    ],
  },
  {
    key: 'xjtu',
    nameZh: '西安交通大学',
    nameEn: "Xi'an Jiaotong University",
    domain: 'xjtu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'http://www.cs.xjtu.edu.cn/szdw/js.htm', maxPages: 3 },
      { url: 'http://eie.xjtu.edu.cn/szdw/js.htm', maxPages: 2 },
      { url: 'http://math.xjtu.edu.cn/szdw/js.htm', maxPages: 2 },
    ],
  },

  // ═══ Other 985 Universities ═══
  {
    key: 'whu',
    nameZh: '武汉大学',
    nameEn: 'Wuhan University',
    domain: 'whu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cs.whu.edu.cn/szdw/zrjs.htm', maxPages: 3 },
      { url: 'http://jszy.whu.edu.cn/xyjslb.jsp?id=2012&lang=zh_CN', maxPages: 2 },
      { url: 'http://physics.whu.edu.cn/szdw.htm', maxPages: 2 },
    ],
    parserOverrides: {
      nameZh: [
        /([^\s\-]{2,6})-武汉大学/,
        /([^\s]{2,6})\s+(?:教授|副教授|讲师|研究员)/,
      ],
      nameEn: [
        /English Name[：:]\s*([^\s<]+)/i,
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/,
      ],
      title: [
        /职称[：:]\s*([^\s<]+)/,
        /(教授|副教授|研究员|副研究员|讲师|助理教授|工程师)/,
      ],
      department: [
        /武汉大学[\s\-]*([^\s<\-]+学院)/,
        /武汉大学[\s\-]*([^\s<\-]+系)/,
        /所属机构[：:]\s*([^\s<]+)/,
        /院系[：:]\s*([^\s<]+)/,
        /所在系[：:]\s*([^\s<]+)/,
        /所在单位[：:]\s*([^\s<]+)/,
      ],
      bio: [
        /研究方向\s+([\s\S]{20,1200}?)(?:教育背景|工作经验|教授课程|发表论文|科研课题|联系方式)/,
        /教育背景\s+([\s\S]{20,1200}?)(?:工作经验|教授课程|发表论文|科研课题|联系方式)/,
        /个人简介[：:]\s*([\s\S]{20,1200}?)(?:研究方向|教育背景|联系方式)/,
        /教师简介[：:]\s*([\s\S]{20,1200}?)(?:研究方向|教育背景|联系方式)/,
      ],
    },
  },
  {
    key: 'sysu',
    nameZh: '中山大学',
    nameEn: 'Sun Yat-sen University',
    domain: 'sysu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cse.sysu.edu.cn/node/2603', maxPages: 3 },
    ],
    parserOverrides: {
      nameZh: [
        /([^\s|]{2,6})\s*\|\s*中山大学/,
        /([^\s|]{2,6})\s*[|\-—]/,
        /([^\s]{2,6})\s+(?:教授|副教授|讲师|研究员)/,
      ],
      nameEn: [
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/,
      ],
      title: [
        /(教授|副教授|研究员|副研究员|讲师|助理教授|工程师)/,
        /职称[：:]\s*([^\s<]+)/,
        /Title[：:]\s*([^\s<]+)/i,
      ],
      department: [
        /所在系[：:]\s*([^\s<]+)/,
        /院系[：:]\s*([^\s<]+)/,
        /所属机构[：:]\s*([^\s<]+)/,
        /学院[：:]\s*([^\s<]+)/,
        /系别[：:]\s*([^\s<]+)/,
      ],
      bio: [
        /教师简介[：:]\s*([\s\S]{20,2000}?)(?:研究方向|教育背景|联系方式|招生|所属)/,
        /个人简介[：:]?\s*([\s\S]{20,2000}?)(?:研究方向|教育背景|联系方式|招生)/,
        /研究方向[：:]\s*([\s\S]{20,2000}?)(?:教育背景|联系方式|招生|代表性|所属)/,
      ],
    },
  },
  {
    key: 'hust',
    nameZh: '华中科技大学',
    nameEn: 'Huazhong University of Science and Technology',
    domain: 'hust.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'http://cs.hust.edu.cn/szdw.htm', maxPages: 3 },
      { url: 'http://english.cs.hust.edu.cn/Faculty.htm', maxPages: 2 },
      { url: 'http://faculty.hust.edu.cn/xyjslb.jsp?urltype=tsites.CollegeTeacherList&wbtreeid=1001&st=0&id=1092&lang=zh_CN', maxPages: 2 },
    ],
    parserOverrides: {
      nameZh: [
        /<title>([^\s\-|]{2,6})\s*(?:-|—|\|)/,
        /<title>([^<]{2,30})<\/title>/,
        /姓名[：:]\s*([^\s<]{2,6})/,
        /([一-鿿]{2,6})\s*(?:教授|副教授|讲师|研究员|工程师)/,
      ],
    },
  },
  {
    key: 'tongji',
    nameZh: '同济大学',
    nameEn: 'Tongji University',
    domain: 'tongji.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cs.tongji.edu.cn/szdw/list.htm', maxPages: 3 },
      { url: 'https://cs.tongji.edu.cn/szdw1.htm', maxPages: 2 },
      { url: 'https://see.tongji.edu.cn/szdw.htm', maxPages: 2 },
    ],
    parserOverrides: {
      nameZh: [
        /<title>([^\s\-|]{2,6})\s*(?:-|—|\|)/,
        /<title>([^<]{2,30})<\/title>/,
        /姓名[：:]\s*([^\s<]{2,6})/,
        /([一-鿿]{2,6})\s*(?:教授|副教授|讲师|研究员)/,
      ],
    },
  },
  {
    key: 'beihang',
    nameZh: '北京航空航天大学',
    nameEn: 'Beihang University',
    domain: 'buaa.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://scse.buaa.edu.cn/szdw/jcrc1.htm', maxPages: 3 },
      { url: 'https://scse.buaa.edu.cn/szdw/js.htm', maxPages: 2 },
      { url: 'https://shi.buaa.edu.cn/xyjslb.jsp?id=1039&lang=zh_CN', maxPages: 2 },
    ],
    parserOverrides: {
      nameZh: [
        /<title>([^\s\-|]{2,6})\s*(?:-|—|\|)/,
        /<title>([^<]{2,30})<\/title>/,
        /姓名[：:]\s*([^\s<]{2,6})/,
        /([一-鿿]{2,6})\s*(?:教授|副教授|讲师|研究员)/,
      ],
      department: [
        /所属单位[：:]\s*([^\s<]+)/,
        /学院[：:]\s*([^\s<]+)/,
        /单位[：:]\s*([^\s<]+)/,
        /院系[：:]\s*([^\s<]+)/,
      ],
    },
  },
  {
    key: 'sichuan',
    nameZh: '四川大学',
    nameEn: 'Sichuan University',
    domain: 'scu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cs.scu.edu.cn/jzlm/szdw.htm', maxPages: 3 },
      { url: 'http://ee.scu.edu.cn/szdw/js.htm', maxPages: 2 },
      { url: 'http://physics.scu.edu.cn/szdw/js.htm', maxPages: 2 },
    ],
  },
  {
    key: 'seu',
    nameZh: '东南大学',
    nameEn: 'Southeast University',
    domain: 'seu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cse.seu.edu.cn/101006608/list.htm', maxPages: 3 },
      { url: 'https://radio.seu.edu.cn/szdw.htm', maxPages: 2 },
      { url: 'https://physics.seu.edu.cn/szdw.htm', maxPages: 2 },
    ],
  },
  {
    key: 'ruc',
    nameZh: '中国人民大学',
    nameEn: 'Renmin University of China',
    domain: 'ruc.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'http://info.ruc.edu.cn/jsky/szdw/ajxjgcx/jsjkxyjsx1/js2/', maxPages: 3 },
      { url: 'http://stat.ruc.edu.cn/szdw/js.htm', maxPages: 2 },
      { url: 'http://ai.ruc.edu.cn/szdw/js.htm', maxPages: 2 },
    ],
  },
  {
    key: 'nankai',
    nameZh: '南开大学',
    nameEn: 'Nankai University',
    domain: 'nankai.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cs.nankai.edu.cn/szdw/js.htm', maxPages: 3 },
      { url: 'https://physics.nankai.edu.cn/szdw/js.htm', maxPages: 2 },
      { url: 'https://math.nankai.edu.cn/szdw/js.htm', maxPages: 2 },
    ],
  },
  {
    key: 'tianjin',
    nameZh: '天津大学',
    nameEn: 'Tianjin University',
    domain: 'tju.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'http://cic.tju.edu.cn/szdw.htm', maxPages: 3 },
      { url: 'http://see.tju.edu.cn/szdw.htm', maxPages: 2 },
      { url: 'http://physics.tju.edu.cn/szdw.htm', maxPages: 2 },
    ],
  },
  {
    key: 'bit',
    nameZh: '北京理工大学',
    nameEn: 'Beijing Institute of Technology',
    domain: 'bit.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cs.bit.edu.cn/szdw/jsml/index.htm', maxPages: 3 },
      { url: 'https://sie.bit.edu.cn/szdw/js.htm', maxPages: 2 },
      { url: 'https://physics.bit.edu.cn/szdw/js.htm', maxPages: 2 },
    ],
  },
  {
    key: 'dlut',
    nameZh: '大连理工大学',
    nameEn: 'Dalian University of Technology',
    domain: 'dlut.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://faculty.dlut.edu.cn/xyjslb.jsp?urltype=tsites.CollegeTeacherList&wbtreeid=1003&st=0&id=1180&py=&lang=zh_CN&state=0', maxPages: 3 },
      { url: 'http://kjd.dlut.edu.cn/xklbcont.jsp?urltype=tsites.DisciplineTeacherList&wbtreeid=1034&st=0&id=1224&py=l&lang=zh_CN', maxPages: 2 },
      { url: 'http://ee.dlut.edu.cn/szdw.htm', maxPages: 2 },
    ],
  },
  {
    key: 'jlu',
    nameZh: '吉林大学',
    nameEn: 'Jilin University',
    domain: 'jlu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://ccst.jlu.edu.cn/szdw/js.htm', maxPages: 3 },
      { url: 'http://ee.jlu.edu.cn/szdw/js.htm', maxPages: 2 },
      { url: 'http://phy.jlu.edu.cn/szdw/js.htm', maxPages: 2 },
    ],
  },
  {
    key: 'sdu',
    nameZh: '山东大学',
    nameEn: 'Shandong University',
    domain: 'sdu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://www.cs.sdu.edu.cn/szdw1/jcrc.htm', maxPages: 3 },
      { url: 'https://www.ee.sdu.edu.cn/szdw.htm', maxPages: 2 },
      { url: 'https://www.phy.sdu.edu.cn/szdw.htm', maxPages: 2 },
    ],
  },
  {
    key: 'xmu',
    nameZh: '厦门大学',
    nameEn: 'Xiamen University',
    domain: 'xmu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cs.xmu.edu.cn/szll/jcrc.htm', maxPages: 3 },
      { url: 'https://informatics.xmu.edu.cn/list_teacher.jsp?urltype=tp.TpCollegeZWTeachers&wbtreeid=2171&collegeid=1532', maxPages: 2 },
      { url: 'https://phys.xmu.edu.cn/szdw.htm', maxPages: 2 },
    ],
  },
  {
    key: 'lzu',
    nameZh: '兰州大学',
    nameEn: 'Lanzhou University',
    domain: 'lzu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'http://xxxy.lzu.edu.cn/szdw.htm', maxPages: 3 },
      { url: 'http://phy.lzu.edu.cn/szdw.htm', maxPages: 2 },
      { url: 'http://math.lzu.edu.cn/szdw.htm', maxPages: 2 },
    ],
  },
  {
    key: 'nwpu',
    nameZh: '西北工业大学',
    nameEn: 'Northwestern Polytechnical University',
    domain: 'nwpu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://jsj.nwpu.edu.cn/snew/szdw/szmd.htm', maxPages: 3 },
      { url: 'https://jsj.nwpu.edu.cn/snew/szdwlist.jsp?a238672c=10&a238672p=1&a238672t=2&wbtreeid=1531', maxPages: 2 },
      { url: 'https://dianyuan.nwpu.edu.cn/szdw.htm', maxPages: 2 },
    ],
  },
  {
    key: 'scut',
    nameZh: '华南理工大学',
    nameEn: 'South China University of Technology',
    domain: 'scut.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://www2.scut.edu.cn/cs/szdw/js.htm', maxPages: 3 },
      { url: 'https://www2.scut.edu.cn/ee/szdw/js.htm', maxPages: 2 },
      { url: 'https://www2.scut.edu.cn/physics/szdw/js.htm', maxPages: 2 },
    ],
  },
  {
    key: 'csu',
    nameZh: '中南大学',
    nameEn: 'Central South University',
    domain: 'csu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cse.csu.edu.cn/szdw/yjsds.htm', maxPages: 3 },
      { url: 'https://ee.csu.edu.cn/szdw.htm', maxPages: 2 },
      { url: 'https://physics.csu.edu.cn/szdw.htm', maxPages: 2 },
    ],
  },
  {
    key: 'hnu',
    nameZh: '湖南大学',
    nameEn: 'Hunan University',
    domain: 'hnu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'http://csee.hnu.edu.cn/teacher/syjs/25', maxPages: 3 },
      { url: 'http://ee.hnu.edu.cn/szdw.htm', maxPages: 2 },
      { url: 'http://physics.hnu.edu.cn/szdw.htm', maxPages: 2 },
    ],
    parserOverrides: {
      nameZh: [
        /([^\s\-]{2,6})-湖南大学/,
        /([^\s]{2,6})\s+(?:教授|副教授|讲师|研究员)/,
      ],
      nameEn: [
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/,
      ],
      title: [
        /职称[：:]\s*([^\s<]+)/,
        /(教授|副教授|研究员|副研究员|讲师|助理教授|工程师|高级工程师)/,
      ],
      department: [
        /所属机构[：:]\s*([^\s<]+)/,
        /湖南大学[\s\-]*([^\s<\-]+学院)/,
        /湖南大学[\s\-]*([^\s<\-]+系)/,
        /院系[：:]\s*([^\s<]+)/,
        /所在系[：:]\s*([^\s<]+)/,
        /所在单位[：:]\s*([^\s<]+)/,
      ],
      bio: [
        /研究方向[：:]\s*([\s\S]{20,1200}?)(?:联系地址|所属机构|教育背景|学院教师|学术论文)/,
        /个人简介[：:]\s*([\s\S]{20,1200}?)(?:研究方向|教育背景|联系方式)/,
        /教师简介[：:]\s*([\s\S]{20,1200}?)(?:研究方向|教育背景|联系方式)/,
      ],
    },
  },
  {
    key: 'neu',
    nameZh: '东北大学',
    nameEn: 'Northeastern University',
    domain: 'neu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'http://www.cse.neu.edu.cn/6317/list.htm', maxPages: 3 },
      { url: 'http://www.cse.neu.edu.cn/6318/list.htm', maxPages: 2 },
      { url: 'http://www.cse.neu.edu.cn/rgznx/list.htm', maxPages: 2 },
    ],
  },
  {
    key: 'cqu',
    nameZh: '重庆大学',
    nameEn: 'Chongqing University',
    domain: 'cqu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://faculty.cqu.edu.cn/xyjslb.jsp?id=1135&lang=zh_CN', maxPages: 3 },
      { url: 'http://www.cee.cqu.edu.cn/szdw.htm', maxPages: 2 },
      { url: 'http://phys.cqu.edu.cn/szdw.htm', maxPages: 2 },
    ],
  },
  {
    key: 'ecnu',
    nameZh: '华东师范大学',
    nameEn: 'East China Normal University',
    domain: 'ecnu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cs.ecnu.edu.cn/szdw/list.htm', maxPages: 3 },
      { url: 'https://faculty.ecnu.edu.cn/xyjslb.jsp?urltype=tsites.CollegeTeacherList&wbtreeid=1001&st=0&id=1096&lang=zh_CN', maxPages: 2 },
      { url: 'https://math.ecnu.edu.cn/szdw.htm', maxPages: 2 },
    ],
  },
  {
    key: 'bnu',
    nameZh: '北京师范大学',
    nameEn: 'Beijing Normal University',
    domain: 'bnu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://ai.bnu.edu.cn/szdw.htm', maxPages: 3 },
      { url: 'https://physics.bnu.edu.cn/szdw.htm', maxPages: 2 },
      { url: 'https://math.bnu.edu.cn/szdw.htm', maxPages: 2 },
    ],
  },
  {
    key: 'uestc',
    nameZh: '电子科技大学',
    nameEn: 'University of Electronic Science and Technology of China',
    domain: 'uestc.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://www.scse.uestc.edu.cn/szdw/js.htm', maxPages: 3 },
      { url: 'https://www.ee.uestc.edu.cn/szdw/js.htm', maxPages: 2 },
      { url: 'https://www.sp.uestc.edu.cn/szdw/js.htm', maxPages: 2 },
    ],
  },
  {
    key: 'cau',
    nameZh: '中国农业大学',
    nameEn: 'China Agricultural University',
    domain: 'cau.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://ciee.cau.edu.cn/col/col50400/', maxPages: 3 },
      { url: 'https://ciee.cau.edu.cn/col/col50401/', maxPages: 2 },
      { url: 'https://ciee.cau.edu.cn/col/col50404/', maxPages: 2 },
    ],
  },
  {
    key: 'nudt',
    nameZh: '国防科技大学',
    nameEn: 'National University of Defense Technology',
    domain: 'nudt.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://www.nudt.edu.cn/xyjs/jsjxy/szdw.htm', maxPages: 3 },
      { url: 'https://www.nudt.edu.cn/xyjs/dzkxyjsxy/szdw.htm', maxPages: 2 },
      { url: 'https://www.nudt.edu.cn/xyjs/lxy/szdw.htm', maxPages: 2 },
    ],
  },
  {
    key: 'nwafu',
    nameZh: '西北农林科技大学',
    nameEn: 'Northwest A&F University',
    domain: 'nwafu.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cie.nwsuaf.edu.cn/szdw/js/', maxPages: 3 },
      { url: 'https://cie.nwsuaf.edu.cn/szdw/js1.htm', maxPages: 2 },
      { url: 'https://sci.nwsuaf.edu.cn/szdw/js.htm', maxPages: 2 },
    ],
  },
  {
    key: 'muc',
    nameZh: '中央民族大学',
    nameEn: 'Minzu University of China',
    domain: 'muc.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://xingong.muc.edu.cn/szdw/xyjs.htm', maxPages: 3 },
      { url: 'https://xingong.muc.edu.cn/szdw/js.htm', maxPages: 2 },
      { url: 'https://math.muc.edu.cn/szdw/js.htm', maxPages: 2 },
    ],
  },
  {
    key: 'ouc',
    nameZh: '中国海洋大学',
    nameEn: 'Ocean University of China',
    domain: 'ouc.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://it.ouc.edu.cn/szdw/list.htm', maxPages: 3 },
      { url: 'https://it.ouc.edu.cn/szdw/js.htm', maxPages: 2 },
      { url: 'https://physics.ouc.edu.cn/szdw/list.htm', maxPages: 2 },
    ],
  },
  {
    key: 'xidian',
    nameZh: '西安电子科技大学',
    nameEn: 'Xidian University',
    domain: 'xidian.edu.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://cs.xidian.edu.cn/yjsjy/dsjies.htm', maxPages: 3 },
      { url: 'https://faculty.xidian.edu.cn/xyjslb.jsp?PAGENUM=1&id=1654&lang=zh_CN&st=0&totalpage=3&urltype=tsites.CollegeTeacherList&wbtreeid=1001', maxPages: 2 },
      { url: 'https://see.xidian.edu.cn/szdw.htm', maxPages: 2 },
    ],
  },
  {
    key: 'cas',
    nameZh: '中国科学院',
    nameEn: 'Chinese Academy of Sciences',
    domain: 'cas.cn',
    encoding: 'utf-8',
    facultyLists: [
      { url: 'https://www.ict.ac.cn/yjdw/fsds/', maxPages: 3 },
      { url: 'https://www.ioa.ac.cn/yjdw/fsds/', maxPages: 2 },
      { url: 'http://www.itp.ac.cn/yjdw/fsds/', maxPages: 2 },
      { url: 'http://www.ia.cas.cn/yjdw/fsds/', maxPages: 2 },
    ],
  },
];

// ─── Utility Functions ───

/**
 * Fetch a URL and decode with the specified encoding.
 * Chinese university sites often serve GB2312/GBK encoded pages.
 * Using TextDecoder with the correct encoding prevents garbled text.
 */
export async function fetchWithEncoding(
  url: string,
  encoding: string,
  timeoutMs = 15000,
  maxRetries = 3,
): Promise<string | null> {
  const fetchStart = Date.now();

  // ── Dedup: skip if already attempted this URL in the current run ──
  if (attemptedUrls.has(url)) {
    metrics.recordDedupHit(url);
    return null;
  }

  // ── Cache: check for a fresh cached response ──
  const cacheKey = `${url}|${encoding}`;
  if (responseCache.isFresh(cacheKey)) {
    const cached = responseCache.get(cacheKey);
    if (cached) {
      metrics.recordRequest(url, true, undefined, Date.now() - fetchStart);
      return cached.body;
    }
  }

  // ── In-flight dedup: if another caller is already fetching this URL, wait ──
  if (inFlightUrls.has(url)) {
    for (let i = 0; i < 30; i++) {
      if (!inFlightUrls.has(url)) {
        // Other caller finished — check cache
        if (responseCache.isFresh(cacheKey)) {
          const cached = responseCache.get(cacheKey);
          if (cached) {
            metrics.recordRequest(url, true, undefined, Date.now() - fetchStart);
            return cached.body;
          }
        }
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  attemptedUrls.add(url);
  inFlightUrls.add(url);

  let lastError: CategorizedError | null = null;

  try {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          lastError = categorizeFetchError(
            new Error(`HTTP ${response.status}`),
            url,
            response.status,
          );
          if (!lastError.retryable || attempt >= maxRetries - 1) {
            metrics.recordRequest(url, false, lastError.type, Date.now() - fetchStart);
            return null;
          }
          await backoffDelay(attempt, url, lastError);
          continue;
        }

        const buffer = await response.arrayBuffer();
        let decodedText: string | null = null;

        // 0. Check domain encoding cache — skip detection if we already know
        const urlObj = (() => { try { return new URL(url); } catch { return null; } })();
        const domain = urlObj?.hostname || '';
        const cachedEncoding = domain ? domainEncodingCache.get(domain) : undefined;

        if (cachedEncoding && cachedEncoding !== encoding) {
          // Use cached effective encoding directly (skip multi-pass detection)
          try {
            const decoder = new TextDecoder(cachedEncoding);
            const text = decoder.decode(buffer);
            if (!hasGarbledChinese(text)) {
              decodedText = text;
            }
          } catch { /* fall through to full detection */ }
        }

        if (!decodedText) {
          // 1. Try CONFIGURED encoding FIRST — Chinese university sites often
          //    declare UTF-8 in headers but actually serve GBK content.
          if (encoding !== 'utf-8') {
            try {
              const decoder = new TextDecoder(encoding);
              const text = decoder.decode(buffer);
              if (!hasGarbledChinese(text)) {
                decodedText = text;
              }
            } catch {
              // Fall through
            }
          }
        }

        if (!decodedText) {
          // 2. Check Content-Type header charset (sanitize invalid values)
          const contentType = response.headers.get('content-type') || '';
          const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
          if (charsetMatch) {
            const rawCharset = charsetMatch[1].toLowerCase().replace(/[,;].*$/, '').trim();
            const validCharsets = ['utf-8', 'utf8', 'gbk', 'gb2312', 'gb18030', 'big5', 'iso-8859-1', 'latin1', 'windows-1252'];
            if (validCharsets.includes(rawCharset) || rawCharset.startsWith('iso-') || rawCharset.startsWith('windows-')) {
              try {
                const decoder = new TextDecoder(rawCharset);
                const text = decoder.decode(buffer);
                if (!hasGarbledChinese(text)) {
                  decodedText = text;
                }
              } catch {
                // Fall through
              }
            }
          }
        }

        if (!decodedText) {
          // 3. Scan HTML meta tags for charset declaration (< 2KB is enough)
          const headBytes = buffer.slice(0, 2048);
          const headText = new TextDecoder('ascii').decode(headBytes);
          const metaCharset = headText.match(
            /<meta[^>]+charset\s*=\s*["']?([a-zA-Z0-9-]+)/i,
          );
          if (metaCharset) {
            const metaEnc = metaCharset[1].toLowerCase();
            try {
              const decoder = new TextDecoder(metaEnc);
              decodedText = decoder.decode(buffer);
            } catch {
              // Invalid meta charset, fall through
            }
          }
        }

        if (!decodedText) {
          // 4. Try configured encoding
          const decoder = new TextDecoder(encoding);
          decodedText = decoder.decode(buffer);
        }

        // 5. GBK fallback: if configured as utf-8 but result has garbled characters
        if (encoding === 'utf-8' && decodedText && hasGarbledChinese(decodedText)) {
          try {
            const gbkDecoder = new TextDecoder('gbk');
            const gbkText = gbkDecoder.decode(buffer);
            if (!hasGarbledChinese(gbkText)) {
              decodedText = gbkText;
            }
          } catch {
            // GBK decode failed, keep original
          }
        }

        // ── Cache the effective encoding per domain ──
        if (decodedText && domain) {
          const effectiveEncoding = (() => {
            // Determine which encoding actually produced the clean text
            if (encoding !== 'utf-8' && decodedText === (() => {
              try { return new TextDecoder(encoding).decode(buffer); } catch { return ''; }
            })()) return encoding;
            if (cachedEncoding) return cachedEncoding;
            // Detect if the result came from GBK fallback
            try {
              const utf8Text = new TextDecoder('utf-8').decode(buffer);
              if (hasGarbledChinese(utf8Text) && !hasGarbledChinese(decodedText)) return 'gbk';
            } catch { /* ignore */ }
            return 'utf-8';
          })();
          if (!domainEncodingCache.has(domain)) {
            domainEncodingCache.set(domain, effectiveEncoding);
          }
        }

        // ── Cache the successful result ──
        if (decodedText) {
          // Use shorter TTL for profile pages (URLs containing specific patterns)
          const isProfilePage =
            /(\/teacher\/|\/faculty\/|\/info\/|\.htm|\.html|show\.aspx|content\.jsp)/i.test(url);
          const cacheTtl = isProfilePage ? 15 * 60 * 1000 : 30 * 60 * 1000;
          responseCache.set(
            cacheKey,
            { url, body: decodedText, statusCode: response.status || 200, cachedAt: Date.now(), hitCount: 0 },
            cacheTtl,
          );
        }

        metrics.recordRequest(url, true, undefined, Date.now() - fetchStart);
        return decodedText;
      } catch (err) {
        clearTimeout(timer);
        lastError = categorizeFetchError(err, url);

        if (lastError.retryable && attempt < maxRetries - 1) {
          await backoffDelay(attempt, url, lastError);
          continue;
        }

        console.warn(
          `[CN-Uni] ${lastError.type} for ${url}: ${lastError.message}`,
        );
        metrics.recordRequest(url, false, lastError.type, Date.now() - fetchStart);
        return null;
      }
    }
  } finally {
    inFlightUrls.delete(url);
  }

  return null;
}

/** Exponential backoff with jitter for retry delays */
async function backoffDelay(
  attempt: number,
  url: string,
  error: CategorizedError,
): Promise<void> {
  const baseDelay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
  const jitter = Math.random() * 1000;
  const delay = Math.min(baseDelay + jitter, 10000);
  console.warn(
    `[CN-Uni] Retry ${attempt + 1} for ${url} after ${Math.round(delay)}ms (${error.type}: ${error.message})`,
  );
  await new Promise((r) => setTimeout(r, delay));
}

/**
 * Detect if a text string contains garbled Chinese characters
 * (signs of incorrect encoding like UTF-8 interpreted GBK text).
 */
function hasGarbledChinese(text: string): boolean {
  // Garbled Chinese from wrong encoding typically has patterns like:
  // é¦–é¡µ (should be 首页), å­¦é™¢ (should be 学院), etc.
  if (text.length < 100) return false;

  const cjkCount = (text.match(/[一-鿿]/g) || []).length;
  const accentCount = (text.match(/[À-ÿ]/g) || []).length;
  const gbkGarbageCount = (text.match(/[ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö]/g) || []).length;
  const replacementCount = (text.match(/�/g) || []).length;
  const totalChars = text.length;
  const cjkDensity = cjkCount / totalChars;

  // Classic garbled: lots of accented Latin chars, very few CJK
  if (accentCount > 20 && cjkCount < 5) return true;
  if (gbkGarbageCount > 15 && cjkCount < 10) return true;
  if (replacementCount > 5) return true;
  if (cjkDensity < 0.01 && accentCount > 10) return true;

  // GBK-decoded-as-UTF-8 mojibake: produces REAL CJK chars but the WRONG ones.
  // These specific characters are NEVER used in real Chinese text but appear in
  // almost every sentence of GBK→UTF-8 mojibake:
  //   鏄 (should be 是)  鐨 (should be 的)  涓 (should be 不/国/中)
  //   鏂 (should be 文/新)  鍏 (should be 共/公)  鑳 (should be 能)
  //   鎵 (should be 所)  鐢 (should be 电/由)  闄 (should be 院/除)
  //   鑷 (should be 自)  鍒 (should be 到/制)  浠 (should be 以/今)
  const gbkUtf8MarkerChars = (text.match(/[鏄鐨涓鏂鍏鑳鎵鐢闄鑷鍒浠榛]/g) || []).length;
  // At medium CJK density (0.05-0.15), a high rate of these marker chars indicates GBK→UTF-8 mojibake
  if (cjkDensity > 0.05 && cjkDensity < 0.2 && gbkUtf8MarkerChars > 20) return true;
  // At higher CJK density, even lower marker counts can indicate encoding issues
  if (cjkDensity > 0.05 && gbkUtf8MarkerChars > 50) return true;

  return false;
}

/**
 * Strip HTML tags, scripts, styles, and entities from raw HTML.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Filter out non-publication lines that were wrongly captured.
 * Chinese profile pages often have descriptive text (e.g. "发表了50余篇论文")
 * mixed with actual paper lists. This filters out the garbage.
 */
/**
 * Extract publications from JSON-LD structured data in HTML.
 * Many university pages embed Schema.org ScholarlyArticle or CreativeWork
 * in <script type="application/ld+json"> tags.
 */
function extractPublicationsFromJsonLd(html: string): ScrapedPublication[] {
  const results: ScrapedPublication[] = [];
  const scriptRegex = /<script\s+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);

      // Normalize to array
      const items = Array.isArray(json) ? json : (json['@graph'] || [json]);

      for (const item of items) {
        // Schema.org ScholarlyArticle, Article, or CreativeWork
        const type = item['@type'];
        if (!type) continue;
        const types = Array.isArray(type) ? type : [type];
        const isArticle = types.some((t: string) =>
          /ScholarlyArticle|Article|CreativeWork|Book|Thesis|PublicationIssue/i.test(t),
        );
        if (!isArticle) continue;

        const title = item.name || item.headline || '';
        if (!title || title.length < 5) continue;

        // Authors
        let authors: string[] = [];
        const authorList = item.author || [];
        const authorItems = Array.isArray(authorList) ? authorList : [authorList];
        for (const a of authorItems) {
          if (typeof a === 'string') {
            authors.push(a);
          } else if (a?.name) {
            authors.push(a.name);
          }
        }

        // Journal / venue
        const journal =
          item.publisher?.name ||
          (item.isPartOf?.name) ||
          item.journal?.name ||
          (typeof item.publisher === 'string' ? item.publisher : undefined) ||
          undefined;

        // DOI
        let doi: string | undefined;
        if (item.sameAs) {
          const doiMatch = (typeof item.sameAs === 'string' ? item.sameAs : '')
            .match(/10\.\d{4,}\/[\S]+/);
          if (doiMatch) doi = doiMatch[0];
        }
        if (!doi && item.identifier) {
          const idList = Array.isArray(item.identifier) ? item.identifier : [item.identifier];
          for (const id of idList) {
            if (typeof id === 'string' && id.startsWith('10.')) {
              doi = id;
              break;
            }
            if (id?.['@type'] === 'PropertyValue' && id?.propertyID === 'DOI') {
              doi = id.value;
              break;
            }
          }
        }

        // Year
        let year: number | undefined;
        const dateStr = item.datePublished || item.dateCreated || '';
        const yearMatch = dateStr.match(/(\d{4})/);
        if (yearMatch) year = parseInt(yearMatch[1], 10);

        // URL
        const url = typeof item.url === 'string' ? item.url : null;

        // Description / abstract
        const abstract = item.description || undefined;

        results.push({
          title: title.slice(0, 300),
          authors,
          journal,
          year: year ?? null,
          doi: doi ?? null,
          url,
          citationCount: null,
          abstract: typeof abstract === 'string' ? abstract.slice(0, 2000) : null,
          publishedAt: year ? `${year}-01-01` : null,
        });
      }
    } catch {
      // JSON parse error — skip this script block
    }
  }

  return results;
}

function isValidPublicationLine(line: string): boolean {
  // Extended length limit — some Chinese paper refs include full author lists
  if (line.length > 400) return false;

  // Lines that are clearly not paper titles
  const garbagePatterns = [
    /^.{0,30}[：:]\s*$/,                    // section headers like "论文："
    /^\d{4}年/,                              // "2023年" - date header, not a paper
    /^\d{4}-\d{4}/,                          // "2020-2023" year range
    /发表了?\d+余?篇/,                       // "发表了50余篇" - count description
    /共发表/,                                 // "共发表论文"
    /发表论文/,                               // "发表论文XX篇"
    /SCI.{0,5}收录/,                         // "SCI收录X篇"
    /EI.{0,5}收录/,                           // "EI收录X篇"
    /引用.*次|被引.*次/,                     // citation counts
    /代表性.*论文/,                           // "代表性论文"
    /近[三五]年/,                             // "近五年"
    /主要.*成果/,                             // "主要成果"
    /包括[:：]/,                              // "包括：..."
    /如下[:：]/,                              // "如下："
    /论文列表/,                               // "论文列表"
    /发表时间/,                               // "发表时间"
    /著作[:：]/,                              // "著作："
    /期刊.*论文/,                             // "期刊论文"
    /会议.*论文/,                             // "会议论文"
    /第一作者/,                               // "第一作者"
    /通讯作者/,                               // "通讯作者"
    /担任.*主编|担任.*编委/,                 // editorial roles
    /主持.*项目|承担.*项目/,                 // project descriptions
    /研究方向/,                               // research direction header
    /研究领域/,                               // research field header
    /获奖|荣获|获得.*奖/,                    // award descriptions
    /博士学位|硕士学位|学士学位/,            // degree descriptions
    /邮箱[:：]|电话[:：]|地址[:：]/,         // contact info
    /教授|副教授|讲师|研究员/,               // title descriptions (when standalone)
    /博士生导师|硕士生导师/,                 // advisor descriptions
  ];

  for (const pattern of garbagePatterns) {
    if (pattern.test(line)) return false;
  }

  // Must contain at least some content that looks like a paper:
  const looksLikePaper =
    /(?:19|20)\d{2}/.test(line) ||          // has a year
    /[\[\(].*[\]\)]/.test(line) ||           // has brackets (common in refs)
    /[「『""].*[」』""]/.test(line) ||       // has quotes
    /学报|期刊|杂志|会议|Journal|Conference|Proc\.|IEEE|ACM|Springer/.test(line) ||
    /第[一二三四五六七八九十\d]+[卷期页]/.test(line) ||  // volume/issue/page
    /vol\.?\s*\d+/i.test(line) ||            // volume reference
    /pp?\.?\s*\d+/.test(line) ||             // page reference
    /DOI/i.test(line) ||                     // DOI reference
    /[（(]\d{4}[）)]/.test(line) ||          // year in parentheses: (2023)
    /[（(](?:19|20)\d{2}[）)]/.test(line) || // full paren year
    /^(?:[\[（(]?\d+[\]）)]?\s*)[A-Za-z]/.test(line) || // numbered English paper
    /^(?:[\[（(]?\d+[\]）)]?\s*)[一-鿿]/.test(line) ||  // numbered Chinese paper
    /[Jj].*[Vv]ol\.?\s*\d+/i.test(line) ||   // Journal Vol. pattern
    /\bet\s+al\b/i.test(line) ||              // "et al" indicates paper
    /doi\s*[:：]?\s*10\./i.test(line) ||     // DOI: 10.xxx
    /arXiv/i.test(line) ||                    // arXiv reference
    /[Ss]ciencedirect|[Ss]pringer|[Ww]iley|[Ee]lsevier/i.test(line) || // publisher
    /\d+\s*\(\d+\)\s*[:：]/.test(line);      // "42(3): 12-25" format

  return looksLikePaper;
}

/**
 * Extract structured metadata from a publication line.
 * Attempts to parse: author list, journal name, DOI, year.
 */
function extractPublicationMetadata(line: string): {
  title: string;
  authors: string[];
  journal: string | null;
  doi: string | null;
  year: number | null;
} {
  let title = line.trim();
  const authors: string[] = [];
  let journal: string | null = null;
  let doi: string | null = null;
  let year: number | null = null;

  // Extract DOI
  const doiMatch = line.match(/(?:doi\s*[:：]?\s*)?(10\.\d{4,}\/[\S]+)/i);
  if (doiMatch) {
    doi = doiMatch[1].replace(/[.,;]+$/, ''); // strip trailing punctuation
    title = title.replace(doiMatch[0], '').trim();
  }

  // Extract year
  const yearMatch = line.match(/(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  // Extract author list — common pattern: "Author1, Author2, ... Title ..."
  // Try to split at common separators before the title body
  const authorSepMatch = title.match(
    /^((?:[A-Za-zÀ-ÖØ-öø-ÿ]+(?:\s+[A-Z][a-z]+)?(?:[,，;；\s]+|，|\s*&\s*))+?)(?=\s*(?:[A-Z][a-z]+\s){0,2}(?:[\(（]|学报|期刊|Journal|Conference|IEEE|ACM|Proc|Trans|Vol\.?|pp?\.?|\d{4}))/,
  );
  if (authorSepMatch) {
    const authorStr = authorSepMatch[1];
    const parts = authorStr.split(/[,，;；]|\s*&\s*/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 1 && /[A-Za-z]/.test(trimmed)) {
        authors.push(trimmed);
      }
    }
    if (authors.length > 0) {
      title = title.slice(authorSepMatch[0].length).trim();
    }
  }

  // Detect journal name
  const journalPatterns = [
    /[,，]\s*(.+?(?:学报|期刊|[Jj]ournal|[Tt]ransactions|[Pp]roceedings|[Bb]ulletin|杂志|会议)(?:\s*,|\s*，|\s*$|$))/,
    /^(.+?(?:学报|[Jj]ournal|[Tt]ransactions|[Pp]roceedings|[Bb]ulletin))[,\s]*\d{4}/,
    /^(.+?(?:学报|[Jj]ournal|[Tt]ransactions|[Pp]roceedings|[Bb]ulletin))\s*vol/i,
  ];
  for (const jp of journalPatterns) {
    const jm = line.match(jp);
    if (jm) {
      journal = jm[1].trim();
      break;
    }
  }

  return { title, authors, journal, doi, year };
}

/**
 * Extract a single matching group from HTML using a regex.
 */
function extractWith(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]?.trim()) {
      return m[1].trim();
    }
  }
  return null;
}

/**
 * Normalize an obfuscated email address.
 * Handles: name[at]domain[dot]com, name(at)domain(dot)com, name#domain.com
 */
function normalizeEmail(raw: string): string | null {
  const standardMatch = raw.match(
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  );
  if (standardMatch) return standardMatch[0].toLowerCase();

  let result = raw
    .replace(/\s*\[at\]\s*/gi, '@')
    .replace(/\s*\[dot\]\s*/gi, '.')
    .replace(/\s*\(at\)\s*/gi, '@')
    .replace(/\s*\(dot\)\s*/gi, '.')
    .replace('#', '@');

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(result) ? result.toLowerCase() : null;
}

/**
 * Discover profile links from a faculty list page HTML.
 */
function discoverProfileLinks(
  html: string,
  listUrl: string,
  customPatterns?: RegExp[],
): string[] {
  const patterns = customPatterns || [
    // 1. Teacher/faculty profile pages — common URL patterns with Chinese names
    /<a[^>]*href="([^"]*(?:\/teacher\/|\/people\/|\/faculty\/|\/person\/|\/facultyDetail\/)[^"]*)"[^>]*>[\s\S]*?[一-鿿]{2,6}[\s\S]*?<\/a>/gi,
    // 2. Generic profile info pages (e.g., /info/1088/6871.htm)
    /<a[^>]*href="([^"]*(?:\/info\/)\d+\/\d+\.html?[^"]*)"[^>]*>[\s\S]*?[一-鿿]{2,6}[\s\S]*?<\/a>/gi,
    // 3. CMS article/profile pages with .htm/.html AND Chinese name — URL must look like a content page
    /<a[^>]*href="([^"]*(?:\/\d+\/|(?:\/|_)[a-z]+\d*\.html?|(?:\/|_)\d+\.html?)[^"]*)"[^>]*>[\s\S]*?[一-鿿]{2,6}[\s\S]*?<\/a>/gi,
    // 4. Date-based profile paths (e.g., /2024/0117/c48203a479468/page.htm)
    /<a[^>]*href="([^"]*\/\d{4}\/\d{4}\/[^"]*\d+\.html?[^"]*)"[^>]*>[\s\S]*?[一-鿿]{2,6}[\s\S]*?<\/a>/gi,
    // 5. JSP teacher profile pages with Chinese text
    /<a[^>]*href="([^"]*\.jsp[^"]*)"[^>]*>[\s\S]*?[一-鿿]{2,6}[\s\S]*?<\/a>/gi,
    // 6. Generic: teacher list pages often have links like /szdw/js/xxx or /szdw/info/xxx
    /<a[^>]*href="([^"]*\/szdw\/(?:js|info|zrjs|jsml|szll)\/[^"]*)"[^>]*>[\s\S]*?<\/a>/gi,
    // 7. Links with URL containing teacher ID patterns (e.g., .../id/123 or .../tid=456)
    /<a[^>]*href="([^"]*(?:\/[jt]id[=\/]\d+|\/teacher\/\d+|\/faculty\/\d+)[^"]*)"[^>]*>[\s\S]*?<\/a>/gi,
    // 8. "教职工名录" sub-page links — these often lead to actual teacher lists
    /<a[^>]*href="([^"]*(?:\/jsmc\/|\/jsml\/|\/szll\/|\/jzgml\/|\/zrjs\/)[^"]*)"[^>]*>[\s\S]*?<\/a>/gi,
    // 9. PHP redirect links used by ZJU-style CMS for teacher profiles
    /<a[^>]*href="([^"]*(?:\/redir\.php|_upload\/tpl\/)[^"]*)"[^>]*>[\s\S]*?[一-鿿]{2,6}[\s\S]*?<\/a>/gi,
    // 10. Generic link with 2-4 CJK name text — catch-all for pages with teacher names
    /<a[^>]*href="([^"]*\.(?:htm|html|php|jsp)[^"]*)"[^>]*>\s*([一-鿿]{2,4})\s*<\/a>/gi,
	    // 11. ASPX profile pages with teacher IDs (common in newer CMS)
	    /<a[^>]*href="([^"]*(?:\.aspx\?id=|\.aspx\?tid=|teacher_detail\.aspx|faculty_detail\.aspx)[^"]*)"[^>]*>[\s\S]*?<\/a>/gi,
	    // 12. Modern SPA-style profile URLs with teacher slugs
	    /<a[^>]*href="([^"]*(?:\/teacher\/[a-z-]+|\/faculty\/[a-z-]+|\/profile\/[a-z-]+|\/people\/[a-z-]+)[^"]*)"[^>]*>[\s\S]*?<\/a>/gi,
	    // 13. CMS article pages (wordpress, drupal) with CJK names
	    /<a[^>]*href="([^"]*(?:\/\?p=\d+|\/archives\/\d+|\/\d{4}\/\d{2}\/[^"]+)[^"]*)"[^>]*>[\s\S]*?[一-鿿]{2,6}[\s\S]*?<\/a>/gi,
	    // 14. Links with URL-encoded Chinese characters in path
	    /<a[^>]*href="([^"]*%[A-F0-9]{2}%[A-F0-9]{2}[^"]*)"[^>]*>[\s\S]*?<\/a>/gi,
	    // 15. "了解更多/查看详情" links to full profiles from summary cards
	    /<a[^>]*href="([^"]*(?:\/detail\/|\/view\/|\/show\/|\/content\/|\/read\/)[^"]*)"[^>]*>(?:查看详情|详细信息|了解|more|detail|read more|查看)[\s\S]*?<\/a>/gi,
  ];

  const links = new Set<string>();
  const baseUrl = (() => {
    try {
      const u = new URL(listUrl);
      return `${u.protocol}//${u.host}`;
    } catch {
      return '';
    }
  })();

  // Navigation text patterns to SKIP — these are NOT teacher names
  const NAV_SKIP_TEXT = new Set([
    // Basic UI
    '首页', '上一页', '下一页', '尾页', '末页', '返回', '更多', '查看详情',
    '登录', '注册', 'English', 'ENGLISH', '旧版',
    // Institution overview
    '学院概况', '学院简介', '组织架构', '历史沿革', '师资队伍',
    '师资名单', '杰出人才', '教职工名录', '教师名录', '导师介绍', '导师列表',
    '在职教师', '兼职教授', '客座教授', '访问学者', '退休教师', '退休教师名录',
    '博士生导师', '硕士生导师', '按职称检索', '团队现拥有',
    // Education
    '人才培养', '本科生教育', '研究生教育', '留学生教育', '教育教学',
    '本科教学', '研究生教学', '教学成果', '课程建设', '教学名师',
    '培养方案', '培养计划', '教学计划', '教学日历', '教学平台',
    '教学基地', '教学信息', '教学资源', '实验教学', '实践教学',
    '教务教学', '教务通知', '学工通知', '学院通知', '院内公告',
    '招生信息', '招生工作', '招生资讯', '本科生招生', '博士招生',
    '硕士招生', '研究生招生', '留学生招生', '留学生项目',
    '本科生院', '研究生院', '博士研究生', '硕士研究生',
    // Research
    '科学研究', '科研快讯', '科研机构', '科研成果', '学术委员会',
    '科研动态', '科研通知', '科研合作', '学术交流', '学术交流会',
    '学位评定', '教学指导', '职务评审', '人才工作', '人才招聘',
    '人才培养', '人才梯队', '各类人才', '层次人才', '年人才计',
    '队伍建设', '工作队伍', '长期招聘', '教师招聘',
    // Student affairs
    '学生工作', '学生活动', '学生动态', '学生党建', '学生培养',
    '团学工作', '团学组织', '班团活动', '活动赛事', '四季活动',
    '学习资料', '学习教育', '劳动教育', '主题教育',
    // Party / Union
    '党建思政', '党建工作', '党建动态', '党建园地', '党建平台',
    '党建创优', '党群工作', '党群动态', '党群建设', '党群之窗',
    '工会活动', '工会组织', '工会教代会', '工会之家', '工会风采',
    '工会新闻', '工会资料', '组织体系', '组织结构',
    // Exchange / Cooperation
    '对外交流', '对外合作', '国际交流', '合作交流', '交流活动',
    '交流与合作', '交流动态', '海外交流', '合作高校', '合作项目',
    '学生交流', '教师交流', '校企合作', '国际合作', '国内合作',
    '产学研合作', '项目合作',
    // Alumni
    '校友中心', '校友会', '校友服务', '校友风采', '校友活动',
    '校友名录', '校友天地', '校友之窗', '校友工作', '校友信息',
    '校友捐赠', '校友专栏', '校友录', '校友动态', '校友会介绍',
    '校友会章程', '校友名册', '校友注册', '知名校友', '杰出校友',
    '服务校友', '信电校友',
    // News / Updates
    '新闻中心', '新闻动态', '新闻公告', '新闻合集', '师大新闻',
    '焦点新闻', '专题新闻', '活动新闻', '最新动态', '校园动态',
    '通知公告', '公告公示', '其他通知', '获奖公告', '动态公告',
    '专题聚焦', '资料汇编',
    // Downloads / Resources
    '下载中心', '下载专区', '下载区', '常用下载', '文档下载',
    '招生信息', '就业信息',
    // Contact / Admin
    '联系方式', '网站地图', '学生内部网', '教师内部网', '会议室预订',
    '教工之家', '院长信箱', '书记信箱', '职能部门',
    '学生邮箱', '教师邮箱', '公共邮箱', '邮箱',
    '制度职责', '规章制度', '采购公告', '采购信息', '采购管理',
    '服务链接', '友情链接', '相关链接', '热点链接', '栏目导航',
    '网站首页', '学校首页', '学院首页', '联盟网站',
    // Department names (not people)
    '计算机科学系', '计算机工程系', '人工智能系', '软件工程系',
    '数据科学与工程系', '网络空间安全系', '信息安全系',
    '基础教学部',
    // Other
    '教育基金会', '教育机构', '教育部', '教育大数据', '教育培养',
  ]);

  function isNavText(text: string): boolean {
    const cleaned = text.replace(/<[^>]+>/g, '').trim();
    // Skip if any part of the text matches known nav items
    for (const navText of NAV_SKIP_TEXT) {
      if (cleaned.includes(navText)) return true;
    }
    // Skip if text is too long (likely not a name)
    if (cleaned.length > 20) return true;
    // Skip if it looks like a nav item (contains keywords)
    if (/^(?:更多|查看|下一页|上一页|返回|首页|尾页)/.test(cleaned)) return true;
    // Skip if text contains navigation-like keywords even as substring
    if (/[教育新闻公告通知下载链接导航招聘组织制度党建工会校友交流合作邮箱采购招标规章活动动态专题登录注册]/.test(cleaned) && cleaned.length >= 4) {
      return true;
    }
    // Skip if the text has non-name Chinese chars (indicating navigation/organization)
    if (/[院校系部处中心会网页版录栏表科研究项导师范生招培计]/.test(cleaned) && cleaned.length >= 4) {
      return true;
    }
    return false;
  }

  // Common non-profile URL patterns to skip
  const SKIP_PATTERNS = [
    /\/webmaster/, /\/admin/, /\/login/, /\/logout/, /\/user\//,
    /\/contact/, /\/about/, /\/node\/\d+$/, /javascript:/, /mailto:/,
    /\/(?:en|english)\//,
    // Skip list/topic pages (not individual profiles)
    /\/list\.html?$/i, /\/list_\d+\.html?$/i, /\/list\.jsp/i,
    /\/index\.html?$/i, /\/index\.jsp/i,
    // Skip known navigation/section pages
    /\/xygk\//, /\/xwzx\//, /\/jyjx\//, /\/kxyj\//, /\/xsgz\//,
    /\/djgz\//, /\/dwjl\//, /\/xyzx\//, /\/tzgg\//, /\/zsjy\//,
    /\/xzzx\//, /\/lxwm\//, /\/wzdt\//, /\/rczp\//, /\/gjhd\//,
    /\/gjjl\//, /\/xyh\//, /\/djwh\//, /\/ghhd\//, /\/txyl\//,
    /\/rcpy\//, /\/yjspy\//, /\/bksjy\//, /\/jyjx\//, /\/xsjy\//,
    // Skip pages that look like list views (pagination, category, search)
    /[?&]page=\d+/i, /[?&]p=\d+/i, /[?&]category=/i, /[?&]cat=/i,
    /[?&]search=/i, /[?&]keyword=/i, /[?&]tag=/i,
    // Skip topic aggregates (not individual profiles)
    /\/topic\//, /\/category\//, /\/tag\//, /\/archive\//,
  ];

  for (const pattern of patterns) {
    const matches = html.matchAll(pattern);
    for (const m of matches) {
      const fullMatch = m[0];
      let href = m[1]?.trim();
      if (!href) continue;

      // Check link text for navigation keywords
      if (isNavText(fullMatch)) continue;

      // Skip anchors, javascript links, mailto
      if (
        href.startsWith('#') ||
        href.startsWith('javascript:') ||
        href.startsWith('mailto:')
      ) {
        continue;
      }
      // Skip links back to the list itself
      if (href === listUrl || href === '/') continue;

      // Skip known non-profile paths
      const skip = SKIP_PATTERNS.some((p) => p.test(href));
      if (skip) continue;

      // Resolve relative URLs
      if (href.startsWith('/')) {
        href = `${baseUrl}${href}`;
      } else if (!href.startsWith('http')) {
        const base = listUrl.substring(0, listUrl.lastIndexOf('/') + 1);
        href = `${base}${href}`;
      }

      // Only accept .edu.cn or .cas.cn or .ac.cn domains
      if (
        href.includes('.edu.cn') ||
        href.includes('.cas.cn') ||
        href.includes('.ac.cn')
      ) {
        links.add(href);
      }
    }
  }

  return [...links];
}

/**
 * Try to extract department from the HTML <title> tag.
 * Many Chinese university pages embed department info in the title:
 *   "蔡朝晖-武汉大学计算机学院" → "计算机学院"
 *   "蔡穗华 | 中山大学计算机学院" → "计算机学院"
 */
function extractDepartmentFromTitle(html: string, universityName?: string): string | null {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (!titleMatch) return null;
  const titleText = titleMatch[1].trim();

  if (universityName) {
    const idx = titleText.indexOf(universityName);
    if (idx >= 0) {
      const afterUni = titleText.substring(idx + universityName.length).trim();
      const cleaned = afterUni.replace(/^[\s\-—|]+/, '').trim();
      if (cleaned.length >= 2 && cleaned.length < 30) {
        return cleaned;
      }
    }
  }

  // Fallback: find last segment that looks like a department
  const parts = titleText.split(/[\s\-—|]+/);
  for (let i = parts.length - 1; i >= Math.max(0, parts.length - 2); i--) {
    const part = parts[i].trim();
    if (part.length >= 2 && part.length < 30 && /[学院系所中心部院馆研究室]/.test(part)) {
      return part;
    }
  }

  return null;
}

// ─── Section-Based HTML Extraction ───

interface HtmlSection {
  heading: string;
  headingTag: string; // 'h2' | 'h3' | 'h4'
  content: string;    // text content under this heading
}

/**
 * Parse HTML into a list of headed sections.
 * Preserves the document structure: each heading (h2-h4) starts a new section.
 * Sections without headings are grouped under an empty heading key.
 */
function extractSectionsFromHtml(html: string): HtmlSection[] {
  const sections: HtmlSection[] = [];

  // Strategy 1: Standard h2-h4 heading tags
  const headingRegex = /<(h[234])[^>]*>\s*([^<]{1,100})<\/\1>\s*([\s\S]*?)(?=<(?:h[234])[^>]*>|$)/gi;
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    const headingTag = match[1].toLowerCase();
    const heading = match[2].trim();
    const rawContent = match[3] || '';
    const content = stripHtml(rawContent);
    sections.push({ heading, headingTag, content });
  }

  // Strategy 2: If no h2-h4 sections found, try div/strong-based headings
  // Many Chinese university pages use <div class="title"> or <strong> as section headers
  if (sections.length === 0) {
    const altHeadingRegex = /<(?:div|p|span|strong|b|font)\s[^>]*(?:class|id)\s*=\s*["'](?:[^"']*?(?:title|section|heading|subtitle|caption|name)[^"']*?)["'][^>]*>\s*([^<]{1,100})<\/(?:div|p|span|strong|b|font)>/gi;
    while ((match = altHeadingRegex.exec(html)) !== null) {
      const heading = match[1].trim();
      // Get content after this heading until next heading-like element
      const restHtml = html.substring(match.index + match[0].length);
      const nextMatch = altHeadingRegex.exec(html);
      altHeadingRegex.lastIndex = match.index + match[0].length; // reset
      const contentEnd = nextMatch ? nextMatch.index : html.length;
      const rawContent = html.substring(match.index + match[0].length, contentEnd);
      const content = stripHtml(rawContent);
      if (heading.length > 1 && content.length > 5) {
        sections.push({ heading, headingTag: 'div', content });
      }
    }
  }

  // Strategy 3: Try finding labeled sections via text patterns
  // Look for text like "研究方向：..." or "科研项目：..." and split on them
  if (sections.length === 0) {
    const labelPattern = /(?:研究方向|研究领域|科研项目|在研项目|教学成果|获奖情况|论文[著作发表]|竞赛[获奖]?|荣誉称号|人才称号|学术荣誉|教育背景|工作经历|个人简介|教师简介)\s*[：:：]\s*/g;
    let labelMatch;
    const textOnly = stripHtml(html);
    while ((labelMatch = labelPattern.exec(textOnly)) !== null) {
      const label = labelMatch[0].replace(/[：:：]\s*$/, '');
      const startIdx = labelMatch.index + labelMatch[0].length;
      // Find next label or end of text
      labelPattern.lastIndex = startIdx;
      const nextLabelMatch = labelPattern.exec(textOnly);
      const endIdx = nextLabelMatch ? nextLabelMatch.index : textOnly.length;
      const content = textOnly.substring(startIdx, endIdx).trim();
      if (content.length > 3) {
        sections.push({ heading: label, headingTag: 'text', content });
      }
    }
  }

  // Strategy 4: Table-based extraction (common in Chinese university CMS)
  // Many profiles use <table> with <td>/<th> pairs for label+value layout
  if (sections.length === 0) {
    const knownLabels = '(?:研究方向|研究领域|科研项目|获奖情况|荣誉称号|教育背景|个人简介|论文[著作发表]|竞赛获奖|人才称号|教学成果|联系方式|电子邮箱|职称|职务|所属单位|所在院系|所在学院|学术兼职|社会兼职|导师类别|招生专业)';
    const tableRowRegex = new RegExp(
      `<(?:td|th)[^>]*>\\s*${knownLabels}\\s*<\\/(?:td|th)>\\s*<(?:td|th)[^>]*>\\s*([\\s\\S]*?)\\s*<\\/(?:td|th)>`,
      'gi',
    );
    let tableMatch;
    while ((tableMatch = tableRowRegex.exec(html)) !== null) {
      const fullMatch = tableMatch[0];
      // Extract the label from the first cell
      const labelMatch = fullMatch.match(new RegExp(`(${knownLabels})`));
      if (labelMatch) {
        const heading = labelMatch[1];
        const content = stripHtml(tableMatch[1] || '');
        if (content.length > 2) {
          sections.push({ heading, headingTag: 'td', content });
        }
      }
    }
  }

  return sections;
}

/**
 * Find content from the first section whose heading matches the given pattern.
 */
function findSectionContent(
  sections: HtmlSection[],
  headingPattern: RegExp,
): string | null {
  for (const section of sections) {
    if (headingPattern.test(section.heading) && section.content.length > 3) {
      return section.content;
    }
  }
  // Fallback: also search in content of sections with generic headings
  // (Some pages have all content under one generic heading)
  for (const section of sections) {
    if (section.content.length > 10 && headingPattern.test(section.content)) {
      // Extract just the relevant portion from the content
      const match = section.content.match(
        new RegExp(
          `(?:${headingPattern.source})\\s*[：:：]?\\s*([\\s\\S]{5,2000}?)(?:研究方向|研究领域|科研项目|论文|获奖|竞赛|教育|工作|联系|教学|个人|主讲|社会|$)`,
          'i',
        ),
      );
      if (match) return match[1] || match[0];
    }
  }
  return null;
}

// ─── Breadcrumb & URL Department Extraction ───

/**
 * Extract department from breadcrumb navigation.
 * Chinese university breadcrumbs typically look like:
 *   "首页 > 计算机学院 > 师资队伍 > 张三"
 *   "Home > School of Computer Science > Faculty"
 */
function extractDepartmentFromBreadcrumb(html: string): string | null {
  // Find breadcrumb containers
  const breadcrumbPatterns = [
    /<nav[^>]*aria-label="breadcrumb"[^>]*>([\s\S]*?)<\/nav>/i,
    /<div[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*crumbs[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*position[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  let breadcrumbText = '';
  for (const pattern of breadcrumbPatterns) {
    const match = html.match(pattern);
    if (match) {
      breadcrumbText = stripHtml(match[1]);
      break;
    }
  }

  if (!breadcrumbText) return null;

  // Split by common separators
  const parts = breadcrumbText.split(/[>＞\/\\|»→]/).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  // The department is typically the second or second-to-last meaningful part
  // Look for parts that contain department keywords
  const DEPT_KEYWORDS = /学院|系|研究所|中心|实验室|学部|研究院/;
  for (let i = parts.length - 2; i >= 0; i--) {
    if (DEPT_KEYWORDS.test(parts[i]) && parts[i].length >= 2 && parts[i].length < 30) {
      return parts[i];
    }
  }

  return null;
}

/**
 * Infer department from URL path structure.
 * Common patterns:
 *   /cs/szdw/... → 计算机学院
 *   /physics/... → 物理学院
 *   /math/... → 数学学院
 */
function inferDepartmentFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    if (pathParts.length < 2) return null;

    // Map common URL path prefixes to department names
    const PATH_DEPT_MAP: Record<string, string> = {
      'cs': '计算机学院',
      'cse': '计算机科学与工程学院',
      'cst': '计算机科学与技术学院',
      'computer': '计算机学院',
      'computing': '计算机学院',
      'ee': '电子工程学院',
      'eie': '电子信息工程学院',
      'electronic': '电子学院',
      'physics': '物理学院',
      'phys': '物理学院',
      'math': '数学学院',
      'mathematics': '数学学院',
      'chemistry': '化学学院',
      'chem': '化学学院',
      'biology': '生命科学学院',
      'bio': '生物学院',
      'life': '生命科学学院',
      'medicine': '医学院',
      'med': '医学院',
      'law': '法学院',
      'economics': '经济学院',
      'econ': '经济学院',
      'management': '管理学院',
      'business': '商学院',
      'art': '艺术学院',
      'music': '音乐学院',
      'foreign': '外国语学院',
      'english': '外国语学院',
      'history': '历史学院',
      'philosophy': '哲学学院',
      'sociology': '社会学院',
      'psychology': '心理学院',
      'education': '教育学院',
      'environment': '环境学院',
      'materials': '材料学院',
      'mechanics': '力学学院',
      'civil': '土木工程学院',
      'architecture': '建筑学院',
      'aero': '航空航天学院',
      'nuclear': '核科学学院',
      'ocean': '海洋学院',
      'marine': '海洋学院',
      'pharmacy': '药学院',
      'public': '公共管理学院',
      'journalism': '新闻学院',
      'information': '信息学院',
      'informatics': '信息学院',
      'software': '软件学院',
      'ai': '人工智能学院',
      'data': '数据科学学院',
      'network': '网络空间安全学院',
      'security': '信息安全学院',
      'automation': '自动化学院',
      'control': '控制学院',
      'mechanical': '机械工程学院',
      'energy': '能源学院',
      'power': '电力学院',
      'optics': '光电学院',
      'optical': '光电学院',
      'telecom': '电信学院',
      'communication': '通信学院',
      'microelectronics': '微电子学院',
    };

    // Check first few path parts (often contain department abbreviation)
    for (let i = 0; i < Math.min(pathParts.length, 3); i++) {
      const part = pathParts[i].toLowerCase().replace(/[^a-z]/g, '');
      if (PATH_DEPT_MAP[part]) {
        return PATH_DEPT_MAP[part];
      }
    }

    // Try fuzzy matching
    for (let i = 0; i < Math.min(pathParts.length, 3); i++) {
      const part = pathParts[i].toLowerCase().replace(/[^a-z]/g, '');
      for (const [key, dept] of Object.entries(PATH_DEPT_MAP)) {
        if (part.includes(key) || key.includes(part)) {
          if (key.length >= 3 && part.length >= 3) {
            return dept;
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Improved Level/Award Extraction ───

/**
 * Extract competition level and award with consistency validation.
 * Prevents contradictions like "省部级竞赛" being marked as "国际级".
 */
function extractCompLevelAndAward(text: string): {
  level: string | null;
  award: string | null;
} {
  let level: string | null = null;
  let award: string | null = null;

  // Extract structural labels first (more reliable)
  const levelMatch = text.match(/(?:等级|级别|竞赛级别)[：:]\s*([^\s,，;；]+)/);
  if (levelMatch) {
    const rawLevel = levelMatch[1];
    if (/国际|international/i.test(rawLevel)) level = '国际级';
    else if (/国家|全国|national/i.test(rawLevel)) level = '国家级';
    else if (/省|province/i.test(rawLevel)) level = '省部级';
    else if (/校|school|university/i.test(rawLevel)) level = '校级';
  }

  // Extract structural award labels
  const awardMatch = text.match(/(?:获奖|奖项|名次)[：:]\s*([^\s,，;；]+)/);
  if (awardMatch) {
    const rawAward = awardMatch[1];
    if (/一等|金奖|gold|first/i.test(rawAward)) award = '一等奖/金奖';
    else if (/二等|银奖|silver|second/i.test(rawAward)) award = '二等奖/银奖';
    else if (/三等|铜奖|bronze|third/i.test(rawAward)) award = '三等奖/铜奖';
    else if (/特等|special/i.test(rawAward)) award = '特等奖';
  }

  // Fallback: keyword-based detection (only if structural not found)
  if (!level) {
    // Check keywords with priority (more specific first)
    if (/国际级|international.level/i.test(text)) level = '国际级';
    else if (/国家级|全国性|national.level/i.test(text)) level = '国家级';
    else if (/省部级|省级|province.level/i.test(text)) level = '省部级';
    else if (/校级|校赛|school.level/i.test(text)) level = '校级';
    else if (/国际|international/i.test(text)) level = '国际级';
    else if (/国家|全国|national/i.test(text)) level = '国家级';
    else if (/省[^份内外]|province/i.test(text)) level = '省部级';
    else if (/校[^园]|school|university/i.test(text)) level = '校级';
  }

  if (!award) {
    if (/特等|特奖|special/i.test(text)) award = '特等奖';
    else if (/一等|金奖|gold|first.prize/i.test(text)) award = '一等奖/金奖';
    else if (/二等|银奖|silver|second.prize/i.test(text)) award = '二等奖/银奖';
    else if (/三等|铜奖|bronze|third.prize/i.test(text)) award = '三等奖/铜奖';
    else if (/优秀奖|优胜奖/i.test(text)) award = '优秀奖';
  }

  // ─── Consistency validation ───
  // If the title contains explicit level keywords that contradict the extracted level, nullify level
  if (level) {
    const titleHasInternational = /国际|international/i.test(text);
    const titleHasNational = /国家[^)]|全国|national/i.test(text);
    const titleHasProvince = /省[^份内外]|province/i.test(text);
    const titleHasSchool = /校[^园]|school|university/i.test(text);

    if (level === '国际级' && (titleHasNational || titleHasProvince || titleHasSchool)) {
      // Title mentions lower level but we detected international — trust the title's strongest indicator
      if (titleHasNational && !titleHasInternational) level = '国家级';
      else if (titleHasProvince && !titleHasNational && !titleHasInternational) level = '省部级';
      else if (titleHasSchool && !titleHasProvince && !titleHasNational && !titleHasInternational) level = '校级';
    }
    if (level === '国家级' && titleHasProvince && !titleHasNational) level = '省部级';
    if (level === '省部级' && titleHasSchool && !titleHasProvince) level = '校级';
  }

  if (award) {
    const titleHasTeDeng = /特等|special/i.test(text);
    const titleHasYiDeng = /一等|金奖|gold/i.test(text);
    const titleHasErDeng = /二等|银奖|silver/i.test(text);
    const titleHasSanDeng = /三等|铜奖|bronze/i.test(text);

    if (award.includes('特等') && (titleHasYiDeng || titleHasErDeng || titleHasSanDeng)) {
      award = null;
    } else if (award.includes('一等') && titleHasErDeng && !titleHasYiDeng) {
      award = '二等奖/银奖';
    } else if (award.includes('一等') && titleHasSanDeng && !titleHasYiDeng && !titleHasErDeng) {
      award = '三等奖/铜奖';
    } else if (award.includes('二等') && titleHasSanDeng && !titleHasErDeng) {
      award = '三等奖/铜奖';
    }
  }

  return { level, award };
}

/**
 * Extract evaluation type and result with improved pattern matching.
 */
function extractEvalTypeAndResult(text: string): {
  evalType: string | null;
  result: string | null;
} {
  let evalType: string | null = null;

  // Structural label extraction (more reliable)
  const typeMatch = text.match(/(?:类型|评比类型|称号类别)[：:]\s*([^\s,，;；]+)/);
  if (typeMatch) {
    const rawType = typeMatch[1];
    if (/人才|学者|杰青|优青|长江|千人|万人|院士/i.test(rawType)) evalType = '人才称号';
    else if (/教学|课程|教材|教改/i.test(rawType)) evalType = '教学评比';
    else if (/科研|项目|基金|课题/i.test(rawType)) evalType = '科研奖励';
    else if (/荣誉|先进|优秀|模范/i.test(rawType)) evalType = '学术荣誉';
  }

  // Keyword-based detection (fallback)
  if (!evalType) {
    if (/人才称号|杰青|优青|长江学者|千人计划|万人计划|院士|百人计划/i.test(text))
      evalType = '人才称号';
    else if (/教学名师|教学成果|精品课程|优秀教材|教改项目|教学改革/i.test(text))
      evalType = '教学评比';
    else if (/国家自然科学基金|国家社科基金|973|863|重点研发|科技进步|自然科学奖|技术发明/i.test(text))
      evalType = '科研奖励';
    else if (/优秀教师|先进工作者|劳动模范|师德标兵|教学名师|三育人/i.test(text))
      evalType = '学术荣誉';
  }

  // Result extraction
  let result: string | null = null;
  const resultMatch = text.match(/(入选|获评|通过|获得|授予|当选|获颁|认定为)/);
  if (resultMatch) {
    result = resultMatch[1];
  }

  return { evalType, result };
}

/**
 * NLP fallback: extract competitions from free-form paragraph text.
 * Activated when section-based extraction yields zero results.
 * Scans for mentoring/guidance patterns and embedded competition+level mentions.
 */
function extractCompetitionsFromParagraphs(text: string): ScrapedCompetitionUpdate[] {
  const results: ScrapedCompetitionUpdate[] = [];
  if (!text || text.length < 20) return results;

  // Pattern 1: mentor/guide + student + competition achievement
  const mentorPattern = /(?:指导|带领|辅导|培养)(?:学生|本科生|研究生|博士生|团队|队员)(?:[\s\S]{0,80}?)((?:获得|荣获|取得|斩获|摘得|夺得|赢得)(?:[\s\S]{0,80}?)(?:竞赛|大赛|比赛|赛)(?:[\s\S]{0,40}?)(?:奖|等|金|银|铜))/g;

  // Pattern 2: embedded competition name with award level
  const embeddedPattern = /((?:全国|国际|国家|省[级部]|校[级园]|亚洲|世界)(?:[\s\S]{0,40}?)(?:竞赛|大赛|比赛|赛))\s*[^。]{0,60}?((?:一|二|三|特|金|银|铜|优秀|最佳)(?:等奖|奖))/g;

  // Pattern 3: competition name + year + award
  const yearCompPattern = /((?:19|20)\d{2})\s*(?:年\s*)?((?:全国|国际|国家|省|校)[^，,。\n]{2,20}?(?:竞赛|大赛|比赛|赛))[^。]{0,40}?((?:一|二|三|特|金|银|铜|优秀|最佳)(?:等奖|奖))/g;

  const seen = new Set<string>();

  for (const pattern of [mentorPattern, embeddedPattern, yearCompPattern]) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const title = match[0].slice(0, 300).trim();
      const key = title.slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);

      const { level, award } = extractCompLevelAndAward(title);
      results.push({
        title,
        description: null,
        url: null,
        source: 'cn-university',
        level,
        award,
        publishedAt: null,
      });
    }
  }

  return results;
}

// ─── English Name Extraction Helpers ───

/**
 * Extract English/pinyin name from an email address.
 * e.g. "wang.xiaoming@xxx.edu.cn" → "Wang Xiaoming"
 *      "xiaoming.wang@xxx.edu.cn" → "Xiaoming Wang"
 */
function extractNameFromEmail(email: string): string | null {
  const localPart = email.split('@')[0]?.toLowerCase();
  if (!localPart || localPart.length < 5) return null;

  // Split on common separators
  const parts = localPart.split(/[._\-]/).filter(p => p.length > 1);
  if (parts.length < 2) return null;

  // Skip parts that are clearly not name components
  const nameParts = parts.filter(
    p => !/^\d+$/.test(p) && !/^(info|admin|office|web|mail|contact|support|service|teacher|faculty|staff)$/i.test(p),
  );
  if (nameParts.length < 2) return null;

  // Capitalize each part
  return nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/**
 * Extract English/pinyin name from a profile page URL.
 * e.g. "/teacher/wang-xiaoming" → "Wang Xiaoming"
 *      "/faculty/zhang.san" → "Zhang San"
 */
function extractNameFromUrl(url: string): string | null {
  const urlMatch = url.match(
    /\/(?:teacher|faculty|people|person|en\/teacher|en\/faculty|scholar)\/([a-z]+[-._][a-z]+[-._]?[a-z]*)/i,
  );
  if (!urlMatch) return null;

  const slug = urlMatch[1].toLowerCase();
  // Capitalize each word segment
  return slug.split(/[-._]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─── Profile Parsing ───

function parseProfileHtml(
  html: string,
  sourceUrl: string,
  universityKey: string,
  parserOverrides?: Partial<ProfileParsers>,
): Partial<ScrapedPerson> | null {
  const text = stripHtml(html);

  // PRE-SCAN: Detect if this is a non-profile page (navigation, list, generic section)
  // Early rejection prevents extracting navigation text as scholar names.
  // Check 1: Title contains ONLY navigation/organizational keywords (no person name)
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].trim() : '';
  const NON_PROFILE_TITLE_PATTERNS = [
    /^(?:首页|导航|列表|目录|汇总|搜索|登录|注册)$/,
    /^(?:学院概况|学院简介|历史沿革|规章制度|通知公告|招生信息|就业信息|下载中心|联系方式|网站地图)$/,
  ];
  // Allow titles that contain person names alongside nav words (e.g. "王义 | 教师简介")
  const hasPersonName = pageTitle.length >= 2 && pageTitle.length <= 30 && /[一-鿿]{2,6}/.test(pageTitle);
  if (pageTitle && !hasPersonName && NON_PROFILE_TITLE_PATTERNS.some(p => p.test(pageTitle))) {
    return null; // Title is purely nav text, no person name detected
  }

  // Check 2: Page has an excessive number of links (faculty list pages, not profiles)
  // Chinese university profile pages can have many links in headers/footers/sidebars
  // (100-250 is normal). Only reject pages with truly excessive links (>500).
  const linkCount = (html.match(/<a\s[^>]*href="[^"]*"[^>]*>/gi) || []).length;
  if (linkCount > 500) {
    return null; // Too many links — definitely a list or nav page
  }

  const parsers: ProfileParsers = {
    nameZh: parserOverrides?.nameZh || DEFAULT_PARSERS.nameZh,
    nameEn: parserOverrides?.nameEn || DEFAULT_PARSERS.nameEn,
    title: parserOverrides?.title || DEFAULT_PARSERS.title,
    department: parserOverrides?.department || DEFAULT_PARSERS.department,
    email: parserOverrides?.email || DEFAULT_PARSERS.email,
    bio: parserOverrides?.bio || DEFAULT_PARSERS.bio,
    publications: parserOverrides?.publications || DEFAULT_PARSERS.publications,
    researchTopics:
      parserOverrides?.researchTopics || DEFAULT_PARSERS.researchTopics,
    competitions:
      parserOverrides?.competitions || DEFAULT_PARSERS.competitions,
    evaluations:
      parserOverrides?.evaluations || DEFAULT_PARSERS.evaluations,
  };

  // Lookup university config (needed for title-based department extraction)
  const uni = UNIVERSITY_CONFIGS.find((u) => u.key === universityKey);

  // Name — required, skip if not found
  let nameZh = extractWith(text, parsers.nameZh);
  if (!nameZh || nameZh.length < 2) return null;

  // Clean common title prefixes/suffixes from extracted names
  // e.g. "副主任苏统华" → "苏统华", "张三教授" → "张三"
  const NAME_PREFIXES = [
    '副主任', '主任', '副院长', '院长', '系主任', '副系主任',
    '党委书记', '党委副书记', '团委书记', '支部书记',
    '所长', '副所长', '处长', '副处长', '秘书长',
  ];
  for (const prefix of NAME_PREFIXES) {
    if (nameZh.startsWith(prefix) && nameZh.length > prefix.length + 1) {
      nameZh = nameZh.slice(prefix.length);
      break;
    }
  }
  // Strip title suffixes
  nameZh = nameZh.replace(/(?:教授|副教授|讲师|研究员|副研究员|高级工程师|工程师|助理教授|博士后)$/, '');

  // Re-validate after cleaning
  if (!nameZh || nameZh.length < 2) return null;

  // BLACKLIST: reject navigation/organizational text extracted as names
  const NAME_BLACKLIST = new Set([
    // Original list
    '党政领导', '组织机构', '师资队伍', '杰出人才', '师资名单',
    '按职称检索', '团队现拥有', '学院概况', '学院简介', '历史沿革',
    '人才培养', '科学研究', '学生工作', '党建思政', '对外交流',
    '校友中心', '校友会', '新闻中心', '通知公告', '招生信息',
    '就业信息', '下载中心', '联系方式', '网站地图', '首页',
    '上一页', '下一页', '尾页', '末页', '更多', '查看详情',
    '在职教师', '退休教师', '兼职教授', '客座教授', '访问学者',
    '博士生导师', '硕士生导师', '教职工名录', '教师名录',
    '计算机科学系', '计算机工程系', '人工智能系', '软件工程系',
    '数据科学与工程系', '网络空间安全系', '信息安全系',
    '教授', '副教授', '讲师', '助理教授', '研究员', '副研究员',
    'English', 'ENGLISH', '旧版', '院长信箱', '书记信箱',
    // Newly discovered junk names from database cleanup
    '人才招聘', '国际交流', '党建动态', '规章制度', '邮箱',
    '校友之家', '教育教学', '党群工作', '专题新闻', '学院首页',
    '获奖公告', '动态公告', '活动新闻', '学工通知', '服务链接',
    '学校首页', '热点链接', '学院通知', '栏目导航', '教务通知',
    '公告公示', '常用下载', '新闻动态', '工会新闻', '文档下载',
    '网站首页', '校友注册', '新闻公告', '下载专区', '科研通知',
    '采购公告', '师大新闻', '友情链接', '新闻合集', '相关链接',
    '焦点新闻', '其他通知', '下载区', '院内公告', '登录',
    // Additional junk from second pass
    '合作交流', '合作项目', '校友之窗', '校友天地', '校友专栏',
    '校友风采', '校友动态', '校友活动', '校友信息', '校友录',
    '校友捐赠', '校友名册', '校友工作', '校友会介绍', '校友会章程',
    '知名校友', '杰出校友', '服务校友', '信电校友', '校友服务',
    '交流会', '交流与合作', '交流活动', '对外合作', '国际合作',
    '国内合作', '校企合作', '产学研合作', '项目合作',
    '党建园地', '党建平台', '党建创优', '党建思政', '党建工作',
    '学生党建', '党群之窗', '党群动态', '党群建设',
    '工会组织', '工会教代会', '工会之家', '工会风采', '工会活动',
    '工会资料', '工会动态', '团学组织', '团学工作', '班团活动',
    '本科生教育', '研究生教育', '留学生教育', '本科生院', '研究生院',
    '本科教学', '研究生教学', '教学名师', '教学成果', '教学计划',
    '教学日历', '教学平台', '教学基地', '教学信息', '教学资源',
    '实验教学', '实践教学', '教务教学', '劳动教育', '教育培养',
    '培养方案', '培养计划', '学生培养', '主题教育', '学习教育',
    '本科生招生', '博士招生', '硕士招生', '研究生招生', '留学生招生',
    '留学生项目', '博士研究生', '硕士研究生', '招生工作', '招生资讯',
    '人才梯队', '人才工作', '各类人才', '层次人才', '年人才计',
    '队伍建设', '工作队伍', '工作动态', '教师招聘', '长期招聘',
    '科研动态', '科研合作', '学术交流', '学生活动', '学生动态',
    '活动赛事', '四季活动', '校园动态', '最新动态', '专题聚焦',
    '资料汇编', '规章制度', '制度职责', '组织体系', '组织结构',
    '采购管理', '采购信息', '公共邮箱', '教师邮箱', '学生邮箱',
    '教育基金会', '教育机构', '教育大数据', '教育部', '学习资料',
    '联盟网站', '研究动态', '行业动态', '部门动态', '项目动态',
  ]);
  if (NAME_BLACKLIST.has(nameZh)) return null;

  let nameEn = extractWith(text, parsers.nameEn);
  // Validate English name — reject research topics, institutions, co-author names
  if (nameEn) {
    const enNameLower = nameEn.toLowerCase();
    // Reject known non-name patterns
    const INVALID_NAME_EN_KEYWORDS = [
      'university', 'institute', 'college', 'school', 'department',
      'laboratory', 'lab', 'center', 'centre', 'academy', 'society',
      'foundation', 'corporation', 'limited', 'ltd', 'inc',
      'journal', 'conference', 'symposium', 'transaction', 'bulletin',
      'science', 'technology', 'engineering', 'research',
      'computational', 'computation', 'informatics', 'computing',
      'intelligence', 'learning', 'evolutionary', 'affine',
      'platform', 'information', 'applied', 'data',
      // Additional non-name keywords
      'workshop', 'manipulation', 'detection', 'recognition',
      'analysis', 'system', 'method', 'approach', 'network',
      'model', 'algorithm', 'framework', 'design', 'implementation',
      'application', 'development', 'processing', 'generation',
      'optimization', 'simulation', 'evaluation', 'prediction',
      'classification', 'segmentation', 'extraction', 'synthesis',
      'monitoring', 'management', 'security', 'control', 'automation',
      // Avoid names that are clearly research area names
      'machine', 'deep', 'neural', 'reinforcement', 'supervised',
      'unsupervised', 'natural language', 'computer vision',
    ];
    // Also reject names with more than 4 words (very unlikely for a person)
    const wordCount = enNameLower.split(/\s+/).length;
    if (wordCount > 4) nameEn = null;
    const isInvalidName = INVALID_NAME_EN_KEYWORDS.some(
      (kw) => enNameLower.includes(kw),
    );
    if (isInvalidName) {
      // Only keep English names that appear to be actual people
      nameEn = null;
    }
  }
  const title = extractWith(text, parsers.title);
  let department = extractWith(text, parsers.department);
  // Fallback: try to extract department from <title> tag
  if (!department) {
    department = extractDepartmentFromTitle(html, uni?.nameZh);
  }

  // Email — may be obfuscated
  let email: string | null = null;
  for (const re of parsers.email) {
    const m = text.match(re);
    if (m) {
      const normalized = normalizeEmail(m[0]);
      if (normalized) {
        email = normalized;
        break;
      }
    }
  }

  // ── Phase 3: English name fallback chain ──
  // If nameEn is still null, try extracting from email, URL, image alt, or meta tags
  if (!nameEn && email) {
    nameEn = extractNameFromEmail(email);
    if (nameEn) console.log(`[CN-Uni] nameEn from email: "${nameEn}"`);
  }
  if (!nameEn) {
    nameEn = extractNameFromUrl(sourceUrl);
    if (nameEn) console.log(`[CN-Uni] nameEn from URL: "${nameEn}"`);
  }
  if (!nameEn) {
    // Image alt text extraction
    const imgAltMatch = html.match(/<img[^>]*alt="([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})"[^>]*>/);
    if (imgAltMatch && /^[A-Z][a-z]+ [A-Z][a-z]+/.test(imgAltMatch[1])) {
      nameEn = imgAltMatch[1].trim();
      if (nameEn) console.log(`[CN-Uni] nameEn from image alt: "${nameEn}"`);
    }
  }
  if (!nameEn) {
    // Meta tag extraction (og:title, description)
    const metaOgTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"[^>]*>/i);
    const metaDesc = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"[^>]*>/i);
    const metaContent = metaOgTitle?.[1] || metaDesc?.[1] || '';
    const metaNameMatch = metaContent.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/);
    if (metaNameMatch && !/(?:University|College|School|Institute|Department)/i.test(metaNameMatch[1])) {
      nameEn = metaNameMatch[1].trim();
      if (nameEn) console.log(`[CN-Uni] nameEn from meta tag: "${nameEn}"`);
    }
  }
  // Pinyin generation as last resort
  if (!nameEn && nameZh && nameZh.length >= 2 && nameZh.length <= 4) {
    nameEn = generatePinyinFromChinese(nameZh);
    if (nameEn) console.log(`[CN-Uni] nameEn from pinyin generation: "${nameEn}"`);
  }

  // Bio — try labeled patterns first
  let bio = extractWith(text, parsers.bio)?.slice(0, 1000) || null;

  // Validate bio: reject navigation menu text extracted as bios
  if (bio) {
    const GARBAGE_BIO_PATTERNS = [
      '竞价公示', '学院概况', '学院简介 学院介绍', '导航痕迹',
      '党政领导', '行政办公', '党建工会', '师资队伍 专任教师',
      '师资队伍 全体教师', '组织机构 历任领导',
    ];
    const isGarbageBio = GARBAGE_BIO_PATTERNS.some(p => bio!.startsWith(p)) ||
      /^[一-鿿]{2,6}\s[一-鿿]{2,6}\s[一-鿿]{2,6}\s[一-鿿]{2,6}\s[一-鿿]{2,6}\s[一-鿿]{2,6}\s[一-鿿]{2,6}\s[一-鿿]{2,6}\s[一-鿿]{2,6}\s[一-鿿]{2,6}/.test(bio.substring(0, 60));
    if (isGarbageBio) {
      bio = null; // Reject — this is navigation menu text
    }
  }

  // Fallback: try 研究方向 / 研究领域 section (common bio substitute)
  if (!bio) {
    const researchBio = extractWith(text, [
      /研究方向[：:]\s*([\s\S]{20,1200}?)(?:教育背景|工作经历|联系方式|招生|所属机构|学院教师|学术论文|科研课题)/,
      /研究领域[：:]\s*([\s\S]{20,1200}?)(?:教育背景|工作经历|联系方式|招生|研究方向|论文)/,
    ]);
    if (researchBio) {
      const rBio = researchBio.slice(0, 1000);
      // Validate research bio too
      if (!rBio.startsWith('学院概况') && !rBio.startsWith('竞价公示')) {
        bio = rBio;
      }
    }
  }

  // Fallback: try to find a substantial text block (100+ chars) after the name that looks like a bio
  if (!bio) {
    const nameIdx = text.indexOf(nameZh);
    if (nameIdx >= 0) {
      const afterName = text.substring(nameIdx + nameZh.length);
      // Look for a paragraph-length block (80-800 chars) with mostly Chinese characters
      const blockMatch = afterName.match(/([一-鿿\w\s，。、；：""''！？（）—…·]{80,800})/);
      if (blockMatch) {
        const block = blockMatch[1].trim();
        // Reject navigation menus and non-bio content
        const isNavigation = /首页|登录|English|旧版|网站地图|院长信箱|学院概况|学院简介|导航痕迹|竞价公示/.test(block.substring(0, 120));
        const chineseRatio = (block.match(/[一-鿿]/g) || []).length / block.length;
        if (!isNavigation && chineseRatio > 0.3 && block.length >= 50) {
          bio = block.slice(0, 1000);
        }
      }
    }
  }

  // Breadcrumb department extraction (fallback before other methods)
  if (!department) {
    department = extractDepartmentFromBreadcrumb(html);
  }

  // URL path department inference (last resort)
  if (!department) {
    department = inferDepartmentFromUrl(sourceUrl);
  }

  // Content-based department fallback: scan page text for common Chinese college names
  if (!department) {
    const DEPT_CONTENT_PATTERN = /([一-鿿]{2,4})(?:学院|系|研究所|研究院|中心|实验室|教研室|学部|教学部|实验中心|研发中心|工程中心)/g;
    let deptMatch;
    const seenDepts = new Set<string>();
    while ((deptMatch = DEPT_CONTENT_PATTERN.exec(text)) !== null) {
      const fullDept = deptMatch[0];
      const prefix = deptMatch[1];
      // Skip generic/navigation prefixes
      if (/^(?:首页|新闻|通知|公告|下载|招生|就业|联系|组织|人才|校友|党建|工会|研究|教育|教学|培养|合作|交流|信息|数据|网络)$/.test(prefix)) continue;
      // Skip if it looks like a nav item
      if (NAME_BLACKLIST.has(fullDept)) continue;
      if (!seenDepts.has(fullDept)) {
        seenDepts.add(fullDept);
      }
    }
    // Prefer the first match that's not too generic
    const depts = Array.from(seenDepts);
    if (depts.length === 1) {
      department = depts[0];
    } else if (depts.length >= 2) {
      // Pick the one that looks most like an academic department (not admin)
      const academicDept = depts.find(d =>
        /(?:学院|系|研究所|研究院|实验室|中心)$/.test(d) &&
        !/(?:首页|通知|公告|新闻|下载|招生|就业|联系)/.test(d),
      );
      if (academicDept) department = academicDept;
    }
  }

  // Section-based fallback extraction (preserve heading structure)
  const sections = extractSectionsFromHtml(html);

  // Publications — try JSON-LD first, then regex patterns, then section-based fallback
  const publications: ScrapedPublication[] = [];

  // Strategy 0: JSON-LD structured data (Schema.org ScholarlyArticle)
  try {
    const jsonLdPubs = extractPublicationsFromJsonLd(html);
    if (jsonLdPubs.length > 0) {
      publications.push(...jsonLdPubs);
      console.log(`[CN-Uni] Extracted ${jsonLdPubs.length} publications from JSON-LD for ${sourceUrl}`);
    }
  } catch {
    // Non-critical — fall through to regex extraction
  }

  // Strategy 1: Regex patterns
  const pubText = extractWith(text, parsers.publications);
  if (pubText) {
    const pubLines = pubText.split(
      /(?:\n|;(?=\s*(?:\d+[\.\、\]\)]|\[?\d+\]?)))/,
    );
    for (const line of pubLines.slice(0, 50)) {
      const trimmed = line.replace(/^\s*\[?\d+\]?[\.\、\s\)]*/, '').trim();
      if (trimmed.length > 10 && isValidPublicationLine(trimmed)) {
        const meta = extractPublicationMetadata(trimmed);
        publications.push({
          title: meta.title.slice(0, 300),
          authors: meta.authors,
          journal: meta.journal,
          year: meta.year,
          doi: meta.doi,
          url: null,
          citationCount: null,
          abstract: null,
          publishedAt: meta.year ? `${meta.year}-01-01` : null,
        });
      }
    }
  }

  // Fallback: section-based publication extraction
  if (publications.length === 0) {
    const pubSectionContent = findSectionContent(sections, /论文|发表|著作|期刊|代表性论著|学术成果/);
    if (pubSectionContent) {
      const lines = pubSectionContent.split(/[\n;；]/);
      for (const line of lines.slice(0, 50)) {
        const trimmed = line.replace(/^\s*\[?\d+\]?[\.\、\s\)]*/, '').trim();
        if (trimmed.length > 10 && isValidPublicationLine(trimmed)) {
          const meta = extractPublicationMetadata(trimmed);
          publications.push({
            title: meta.title.slice(0, 300),
            authors: meta.authors,
            journal: meta.journal,
            year: meta.year,
            doi: meta.doi,
            url: null,
            citationCount: null,
            abstract: null,
            publishedAt: meta.year ? `${meta.year}-01-01` : null,
          });
        }
      }
    }
  }

  // Research topics — try regex first, then section-based
  const researchUpdates: ScrapedResearchUpdate[] = [];
  const researchText = extractWith(text, parsers.researchTopics);
  if (researchText) {
    const topics = researchText
      .split(/[,，;；、\n]/)
      .filter((t) => t.trim().length > 2);
    for (const topic of topics.slice(0, 15)) {
      researchUpdates.push({
        title: topic.trim().slice(0, 200),
        description: null,
        url: null,
        source: 'cn-university',
        publishedAt: null,
      });
    }
  }

  // Fallback: section-based research topic extraction
  if (researchUpdates.length === 0) {
    const researchSectionContent = findSectionContent(sections, /研究[方向领域]|科研项目|在研|研究兴趣/);
    if (researchSectionContent) {
      const items = researchSectionContent.split(/[,，;；、\n]/).filter(t => t.trim().length > 2);
      for (const item of items.slice(0, 15)) {
        researchUpdates.push({
          title: item.trim().slice(0, 200),
          description: null,
          url: null,
          source: 'cn-university',
          publishedAt: null,
        });
      }
    }
  }

  // Competition updates — try regex first, then section-based
  const competitionUpdates: ScrapedCompetitionUpdate[] = [];
  const compText = extractWith(text, parsers.competitions);
  if (compText) {
    const compItems = compText.split(/[\n;；]/).filter((t) => t.trim().length > 5);
    for (const item of compItems.slice(0, 10)) {
      const trimmed = item
        .replace(/^\s*[\[\(]?\d+[\]\)]?[\.\、\s]*/, '')
        .trim();
      if (trimmed.length > 5) {
        const { level, award } = extractCompLevelAndAward(trimmed);
        competitionUpdates.push({
          title: trimmed.slice(0, 300),
          description: null,
          url: null,
          source: 'cn-university',
          level,
          award,
          publishedAt: null,
        });
      }
    }
  }

  // Fallback: section-based competition extraction
  if (competitionUpdates.length === 0) {
    const compSectionContent = findSectionContent(sections, /竞赛|大赛|比赛|科创/);
    if (compSectionContent) {
      const items = compSectionContent.split(/[\n;；]/).filter(t => t.trim().length > 5);
      for (const item of items.slice(0, 10)) {
        const trimmed = item.replace(/^\s*[\[\(]?\d+[\]\)]?[\.\、\s]*/, '').trim();
        if (trimmed.length > 5) {
          const { level, award } = extractCompLevelAndAward(trimmed);
          competitionUpdates.push({
            title: trimmed.slice(0, 300),
            description: null,
            url: null,
            source: 'cn-university',
            level,
            award,
            publishedAt: null,
          });
        }
      }
    }
  }

  // Fallback 2: NLP paragraph-based extraction for competitions embedded in free text
  if (competitionUpdates.length === 0) {
    const nlpCompetitions = extractCompetitionsFromParagraphs(text);
    competitionUpdates.push(...nlpCompetitions.slice(0, 10));
    if (nlpCompetitions.length > 0) {
      console.log(`[CN-Uni] NLP fallback: extracted ${nlpCompetitions.length} competitions from paragraphs`);
    }
  }

  // Evaluation updates — try regex first, then section-based
  const evaluationUpdates: ScrapedEvaluationUpdate[] = [];
  const evalText = extractWith(text, parsers.evaluations);
  if (evalText) {
    const evalItems = evalText.split(/[\n;；]/).filter((t) => t.trim().length > 5);
    for (const item of evalItems.slice(0, 10)) {
      const trimmed = item
        .replace(/^\s*[\[\(]?\d+[\]\)]?[\.\、\s]*/, '')
        .trim();
      if (trimmed.length > 5) {
        const { evalType, result } = extractEvalTypeAndResult(trimmed);
        evaluationUpdates.push({
          title: trimmed.slice(0, 300),
          description: null,
          url: null,
          source: 'cn-university',
          evalType,
          result,
          publishedAt: null,
        });
      }
    }
  }

  // Fallback: section-based evaluation extraction
  if (evaluationUpdates.length === 0) {
    const evalSectionContent = findSectionContent(sections, /评比|获奖|荣誉|人才称号|奖励/);
    if (evalSectionContent) {
      const items = evalSectionContent.split(/[\n;；]/).filter(t => t.trim().length > 5);
      for (const item of items.slice(0, 10)) {
        const trimmed = item.replace(/^\s*[\[\(]?\d+[\]\)]?[\.\、\s]*/, '').trim();
        if (trimmed.length > 5) {
          const { evalType, result } = extractEvalTypeAndResult(trimmed);
          evaluationUpdates.push({
            title: trimmed.slice(0, 300),
            description: null,
            url: null,
            source: 'cn-university',
            evalType,
            result,
            publishedAt: null,
          });
        }
      }
    }
  }

  return {
    nameZh,
    nameEn,
    title,
    institution: uni?.nameZh || null,
    department,
    email,
    bio,
    publications,
    researchUpdates,
    competitionUpdates,
    evaluationUpdates,
    sourceUrl,
    website: sourceUrl,
    source: 'CN_UNIVERSITY',
    sourceId: sourceUrl,
    alternativeNames: [],
    hIndex: null,
    citationCount: null,
    publicationCount: publications.length || null,
    fields: inferFields({
      researchText: researchUpdates.map(u => u.title).join('; '),
      department,
      bio,
      publications: publications.map(p => ({ title: p.title })),
    }),
    avatarUrl: null,
    rawMetadata: { universityKey, sourceUrl },
  };
}

// ─── Rate Limiting ───

async function rateLimitUniversity(key: string, minDelayMs = 2500): Promise<void> {
  await getBucket(key, { capacity: 5, refillRate: 1, refillIntervalMs: minDelayMs }).acquire();
}

// ─── Public API ───

/**
 * Scrape a single Chinese university — crawl faculty list pages, discover
 * profile links, and parse each profile into ScrapedPerson records.
 *
 * @param universityKey  Config key (e.g. "tsinghua", "pku")
 * @param maxProfiles    Maximum profiles to return (safety cap)
 * @returns Array of successfully parsed ScrapedPerson records
 */
export async function scrapeUniversity(
  universityKey: string,
  maxProfiles = 100,
): Promise<{ profiles: ScrapedPerson[]; stats: UniversityScrapeStats }> {
  const startTime = Date.now();
  const uni = UNIVERSITY_CONFIGS.find((u) => u.key === universityKey);
  if (!uni) {
    console.warn(`[CN-Uni] Unknown university: ${universityKey}`);
    return { profiles: [], stats: emptyStats(universityKey, 'Unknown') };
  }

  const stats: UniversityScrapeStats = {
    key: universityKey,
    nameZh: uni.nameZh,
    listUrlsAttempted: 0,
    listUrlsSucceeded: 0,
    profileLinksDiscovered: 0,
    profilesAttempted: 0,
    profilesParsed: 0,
    profilesFailed: 0,
    errorsByType: {},
    durationMs: 0,
  };

  console.log(
    `[CN-Uni] Scraping ${uni.nameZh} (${uni.nameEn}) — ${uni.facultyLists.length} faculty lists`,
  );

  const allProfiles: ScrapedPerson[] = [];
  const seenUrls = new Set<string>();

  for (const listConfig of uni.facultyLists) {
    if (allProfiles.length >= maxProfiles) break;

    // Fetch faculty list page
    stats.listUrlsAttempted++;
    const html = await fetchWithEncoding(
      listConfig.url,
      listConfig.encoding || uni.encoding,
    );
    if (!html) {
      console.warn(
        `[CN-Uni] Failed to fetch faculty list: ${listConfig.url}`,
      );
      continue;
    }
    stats.listUrlsSucceeded++;

    // Discover profile links
    const links = discoverProfileLinks(
      html,
      listConfig.url,
      listConfig.linkPatterns,
    );
    stats.profileLinksDiscovered += links.length;
    console.log(
      `[CN-Uni] Found ${links.length} profile links on ${listConfig.url}`,
    );

    // Handle pagination — try to get more pages
    const maxPages = listConfig.maxPages || 1;
    for (let page = 2; page <= maxPages; page++) {
      // Common pagination URL patterns
      const pageUrls: string[] = [];
      const baseUrl = listConfig.url;
      // Pattern: list.htm → list/page.htm, list.jsp?page=2
      if (baseUrl.includes('.htm')) {
        const base = baseUrl.replace(/\.html?$/, '');
        pageUrls.push(`${base}/page/${page}.htm`);
        pageUrls.push(`${base}_${page}.htm`);
        pageUrls.push(
          baseUrl.replace(/\.html?$/, `?page=${page}`),
        );
      }
      if (baseUrl.includes('list.htm')) {
        pageUrls.push(baseUrl.replace('list.htm', `list_${page}.htm`));
      }
      if (baseUrl.includes('js.htm')) {
        pageUrls.push(baseUrl.replace('js.htm', `js_${page}.htm`));
      }
      if (baseUrl.includes('fjs.htm')) {
        pageUrls.push(baseUrl.replace('fjs.htm', `fjs_${page}.htm`));
      }
      // Pattern: /col/colXXXXX/list.htm → list_page.htm
      if (baseUrl.includes('/col/')) {
        pageUrls.push(baseUrl.replace(/list\.html?$/, `list_${page}.htm`));
        pageUrls.push(baseUrl.replace(/list\.html?$/, `list_${page}.html`));
        pageUrls.push(baseUrl.replace(/list\.html?$/, `list.htm?page=${page}`));
      }
      // Pattern with query string: ?page=1 → ?page=N
      if (baseUrl.includes('?') && !baseUrl.includes('?page=')) {
        pageUrls.push(`${baseUrl}&page=${page}`);
      }
      // Pattern with /page/ in URL (already has page parameter)
      if (baseUrl.match(/\/(\d+)$/)) {
        pageUrls.push(baseUrl.replace(/\/\d+$/, `/${page}`));
      }
      // Pattern: jzgml.htm → jzgml_N.htm (Tsinghua-style)
      if (/[a-z]+\.html?$/.test(baseUrl)) {
        pageUrls.push(baseUrl.replace(/([a-z]+)\.(html?)$/, `$1_${page}.$2`));
      }

      let foundPageLinks = false;
      for (const pageUrl of pageUrls) {
        stats.listUrlsAttempted++;
        await rateLimitUniversity(universityKey);
        const pageHtml = await fetchWithEncoding(
          pageUrl,
          listConfig.encoding || uni.encoding,
        );
        if (pageHtml) {
          stats.listUrlsSucceeded++;
          const pageLinks = discoverProfileLinks(
            pageHtml,
            pageUrl,
            listConfig.linkPatterns,
          );
          if (pageLinks.length > 0) {
            links.push(...pageLinks);
            foundPageLinks = true;
            stats.profileLinksDiscovered += pageLinks.length;
            console.log(
              `[CN-Uni] Page ${page}: ${pageLinks.length} more links`,
            );
            break;
          }
        }
      }
      if (!foundPageLinks) break; // No more pages
    }

    // Fetch and parse each profile with configurable concurrency.
    // Previously sequential — now uses a worker pool for 3-5x throughput.
    const CONCURRENT_PROFILES = 5;
    const profileQueue = links
      .filter((url) => !seenUrls.has(url))
      .slice(0, maxProfiles - allProfiles.length);
    const failedUrls: string[] = [];

    // Mark all queued URLs as seen upfront to prevent duplicate work
    for (const url of profileQueue) seenUrls.add(url);

    let completedCount = 0;
    const univ = uni; // Stable reference for TS narrowing in async closures
    async function fetchOneProfile(profileUrl: string): Promise<void> {
      await rateLimitUniversity(universityKey);
      stats.profilesAttempted++;

      const profileHtml = await fetchWithEncoding(profileUrl, univ.encoding);
      if (!profileHtml) {
        stats.profilesFailed++;
        failedUrls.push(profileUrl);
        completedCount++;
        return;
      }

      const parsed = parseProfileHtml(
        profileHtml,
        profileUrl,
        universityKey,
        univ.parserOverrides,
      );
      if (parsed && parsed.nameZh) {
        stats.profilesParsed++;
        metrics.recordProfileResult(universityKey, true);
        allProfiles.push({
          sourceId: profileUrl,
          source: 'CN_UNIVERSITY',
          sourceUrl: profileUrl,
          nameZh: parsed.nameZh,
          nameEn: parsed.nameEn || null,
          alternativeNames: parsed.alternativeNames || [],
          title: parsed.title || null,
          institution: parsed.institution || univ.nameZh,
          department: parsed.department || null,
          email: parsed.email || null,
          website: parsed.website || profileUrl,
          avatarUrl: parsed.avatarUrl || null,
          bio: parsed.bio || null,
          hIndex: null,
          citationCount: null,
          publicationCount: parsed.publicationCount || null,
          fields: parsed.fields || [],
          publications: parsed.publications || [],
          researchUpdates: parsed.researchUpdates || [],
          competitionUpdates: parsed.competitionUpdates || [],
          evaluationUpdates: parsed.evaluationUpdates || [],
          rawMetadata: { universityKey, sourceUrl: profileUrl, listUrl: listConfig.url },
        });
        console.log(
          `[CN-Uni] Parsed: ${parsed.nameZh} (${allProfiles.length}/${maxProfiles})`,
        );
      } else {
        stats.profilesFailed++;
        failedUrls.push(profileUrl);
        metrics.recordProfileResult(universityKey, false);
      }
      completedCount++;
    }

    // Worker pool: process profileQueue with CONCURRENT_PROFILES workers
    async function worker() {
      while (profileQueue.length > 0 && allProfiles.length < maxProfiles) {
        const url = profileQueue.shift()!;
        await fetchOneProfile(url);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENT_PROFILES, profileQueue.length) }, () => worker()),
    );

    // Retry failed URLs once (transient network errors often resolve on retry)
    if (failedUrls.length > 0 && allProfiles.length < maxProfiles) {
      console.log(
        `[CN-Uni] Retrying ${failedUrls.length} failed profile URLs...`,
      );
      const retryQueue = failedUrls.slice(0, maxProfiles - allProfiles.length);
      let retriedOk = 0;
      async function retryWorker() {
        while (retryQueue.length > 0 && allProfiles.length < maxProfiles) {
          const url = retryQueue.shift()!;
          await rateLimitUniversity(universityKey);
          const html = await fetchWithEncoding(url, univ.encoding);
          if (html) {
            const parsed = parseProfileHtml(html, url, universityKey, univ.parserOverrides);
            if (parsed && parsed.nameZh) {
              stats.profilesParsed++;
              stats.profilesFailed--; // Correct the earlier failure count
              retriedOk++;
              allProfiles.push({
                sourceId: url,
                source: 'CN_UNIVERSITY',
                sourceUrl: url,
                nameZh: parsed.nameZh,
                nameEn: parsed.nameEn || null,
                alternativeNames: parsed.alternativeNames || [],
                title: parsed.title || null,
                institution: parsed.institution || univ.nameZh,
                department: parsed.department || null,
                email: parsed.email || null,
                website: parsed.website || url,
                avatarUrl: parsed.avatarUrl || null,
                bio: parsed.bio || null,
                hIndex: null,
                citationCount: null,
                publicationCount: parsed.publicationCount || null,
                fields: parsed.fields || [],
                publications: parsed.publications || [],
                researchUpdates: parsed.researchUpdates || [],
                competitionUpdates: parsed.competitionUpdates || [],
                evaluationUpdates: parsed.evaluationUpdates || [],
                rawMetadata: { universityKey, sourceUrl: url, listUrl: listConfig.url },
              });
            }
          }
          completedCount++;
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(2, retryQueue.length) }, () => retryWorker()),
      );
      if (retriedOk > 0) {
        console.log(`[CN-Uni] Retry recovered ${retriedOk} profiles`);
      }
    }
  }

  stats.durationMs = Date.now() - startTime;
  console.log(
    `[CN-Uni] Done: ${uni.nameZh} — ${stats.profilesParsed} parsed, ${stats.profilesFailed} failed, ${stats.profileLinksDiscovered} links found (${stats.durationMs}ms)`,
  );
  return { profiles: allProfiles, stats };
}

function emptyStats(key: string, nameZh: string): UniversityScrapeStats {
  return { key, nameZh, listUrlsAttempted: 0, listUrlsSucceeded: 0, profileLinksDiscovered: 0, profilesAttempted: 0, profilesParsed: 0, profilesFailed: 0, errorsByType: {}, durationMs: 0 };
}

/**
 * Scrape multiple universities with configurable parallelism.
 * Default: 3 universities concurrently (balances throughput vs server load).
 * Returns combined results from all successfully scraped universities.
 */
export async function scrapeUniversities(
  universityKeys: string[],
  maxProfilesPerUniversity = 100,
  options?: { concurrentUniversities?: number },
): Promise<{ profiles: ScrapedPerson[]; stats: UniversityScrapeStats[] }> {
  // Reset per-run state
  clearRequestDedup();
  metrics.reset();
  responseCache.clear();

  const concurrency = Math.min(
    options?.concurrentUniversities || 3,
    universityKeys.length,
  );
  const allStats: UniversityScrapeStats[] = [];
  const queue = [...universityKeys];

  console.log(
    `[CN-Uni] Scraping ${universityKeys.length} universities with ${concurrency} concurrent workers...`,
  );

  async function scrapeOneUniversity(key: string): Promise<ScrapedPerson[]> {
    try {
      const { profiles, stats } = await scrapeUniversity(key, maxProfilesPerUniversity);

      // Fallback: if HTTP scraper got 0 profiles, try Playwright for JS-rendered pages
      if (profiles.length === 0 && stats.listUrlsAttempted > 0) {
        console.log(`[CN-Uni] HTTP scraper got 0 profiles for ${key}, trying Playwright fallback...`);
        const pwResult = await fallbackToPlaywright(key, maxProfilesPerUniversity);
        if (pwResult) {
          allStats.push(pwResult.stats);
          return pwResult.profiles;
        }
      }
      allStats.push(stats);
      return profiles;
    } catch (err) {
      console.error(
        `[CN-Uni] Failed to scrape ${key}: ${err instanceof Error ? err.message : err}`,
      );
      // Try Playwright as last resort if HTTP scraper threw
      try {
        console.log(`[CN-Uni] Attempting Playwright fallback after HTTP error for ${key}...`);
        const pwResult = await fallbackToPlaywright(key, maxProfilesPerUniversity);
        if (pwResult) {
          allStats.push(pwResult.stats);
          return pwResult.profiles;
        }
      } catch {
        // Both HTTP and Playwright failed — record fatal error
      }
      allStats.push({
        key,
        nameZh: key,
        listUrlsAttempted: 0,
        listUrlsSucceeded: 0,
        profileLinksDiscovered: 0,
        profilesAttempted: 0,
        profilesParsed: 0,
        profilesFailed: 0,
        errorsByType: { 'FATAL': 1 },
        durationMs: 0,
      });
      return [];
    }
  }

  // Worker pool for parallel university scraping
  const allResults: ScrapedPerson[] = [];
  async function worker() {
    while (queue.length > 0) {
      const key = queue.shift()!;
      const profiles = await scrapeOneUniversity(key);
      allResults.push(...profiles);
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );

  return { profiles: allResults, stats: allStats };
}

/**
 * Playwright fallback for JS-rendered university pages.
 * Called when the HTTP scraper returns 0 profiles or throws.
 */
async function fallbackToPlaywright(
  universityKey: string,
  maxProfiles: number,
): Promise<{ profiles: ScrapedPerson[]; stats: UniversityScrapeStats } | null> {
  try {
    const { scrapeUniversityWithPlaywright } = await import('./playwright-fallback');
    const uni = UNIVERSITY_CONFIGS.find((u) => u.key === universityKey);
    if (!uni) return null;

    const rawListUrls = uni.facultyLists || [];
    if (rawListUrls.length === 0) return null;

    // Normalize list URLs (may be strings or { url: string } objects)
    const listUrls: string[] = rawListUrls.map((u: unknown) =>
      typeof u === 'string' ? u : (u as { url: string }).url,
    );

    const pwResult = await scrapeUniversityWithPlaywright(
      universityKey,
      listUrls,
      maxProfiles,
    );

    if (pwResult.profiles.length === 0) return null;

    // Convert Playwright results to ScrapedPerson format
    const profiles: ScrapedPerson[] = pwResult.profiles.map((p) => ({
      sourceId: p.website || `${universityKey}-pw`,
      source: 'CN_UNIVERSITY',
      sourceUrl: p.website || null,
      nameZh: p.nameZh,
      nameEn: p.nameEn || null,
      alternativeNames: [],
      title: p.title || null,
      department: p.department || null,
      email: p.email || null,
      bio: p.bio || null,
      institution: p.institution || universityKey,
      website: p.website || null,
      avatarUrl: null,
      hIndex: null,
      citationCount: null,
      publicationCount: null,
      fields: [],
      publications: [],
      researchUpdates: [],
      competitionUpdates: [],
      evaluationUpdates: [],
      rawMetadata: {
        universityKey,
        sourceUrl: p.website,
        scrapedVia: 'playwright-fallback',
      },
    }));

    const stats: UniversityScrapeStats = {
      key: universityKey,
      nameZh: uni.nameZh,
      listUrlsAttempted: pwResult.stats.listUrlsAttempted,
      listUrlsSucceeded: pwResult.stats.listUrlsSucceeded,
      profileLinksDiscovered: pwResult.stats.profileLinksDiscovered,
      profilesAttempted: pwResult.stats.profilesParsed + pwResult.stats.profilesFailed,
      profilesParsed: pwResult.stats.profilesParsed,
      profilesFailed: pwResult.stats.profilesFailed,
      errorsByType: pwResult.stats.errors.length > 0 ? { 'PARSE_ERROR': pwResult.stats.errors.length } : {},
      durationMs: pwResult.stats.durationMs,
    };

    console.log(
      `[CN-Uni] Playwright fallback for ${universityKey}: ${pwResult.stats.profilesParsed} profiles`,
    );
    return { profiles, stats };
  } catch (err) {
    console.error(
      `[CN-Uni] Playwright fallback failed for ${universityKey}: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

/**
 * Fetch and parse a specific profile page (used for manual refresh).
 */
export async function fetchAndParseProfile(
  profileUrl: string,
  universityKey: string,
): Promise<Partial<ScrapedPerson> | null> {
  const uni = UNIVERSITY_CONFIGS.find((u) => u.key === universityKey);
  if (!uni) return null;

  const html = await fetchWithEncoding(profileUrl, uni.encoding);
  if (!html) return null;

  return parseProfileHtml(
    html,
    profileUrl,
    universityKey,
    uni.parserOverrides,
  );
}

/**
 * Get the list of supported universities.
 */
export function getSupportedUniversities(): Array<{
  key: string;
  nameZh: string;
  nameEn: string;
}> {
  return UNIVERSITY_CONFIGS.map((u) => ({
    key: u.key,
    nameZh: u.nameZh,
    nameEn: u.nameEn,
  }));
}

/**
 * Get full config for a university.
 */
export function getUniversityConfig(
  key: string,
): UniversityConfig | undefined {
  return UNIVERSITY_CONFIGS.find((u) => u.key === key);
}

export { UNIVERSITY_CONFIGS };