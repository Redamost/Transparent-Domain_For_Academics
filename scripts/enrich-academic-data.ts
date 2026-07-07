// ─── Academic Data Enrichment ───
// Fills missing: research fields, hIndex, citationCount, publications
//
// Sources:
//   - Research fields: extracted from bioZh + researchUpdates via keyword mapping
//   - Metrics + Papers: OpenAlex API (free, no key required)
//
// Usage: npx tsx scripts/enrich-academic-data.ts [--dry-run] [--limit=N] [--skip-openalex]

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { findScholarOnOpenAlex, getAuthorWorks, openAlexWorkToPublication } from '../src/lib/scraping/openalex';

// ─── Config ───
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_OPENALEX = process.argv.includes('--skip-openalex');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const MAX_PERSONS = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

// ─── Chinese Research Direction → Field Slug Mapping ───
// Maps Chinese research keywords to our Field slugs.
// Pattern: [chineseKeyword] → field-slug (L2 preferred, fallback to L1)
const CHINESE_FIELD_MAP: Array<{ pattern: RegExp; slugs: string[] }> = [
  // ── Computer Science ──
  { pattern: /人工智能|AI\b/i, slugs: ['artificial-intelligence'] },
  { pattern: /机器学习|统计学习|迁移学习|元学习|多任务学习/, slugs: ['machine-learning'] },
  { pattern: /深度学习|深度神经网络|DNN|CNN|RNN|Transformer|transformer/, slugs: ['machine-learning'] },
  { pattern: /自然语言(处理|理解|生成)?|NLP|文本挖掘|文本分析|大语言模型|LLM|大模型|语言模型|语义分析|句法分析/, slugs: ['natural-language-processing'] },
  { pattern: /计算机视觉|图像(处理|识别|分割|生成|复原|增强)?|视觉(问答|理解|跟踪|定位|导航)?|视频(分析|理解|编码|处理)?|目标(检测|跟踪|识别)|人脸(识别|检测|验证)|虹膜识别|OCR|光学字符识别|多媒体(处理|分析)?/, slugs: ['computer-vision'] },
  { pattern: /强化学习|reinforcement learning/i, slugs: ['reinforcement-learning'] },
  { pattern: /计算机网络|网络(安全|协议|通信|体系|架构)|互联网|物联网|IoT|路由|交换|SDN|网络编码|移动网络|无线网络|传感(器)?网络|WSN|Ad.?Hoc|车载网络|VANET|物联网/, slugs: ['computer-networks'] },
  { pattern: /分布式(系统|计算|存储|处理)?|云计算|云平台|边缘计算|雾计算|网格计算|并行(计算|处理|分布)?|高性能计算|HPC|大规模(计算|系统|处理)/, slugs: ['distributed-systems'] },
  { pattern: /操作系统|系统软件|内核|文件系统|虚拟化/, slugs: ['operating-systems'] },
  { pattern: /算法(设计|分析|优化|博弈)|数据结构|计算复杂性|NP完全|近似算法/, slugs: ['algorithms'] },
  { pattern: /计算复杂性|可计算性|自动机|形式化(方法|验证)|程序分析/, slugs: ['computational-complexity'] },
  { pattern: /密码学|信息安全|网络安全|数据安全|隐私保护|加密|认证|访问控制|区块链/, slugs: ['cryptography'] },
  { pattern: /量子计算|量子信息|量子密钥|量子通信|量子算法/, slugs: ['quantum-computing'] },
  { pattern: /知识图谱|知识表示|知识推理|语义网|本体(论)?/, slugs: ['natural-language-processing'] },
  { pattern: /数据挖掘|数据科学|大数据|知识发现|信息检索|推荐系统/, slugs: ['machine-learning'] },
  { pattern: /软件工程|软件测试|软件可靠性|程序分析|软件架构/, slugs: ['artificial-intelligence'] },
  { pattern: /数据库|数据管理|NoSQL|SQL|数据仓库|数据治理/, slugs: ['distributed-systems'] },
  { pattern: /人机交互|HCI|虚拟现实|VR|增强现实|AR|混合现实|MR|用户界面/, slugs: ['computer-vision'] },
  { pattern: /机器人|具身智能|自动驾驶|无人车|无人机|SLAM|运动规划/, slugs: ['computer-vision'] },
  { pattern: /多模态|跨模态|视觉语言|视觉问答|图文匹配/, slugs: ['computer-vision'] },
  { pattern: /模式识别|分类器|聚类|特征提取|降维|特征选择/, slugs: ['machine-learning'] },
  { pattern: /生物信息学|计算生物学|基因组学|蛋白质(组学|结构预测)/, slugs: ['genomics'] },
  { pattern: /医学(影像|图像)分析|计算机辅助诊断|医疗AI|医学人工智能|智慧医疗/, slugs: ['computer-vision'] },
  { pattern: /(物联网|IoT)\b/i, slugs: ['computer-networks'] },
  { pattern: /嵌入式(系统|软件)|实时系统|CPS|信息物理系统/, slugs: ['operating-systems'] },
  { pattern: /编译器|编译优化|程序语言|编程语言理论|PLT/i, slugs: ['algorithms'] },
  { pattern: /可信计算|容错|可靠性|可用性|安全(关键|攸关)/, slugs: ['distributed-systems'] },
  // Additional patterns for broad coverage
  { pattern: /语音(识别|合成|信号处理|对话|编码|增强)|音频(处理|分析|信号)|说话人(识别|验证)|声学/, slugs: ['natural-language-processing'] },
  { pattern: /GIS|地理信息(系统)?|空间(数据|分析|信息|数据库)|时空(数据|分析)|遥感/, slugs: ['machine-learning'] },
  { pattern: /知识库|知识(工程|系统|管理)|智能计算|计算智能|专家系统/, slugs: ['artificial-intelligence'] },
  { pattern: /仿真(建模)?|建模仿真|数字孪生|虚拟样机|系统仿真/, slugs: ['algorithms'] },
  { pattern: /信号处理|数字信号|DSP|阵列信号|统计信号/, slugs: ['machine-learning'] },
  { pattern: /软件工程|软件(测试|可靠性|质量|度量|演化|维护|重构|复用)|DevOps|敏捷开发/, slugs: ['artificial-intelligence'] },
  { pattern: /芯片设计|集成电路|IC设计|VLSI|FPGA|EDA|SoC|半导体/, slugs: ['algorithms'] },

  // ── Biology ──
  { pattern: /分子生物学|基因(表达|调控|编辑)|CRISPR|转录|翻译/, slugs: ['molecular-biology'] },
  { pattern: /基因组学|全基因组|测序|GWAS|单细胞/, slugs: ['genomics'] },
  { pattern: /蛋白质组学|质谱|蛋白(结构|功能|互作)/, slugs: ['proteomics'] },
  { pattern: /基因编辑|基因组编辑|CRISPR/i, slugs: ['gene-editing'] },
  { pattern: /神经科学|神经退行|突触|神经元|脑(科学|功能)|认知神经/, slugs: ['neuroscience'] },
  { pattern: /计算神经|神经计算|神经网络模型/, slugs: ['computational-neuroscience'] },
  { pattern: /认知(科学|心理学)|记忆|注意|感知|语言认知/, slugs: ['cognitive-neuroscience'] },

  // ── Physics ──
  { pattern: /量子物理|量子力学|量子态|量子纠缠|薛定谔|量子场论/, slugs: ['quantum-physics'] },
  { pattern: /凝聚态物理|超导|拓扑绝缘体|量子霍尔|磁性材料/, slugs: ['condensed-matter'] },
  { pattern: /粒子物理|标准模型|希格斯|中微子|暗物质|高能物理/, slugs: ['particle-physics'] },
  { pattern: /高能物理|加速器|对撞机|LHC/i, slugs: ['high-energy-physics'] },
  { pattern: /量子光学|腔量子|光机械|量子电动力学/, slugs: ['quantum-optics'] },

  // ── Medicine ──
  { pattern: /肿瘤学|肿瘤|癌症|癌(变|细胞)|放疗|化疗|靶向治疗/, slugs: ['oncology'] },
  { pattern: /精准(医疗|医学)|个体化治疗|伴随诊断|肿瘤标志物/, slugs: ['precision-oncology'] },
  { pattern: /免疫治疗|免疫检查点|CAR.?T|PD.?1|PD.?L1|肿瘤疫苗/, slugs: ['immunotherapy'] },
  { pattern: /流行病学|公共卫生|疾病(预防|控制|监测)|传染病|慢性病/, slugs: ['epidemiology'] },
  { pattern: /神经外科|脑(外科|肿瘤)|脊柱(手术|外科)|功能神经外科/, slugs: ['neurosurgery'] },
  { pattern: /神经科学|神经系统|神经疾病|帕金森|阿尔茨海默|AD\b/i, slugs: ['neuroscience'] },

  // ── Chemistry ──
  { pattern: /有机化学|有机合成|全合成|不对称(合成|催化)|天然产物/, slugs: ['organic-chemistry'] },
  { pattern: /无机化学|配位化学|金属有机|晶体工程|簇合物/, slugs: ['inorganic-chemistry'] },
  { pattern: /催化(化学)?|光催化|电催化|纳米催化|不对称催化|均相催化/, slugs: ['catalysis'] },
  { pattern: /物理化学|化学热力学|化学动力学|电化学|胶体(化学)?/, slugs: ['physical-chemistry'] },
  { pattern: /合成方法学|合成方法|C.?H活化|偶联反应/, slugs: ['synthetic-methods'] },
  { pattern: /天然产物(化学|分离|结构)|活性天然产物/, slugs: ['natural-products'] },

  // ── Mathematics ──
  { pattern: /代数学|代数几何|群论|环论|域论|李代数|表示论|交换代数/, slugs: ['algebra'] },
  { pattern: /代数几何|概型|层论|簇|模空间|Hodge理论/, slugs: ['algebraic-geometry'] },
  { pattern: /几何学|微分几何|黎曼几何|辛几何|拓扑学|流形/, slugs: ['geometry'] },
  { pattern: /概率(论|统计)|随机过程|随机分析|贝叶斯|蒙特卡罗|MCMC/i, slugs: ['probability'] },
  { pattern: /数论|素数|丢番图|自守形式|L函数|Langlands/i, slugs: ['number-theory'] },

  // ── Economics ──
  { pattern: /宏观经济学|经济(增长|周期|波动)|货币政策|财政政策|GDP/i, slugs: ['macroeconomics'] },
  { pattern: /微观经济学|博弈论|市场(设计|结构)|拍卖理论|产业组织/, slugs: ['microeconomics'] },
  { pattern: /计量经济(学)?|因果推断|工具变量|DID|RDD|面板数据|时间序列/, slugs: ['econometrics'] },

  // ── Cross-cutting ──
  { pattern: /计算机科学|计算机应用/, slugs: ['computer-science'] },
  { pattern: /生物学|生命科学/, slugs: ['biology'] },
  { pattern: /物理学/, slugs: ['physics'] },
  { pattern: /医学|临床医学/, slugs: ['medicine'] },
  { pattern: /化学/, slugs: ['chemistry'] },
  { pattern: /数学/, slugs: ['mathematics'] },
];

/**
 * Extract research field slugs from Chinese text (bioZh or research topics).
 */
function extractFieldSlugs(chineseText: string): string[] {
  const slugs = new Set<string>();

  for (const entry of CHINESE_FIELD_MAP) {
    if (entry.pattern.test(chineseText)) {
      for (const slug of entry.slugs) {
        slugs.add(slug);
      }
    }
  }

  return [...slugs];
}

// ─── Main ───

interface EnrichResult {
  personId: string;
  nameZh: string;
  institution: string | null;
  fieldsAdded: number;
  oaConfidence: number | null;
  hIndex: number | null;
  citationCount: number | null;
  pubCount: number | null;
  papersAdded: number;
  errors: string[];
}

async function main() {
  console.log(`[Enrich] Academic data enrichment${DRY_RUN ? ' (DRY RUN)' : ''}`);
  if (MAX_PERSONS < Infinity) console.log(`[Enrich] Limit: ${MAX_PERSONS} persons`);
  if (SKIP_OPENALEX) console.log(`[Enrich] Skipping OpenAlex calls`);

  // ─── Find scraped scholars missing academic data ───
  const scholars = await prisma.person.findMany({
    where: {
      isActive: true,
      id: { not: { startsWith: 'seed-' } },
      OR: [
        { hIndex: null },
        { citationCount: null },
        { fields: { none: {} } },
      ],
    },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      institution: true,
      bioZh: true,
      bioEn: true,
      hIndex: true,
      citationCount: true,
      publicationCount: true,
      researchUpdates: { select: { title: true }, take: 15 },
      fields: { select: { fieldId: true } },
    },
    take: MAX_PERSONS < Infinity ? MAX_PERSONS : undefined,
  });

  console.log(`[Enrich] Found ${scholars.length} scholars with missing academic data`);

  const results: EnrichResult[] = [];
  let processed = 0;
  let totalFieldsAdded = 0;
  let totalPapersAdded = 0;

  for (const scholar of scholars) {
    processed++;
    const result: EnrichResult = {
      personId: scholar.id,
      nameZh: scholar.nameZh,
      institution: scholar.institution,
      fieldsAdded: 0,
      oaConfidence: null,
      hIndex: null,
      citationCount: null,
      pubCount: null,
      papersAdded: 0,
      errors: [],
    };

    const status = `[${processed}/${scholars.length}] ${scholar.nameZh} (${scholar.institution || '?'})`;

    try {
      // ─── Step 1: Extract research fields from bio + research updates ───
      const existingFieldIds = new Set(scholar.fields.map(f => f.fieldId));
      const textToAnalyze: string[] = [];

      if (scholar.bioZh) textToAnalyze.push(scholar.bioZh);
      if (scholar.bioEn) textToAnalyze.push(scholar.bioEn);
      if (scholar.researchUpdates?.length) {
        textToAnalyze.push(scholar.researchUpdates.map(u => u.title).join('; '));
      }

      const combinedText = textToAnalyze.join('; ');
      const detectedSlugs = combinedText ? extractFieldSlugs(combinedText) : [];

      // Resolve slugs to actual field IDs
      let newFieldIds: string[] = [];
      if (detectedSlugs.length > 0) {
        const fields = await prisma.field.findMany({
          where: { slug: { in: detectedSlugs } },
          select: { id: true, slug: true },
        });
        const validIds = fields.map(f => f.id);
        newFieldIds = validIds.filter(id => !existingFieldIds.has(id));
      }

      // Create PersonField associations
      if (newFieldIds.length > 0) {
        result.fieldsAdded = newFieldIds.length;

        if (!DRY_RUN) {
          for (const fieldId of newFieldIds) {
            await prisma.personField.create({
              data: {
                personId: scholar.id,
                fieldId,
                isPrimary: false,
              },
            });
          }
        }
      }

      // ─── Step 2: OpenAlex — find scholar and get metrics + papers ───
      if (!SKIP_OPENALEX) {
        const oaResult = await findScholarOnOpenAlex(scholar.nameZh, scholar.institution);

        if (oaResult && oaResult.confidence >= 0.5) {
          const { author, confidence } = oaResult;
          result.oaConfidence = Math.round(confidence * 100) / 100;
          result.hIndex = author.summary_stats?.h_index || null;
          result.citationCount = author.cited_by_count || null;
          result.pubCount = author.works_count || null;

          // Update Person metrics
          if (!DRY_RUN) {
            const updateData: Record<string, unknown> = {};

            if (!scholar.hIndex && result.hIndex) {
              updateData.hIndex = result.hIndex;
            }
            if (!scholar.citationCount && result.citationCount) {
              updateData.citationCount = result.citationCount;
            }
            if (result.pubCount) {
              updateData.publicationCount = result.pubCount;
            }

            if (Object.keys(updateData).length > 0) {
              await prisma.person.update({
                where: { id: scholar.id },
                data: {
                  ...updateData as any,
                  lastScrapedAt: new Date(),
                },
              });
            }

            // Also update metadata with OpenAlex ID
            const currentMeta = (await prisma.person.findUnique({
              where: { id: scholar.id },
              select: { metadata: true },
            }))?.metadata || {};

            if (typeof currentMeta === 'object' && !Array.isArray(currentMeta)) {
              await prisma.person.update({
                where: { id: scholar.id },
                data: {
                  metadata: {
                    ...(currentMeta as Record<string, unknown>),
                    openalexId: author.id,
                    openalexHIndex: author.summary_stats?.h_index,
                    openalexCitations: author.cited_by_count,
                    openalexConfidence: confidence,
                  },
                },
              });
            }

            // Fetch and upsert publications
            if (author.works_count > 0) {
              const works = await getAuthorWorks(author.id, { per_page: 20 });

              let papersAddedForScholar = 0;
              for (const work of works) {
                const pub = openAlexWorkToPublication(work);

                // Skip publications without title or DOI
                if (!pub.title || pub.title === 'Untitled') continue;

                // Upsert by DOI (if available) or title+year
                if (pub.doi) {
                  const existing = await prisma.publication.findUnique({
                    where: { doi: pub.doi.replace('https://doi.org/', '') },
                  });
                  if (existing) continue;

                  try {
                    await prisma.publication.create({
                      data: {
                        personId: scholar.id,
                        title: pub.title,
                        authors: pub.authors.join('; '),
                        journal: pub.journal,
                        year: pub.year,
                        doi: pub.doi.replace('https://doi.org/', ''),
                        url: pub.url,
                        citationCount: pub.citationCount,
                        source: 'OPENALEX',
                      },
                    });
                    papersAddedForScholar++;
                  } catch {
                    // DOI conflict — skip
                  }
                } else {
                  // Check by title + year similarity
                  const existing = await prisma.publication.findFirst({
                    where: {
                      personId: scholar.id,
                      title: { contains: pub.title.slice(0, 50) },
                      year: pub.year,
                    },
                  });
                  if (existing) continue;

                  await prisma.publication.create({
                    data: {
                      personId: scholar.id,
                      title: pub.title,
                      authors: pub.authors.join('; '),
                      journal: pub.journal,
                      year: pub.year,
                      citationCount: pub.citationCount,
                      source: 'OPENALEX',
                    },
                  });
                  papersAddedForScholar++;
                }
              }

              result.papersAdded = papersAddedForScholar;
              totalPapersAdded += papersAddedForScholar;
            }
          }
        }
      }

      totalFieldsAdded += result.fieldsAdded;

      // Status output
      const parts: string[] = [];
      if (result.fieldsAdded > 0) parts.push(`fields:+${result.fieldsAdded}`);
      if (result.oaConfidence) parts.push(`OA:${result.oaConfidence}`);
      if (result.hIndex) parts.push(`h=${result.hIndex}`);
      if (result.citationCount) parts.push(`c=${result.citationCount}`);
      if (result.papersAdded > 0) parts.push(`papers:+${result.papersAdded}`);
      const statusLine = parts.length > 0 ? parts.join(' ') : 'NO DATA';

      console.log(`${status} → ${statusLine}`);
      results.push(result);

    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
      console.log(`${status} → ERROR: ${err instanceof Error ? err.message : err}`);
      results.push(result);
    }
  }

  // ─── Summary ───
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Enrich] COMPLETE${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`[Enrich] Processed: ${processed}`);
  console.log(`[Enrich] Total fields added: ${totalFieldsAdded}`);
  console.log(`[Enrich] Total papers added: ${totalPapersAdded}`);

  const oaMatched = results.filter(r => r.oaConfidence && r.oaConfidence >= 0.5).length;
  const hIndexFilled = results.filter(r => r.hIndex !== null).length;
  const citationsFilled = results.filter(r => r.citationCount !== null).length;
  console.log(`[Enrich] OpenAlex matches: ${oaMatched}/${processed}`);
  console.log(`[Enrich] hIndex filled: ${hIndexFilled}`);
  console.log(`[Enrich] citationCount filled: ${citationsFilled}`);

  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Enrich] Fatal:', err);
    process.exit(1);
  });
