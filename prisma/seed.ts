import 'dotenv/config';
import { PrismaClient, UserRole, ScoreCategory } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  log: ['error', 'warn'],
});

// ─── Fixed IDs for idempotent re-runs ───
const P = {
  zhangwei: 'seed-zhang-wei-001',
  lina: 'seed-li-na-001',
  wangqiang: 'seed-wang-qiang-001',
  chenxue: 'seed-chen-xue-001',
  liuyang: 'seed-liu-yang-001',
  zhaomingming: 'seed-zhao-mingming-001',
  huangwen: 'seed-huang-wen-001',
  zhoujie: 'seed-zhou-jie-001',
  wuxia: 'seed-wu-xia-001',
  sunlei: 'seed-sun-lei-001',
  maxin: 'seed-ma-xin-001',
  linfang: 'seed-lin-fang-001',
  guowei: 'seed-guo-wei-001',
  yangrui: 'seed-yang-rui-001',
  tangli: 'seed-tang-li-001',
  hepeng: 'seed-he-peng-001',
  xujing: 'seed-xu-jing-001',
  shenwei: 'seed-shen-wei-001',
  hanmei: 'seed-han-mei-001',
  caijun: 'seed-cai-jun-001',
  panyue: 'seed-pan-yue-001',
  fengkun: 'seed-feng-kun-001',
  jianghao: 'seed-jiang-hao-001',
  renyan: 'seed-ren-yan-001',
  lijing: 'seed-li-jing-001',
  zhengtao: 'seed-zheng-tao-001',
  xiawei: 'seed-xia-wei-001',
  luoming: 'seed-luo-ming-001',
};

async function main() {
  console.log('🌱 Seeding database...\n');

  // ═══════════════════════════════════════════
  // USERS
  // ═══════════════════════════════════════════

  const adminHash = await bcrypt.hash('admin123', 12);
  await prisma.user.upsert({
    where: { email: 'admin@transparent-domain.org' },
    update: {},
    create: {
      name: '系统管理员',
      email: 'admin@transparent-domain.org',
      passwordHash: adminHash,
      emailVerified: new Date(),
      role: 'ADMIN',
    },
  });
  console.log('  ✓ Admin user');

  const communityHash = await bcrypt.hash('community123', 12);
  await prisma.user.upsert({
    where: { email: 'community@example.edu' },
    update: {},
    create: {
      name: '社区参与员',
      email: 'community@example.edu',
      passwordHash: communityHash,
      emailVerified: new Date(),
      eduEmail: 'community@tsinghua.edu.cn',
      eduEmailVerified: new Date(),
      role: 'COMMUNITY',
      institution: '清华大学',
    },
  });
  console.log('  ✓ Community user\n');

  // ═══════════════════════════════════════════
  // RESEARCH FIELDS
  // ═══════════════════════════════════════════

  const fieldDefs = [
    {
      slug: 'computer-science', nameZh: '计算机科学', nameEn: 'Computer Science',
      descriptionZh: '研究计算、算法、信息和自动化的学科', descriptionEn: 'The study of computation, algorithms, information, and automation',
      level: 0, sortOrder: 1,
      children: [
        {
          slug: 'artificial-intelligence', nameZh: '人工智能', nameEn: 'Artificial Intelligence', level: 1, sortOrder: 1,
          children: [
            { slug: 'machine-learning', nameZh: '机器学习', nameEn: 'Machine Learning', level: 2, sortOrder: 1 },
            { slug: 'natural-language-processing', nameZh: '自然语言处理', nameEn: 'Natural Language Processing', level: 2, sortOrder: 2 },
            { slug: 'computer-vision', nameZh: '计算机视觉', nameEn: 'Computer Vision', level: 2, sortOrder: 3 },
            { slug: 'reinforcement-learning', nameZh: '强化学习', nameEn: 'Reinforcement Learning', level: 2, sortOrder: 4 },
          ],
        },
        {
          slug: 'systems-and-networks', nameZh: '系统与网络', nameEn: 'Systems and Networks', level: 1, sortOrder: 2,
          children: [
            { slug: 'distributed-systems', nameZh: '分布式系统', nameEn: 'Distributed Systems', level: 2, sortOrder: 1 },
            { slug: 'computer-networks', nameZh: '计算机网络', nameEn: 'Computer Networks', level: 2, sortOrder: 2 },
            { slug: 'operating-systems', nameZh: '操作系统', nameEn: 'Operating Systems', level: 2, sortOrder: 3 },
          ],
        },
        {
          slug: 'theory', nameZh: '理论计算机科学', nameEn: 'Theoretical Computer Science', level: 1, sortOrder: 3,
          children: [
            { slug: 'algorithms', nameZh: '算法', nameEn: 'Algorithms', level: 2, sortOrder: 1 },
            { slug: 'computational-complexity', nameZh: '计算复杂性', nameEn: 'Computational Complexity', level: 2, sortOrder: 2 },
            { slug: 'cryptography', nameZh: '密码学', nameEn: 'Cryptography', level: 2, sortOrder: 3 },
          ],
        },
      ],
    },
    {
      slug: 'biology', nameZh: '生物学', nameEn: 'Biology', level: 0, sortOrder: 2,
      children: [
        {
          slug: 'molecular-biology', nameZh: '分子生物学', nameEn: 'Molecular Biology', level: 1, sortOrder: 1,
          children: [
            { slug: 'genomics', nameZh: '基因组学', nameEn: 'Genomics', level: 2, sortOrder: 1 },
            { slug: 'proteomics', nameZh: '蛋白质组学', nameEn: 'Proteomics', level: 2, sortOrder: 2 },
            { slug: 'gene-editing', nameZh: '基因编辑', nameEn: 'Gene Editing', level: 2, sortOrder: 3 },
          ],
        },
        {
          slug: 'neuroscience', nameZh: '神经科学', nameEn: 'Neuroscience', level: 1, sortOrder: 2,
          children: [
            { slug: 'cognitive-neuroscience', nameZh: '认知神经科学', nameEn: 'Cognitive Neuroscience', level: 2, sortOrder: 1 },
            { slug: 'computational-neuroscience', nameZh: '计算神经科学', nameEn: 'Computational Neuroscience', level: 2, sortOrder: 2 },
          ],
        },
      ],
    },
    {
      slug: 'physics', nameZh: '物理学', nameEn: 'Physics', level: 0, sortOrder: 3,
      children: [
        {
          slug: 'quantum-physics', nameZh: '量子物理', nameEn: 'Quantum Physics', level: 1, sortOrder: 1,
          children: [
            { slug: 'quantum-computing', nameZh: '量子计算', nameEn: 'Quantum Computing', level: 2, sortOrder: 1 },
            { slug: 'quantum-optics', nameZh: '量子光学', nameEn: 'Quantum Optics', level: 2, sortOrder: 2 },
            { slug: 'quantum-information', nameZh: '量子信息', nameEn: 'Quantum Information', level: 2, sortOrder: 3 },
          ],
        },
        { slug: 'condensed-matter', nameZh: '凝聚态物理', nameEn: 'Condensed Matter Physics', level: 1, sortOrder: 2 },
        {
          slug: 'particle-physics', nameZh: '粒子物理', nameEn: 'Particle Physics', level: 1, sortOrder: 3,
          children: [
            { slug: 'high-energy-physics', nameZh: '高能物理', nameEn: 'High Energy Physics', level: 2, sortOrder: 1 },
          ],
        },
      ],
    },
    {
      slug: 'medicine', nameZh: '医学', nameEn: 'Medicine', level: 0, sortOrder: 4,
      children: [
        {
          slug: 'oncology', nameZh: '肿瘤学', nameEn: 'Oncology', level: 1, sortOrder: 1,
          children: [
            { slug: 'immunotherapy', nameZh: '免疫治疗', nameEn: 'Immunotherapy', level: 2, sortOrder: 1 },
            { slug: 'precision-oncology', nameZh: '精准肿瘤学', nameEn: 'Precision Oncology', level: 2, sortOrder: 2 },
          ],
        },
        { slug: 'epidemiology', nameZh: '流行病学', nameEn: 'Epidemiology', level: 1, sortOrder: 2 },
        { slug: 'neurosurgery', nameZh: '神经外科', nameEn: 'Neurosurgery', level: 1, sortOrder: 3 },
      ],
    },
    {
      slug: 'chemistry', nameZh: '化学', nameEn: 'Chemistry', level: 0, sortOrder: 5,
      children: [
        {
          slug: 'organic-chemistry', nameZh: '有机化学', nameEn: 'Organic Chemistry', level: 1, sortOrder: 1,
          children: [
            { slug: 'synthetic-methods', nameZh: '合成方法学', nameEn: 'Synthetic Methods', level: 2, sortOrder: 1 },
            { slug: 'natural-products', nameZh: '天然产物化学', nameEn: 'Natural Products Chemistry', level: 2, sortOrder: 2 },
          ],
        },
        { slug: 'inorganic-chemistry', nameZh: '无机化学', nameEn: 'Inorganic Chemistry', level: 1, sortOrder: 2 },
        {
          slug: 'physical-chemistry', nameZh: '物理化学', nameEn: 'Physical Chemistry', level: 1, sortOrder: 3,
          children: [
            { slug: 'catalysis', nameZh: '催化化学', nameEn: 'Catalysis', level: 2, sortOrder: 1 },
          ],
        },
      ],
    },
    {
      slug: 'mathematics', nameZh: '数学', nameEn: 'Mathematics', level: 0, sortOrder: 6,
      children: [
        {
          slug: 'algebra', nameZh: '代数学', nameEn: 'Algebra', level: 1, sortOrder: 1,
          children: [
            { slug: 'number-theory', nameZh: '数论', nameEn: 'Number Theory', level: 2, sortOrder: 1 },
            { slug: 'algebraic-geometry', nameZh: '代数几何', nameEn: 'Algebraic Geometry', level: 2, sortOrder: 2 },
          ],
        },
        { slug: 'geometry', nameZh: '几何学', nameEn: 'Geometry', level: 1, sortOrder: 2 },
        { slug: 'probability', nameZh: '概率论与统计', nameEn: 'Probability and Statistics', level: 1, sortOrder: 3 },
      ],
    },
    {
      slug: 'economics', nameZh: '经济学', nameEn: 'Economics', level: 0, sortOrder: 7,
      children: [
        { slug: 'macroeconomics', nameZh: '宏观经济学', nameEn: 'Macroeconomics', level: 1, sortOrder: 1 },
        { slug: 'microeconomics', nameZh: '微观经济学', nameEn: 'Microeconomics', level: 1, sortOrder: 2 },
        { slug: 'econometrics', nameZh: '计量经济学', nameEn: 'Econometrics', level: 1, sortOrder: 3 },
      ],
    },
  ];

  async function createFieldTree(parentId: string | null, field: any) {
    const { children, ...data } = field;
    const created = await prisma.field.upsert({
      where: { slug: data.slug },
      update: data,
      create: { ...data, parentId },
    });
    if (children) {
      for (const child of children) {
        await createFieldTree(created.id, child);
      }
    }
    return created;
  }

  for (const field of fieldDefs) {
    await createFieldTree(null, field);
  }
  console.log(`  ✓ ${fieldDefs.length} top-level research fields\n`);

  // ═══════════════════════════════════════════
  // SAMPLE PERSONS (32 researchers)
  // ═══════════════════════════════════════════

  interface PersonSeed {
    id: string;
    nameZh: string;
    nameEn: string;
    title: string;
    institution: string;
    department: string;
    email?: string; // Only set when sourced from real data (ORCID, papers, etc.)
    bioZh: string;
    bioEn: string;
    hIndex: number;
    citationCount: number;
    publicationCount: number;
    score: number;
    fieldSlug: string;
    region: string;
    city: string;
    pubs: { title: string; authors: string; journal: string; year: number; doi?: string; citationCount: number }[];
    extraFieldSlugs?: string[];
  }

  const samplePersons: PersonSeed[] = [
    // ─── Computer Science / AI ───
    {
      id: P.zhangwei, nameZh: '张伟', nameEn: 'Wei Zhang', title: '教授', institution: '清华大学', department: '计算机科学与技术系',
      email: 'wei.zhang@tsinghua.edu.cn',
      bioZh: '人工智能领域知名学者，专注于机器学习和深度学习研究。', bioEn: 'Renowned scholar in AI, focusing on machine learning and deep learning.',
      hIndex: 78, citationCount: 45000, publicationCount: 320, score: 115.5, fieldSlug: 'machine-learning', region: '华北', city: '北京',
      extraFieldSlugs: ['natural-language-processing'],
      pubs: [
        { title: 'Deep Learning Approaches for Natural Language Understanding', authors: 'Zhang W, Li M, Chen X', journal: 'Nature Machine Intelligence', year: 2024, doi: '10.1038/s42256-024-00123-4', citationCount: 156 },
        { title: 'Transformer Architectures: A Comprehensive Survey', authors: 'Zhang W, Wang H', journal: 'IEEE TPAMI', year: 2023, doi: '10.1109/TPAMI.2023.1234567', citationCount: 890 },
        { title: 'Efficient Training of Large Language Models', authors: 'Zhang W, Liu Y, Zhao P', journal: 'NeurIPS', year: 2022, citationCount: 1200 },
      ],
    },
    {
      id: P.liuyang, nameZh: '刘洋', nameEn: 'Yang Liu', title: '教授', institution: '浙江大学', department: '计算机科学与技术学院',
      email: 'yang.liu@zju.edu.cn',
      bioZh: '自然语言处理、大语言模型研究者。', bioEn: 'Researcher in NLP and large language models.',
      hIndex: 45, citationCount: 22000, publicationCount: 150, score: 103.8, fieldSlug: 'natural-language-processing', region: '华东', city: '杭州',
      extraFieldSlugs: ['machine-learning'],
      pubs: [
        { title: 'Multilingual Pretraining for Low-Resource Languages', authors: 'Liu Y, Zhang W', journal: 'ACL', year: 2024, citationCount: 180 },
        { title: 'Instruction Tuning with Human Feedback', authors: 'Liu Y, Chen X', journal: 'EMNLP', year: 2023, citationCount: 560 },
      ],
    },
    {
      id: P.huangwen, nameZh: '黄文', nameEn: 'Wen Huang', title: '副教授', institution: '上海交通大学', department: '计算机科学与工程系',
      email: 'wen.huang@sjtu.edu.cn',
      bioZh: '计算机视觉与图像理解专家。', bioEn: 'Expert in computer vision and image understanding.',
      hIndex: 38, citationCount: 15000, publicationCount: 95, score: 101.2, fieldSlug: 'computer-vision', region: '华东', city: '上海',
      pubs: [
        { title: 'Vision-Language Pretraining for Scene Understanding', authors: 'Huang W, Li S', journal: 'CVPR', year: 2024, citationCount: 230 },
        { title: 'Efficient Video Transformers for Action Recognition', authors: 'Huang W, Zhao T', journal: 'ICCV', year: 2023, citationCount: 380 },
      ],
    },
    {
      id: P.guowei, nameZh: '郭伟', nameEn: 'Wei Guo', title: '教授', institution: '哈尔滨工业大学', department: '计算机科学与技术学院',
      email: 'wei.guo@hit.edu.cn',
      bioZh: '分布式系统和云计算架构专家。', bioEn: 'Expert in distributed systems and cloud computing.',
      hIndex: 42, citationCount: 19500, publicationCount: 130, score: 98.5, fieldSlug: 'distributed-systems', region: '东北', city: '哈尔滨',
      pubs: [
        { title: 'Elastic Resource Management in Cloud-Native Environments', authors: 'Guo W, Sun M', journal: 'ACM SoCC', year: 2024, citationCount: 95 },
        { title: 'Fault-Tolerant State Machine Replication', authors: 'Guo W, Liu H', journal: 'IEEE TDSC', year: 2023, citationCount: 210 },
      ],
    },
    {
      id: P.zhaomingming, nameZh: '赵明明', nameEn: 'Mingming Zhao', title: '研究员', institution: '中国科学院', department: '计算技术研究所',
      email: 'mingming.zhao@ict.ac.cn',
      bioZh: '分布式系统和云计算专家。', bioEn: 'Expert in distributed systems and cloud computing.',
      hIndex: 40, citationCount: 18000, publicationCount: 120, score: 95.0, fieldSlug: 'distributed-systems', region: '华北', city: '北京',
      pubs: [
        { title: 'Serverless Computing at Scale: Challenges and Solutions', authors: 'Zhao M, Sun K', journal: 'OSDI', year: 2024, citationCount: 150 },
      ],
    },
    {
      id: P.jianghao, nameZh: '姜浩', nameEn: 'Hao Jiang', title: '助理教授', institution: '南京大学', department: '计算机科学与技术系',
      email: 'hao.jiang@nju.edu.cn',
      bioZh: '强化学习与机器人决策研究者。', bioEn: 'Researcher in reinforcement learning and robotic decision-making.',
      hIndex: 28, citationCount: 8200, publicationCount: 55, score: 92.0, fieldSlug: 'reinforcement-learning', region: '华东', city: '南京',
      pubs: [
        { title: 'Sample-Efficient RL with Model-Based Planning', authors: 'Jiang H, Wu T', journal: 'ICML', year: 2024, citationCount: 110 },
        { title: 'Safe Exploration in Continuous Control', authors: 'Jiang H', journal: 'NeurIPS', year: 2023, citationCount: 175 },
      ],
    },
    {
      id: P.xiawei, nameZh: '夏微', nameEn: 'Wei Xia', title: '副教授', institution: '武汉大学', department: '计算机学院',
      email: 'wei.xia@whu.edu.cn',
      bioZh: '密码学与信息安全研究者。', bioEn: 'Researcher in cryptography and information security.',
      hIndex: 35, citationCount: 13500, publicationCount: 88, score: 99.2, fieldSlug: 'cryptography', region: '华中', city: '武汉',
      pubs: [
        { title: 'Post-Quantum Cryptographic Primitives', authors: 'Xia W, Chen L', journal: 'CRYPTO', year: 2024, citationCount: 85 },
        { title: 'Zero-Knowledge Proofs for Verifiable Computation', authors: 'Xia W', journal: 'EuroCrypt', year: 2023, citationCount: 200 },
      ],
    },
    {
      id: P.luoming, nameZh: '罗明', nameEn: 'Ming Luo', title: '研究员', institution: '中山大学', department: '数据科学与计算机学院',
      email: 'ming.luo@sysu.edu.cn',
      bioZh: '计算机算法和理论研究者。', bioEn: 'Researcher in algorithms and theoretical CS.',
      hIndex: 30, citationCount: 9800, publicationCount: 70, score: 93.8, fieldSlug: 'algorithms', region: '华南', city: '广州',
      pubs: [
        { title: 'Near-Optimal Online Algorithms for Resource Allocation', authors: 'Luo M, Zhang K', journal: 'STOC', year: 2024, citationCount: 60 },
        { title: 'Approximation Algorithms for Graph Partitioning', authors: 'Luo M', journal: 'SODA', year: 2023, citationCount: 145 },
      ],
    },

    // ─── Biology ───
    {
      id: P.lina, nameZh: '李娜', nameEn: 'Na Li', title: '副教授', institution: '北京大学', department: '生命科学学院',
      email: 'na.li@pku.edu.cn',
      bioZh: '分子生物学研究者，CRISPR基因编辑专家。', bioEn: 'Molecular biology researcher, CRISPR gene editing expert.',
      hIndex: 52, citationCount: 28000, publicationCount: 180, score: 108.2, fieldSlug: 'gene-editing', region: '华北', city: '北京',
      extraFieldSlugs: ['genomics'],
      pubs: [
        { title: 'Precision Genome Editing Using Novel CRISPR Variants', authors: 'Li N, Smith J', journal: 'Science', year: 2024, doi: '10.1126/science.abc1234', citationCount: 320 },
        { title: 'Off-target Effects in CRISPR-Cas9: Mechanisms and Solutions', authors: 'Li N, Zhang Y, Wang L', journal: 'Nature Biotechnology', year: 2023, citationCount: 450 },
        { title: 'Base Editing for Monogenic Diseases', authors: 'Li N, Zhou H', journal: 'Cell', year: 2024, citationCount: 185 },
      ],
    },
    {
      id: P.zhoujie, nameZh: '周洁', nameEn: 'Jie Zhou', title: '教授', institution: '复旦大学', department: '生命科学学院',
      email: 'jie.zhou@fudan.edu.cn',
      bioZh: '基因组学与生物信息学研究者。', bioEn: 'Genomics and bioinformatics researcher.',
      hIndex: 48, citationCount: 24000, publicationCount: 160, score: 105.0, fieldSlug: 'genomics', region: '华东', city: '上海',
      pubs: [
        { title: 'Single-Cell Multi-omics Integration for Developmental Biology', authors: 'Zhou J, Huang M', journal: 'Nature Genetics', year: 2024, citationCount: 280 },
        { title: 'Population Genomics of East Asian Populations', authors: 'Zhou J, Li W', journal: 'Genome Research', year: 2023, citationCount: 340 },
      ],
    },
    {
      id: P.wuxia, nameZh: '吴霞', nameEn: 'Xia Wu', title: '研究员', institution: '中国科学技术大学', department: '生命科学与医学部',
      email: 'xia.wu@ustc.edu.cn',
      bioZh: '神经科学与脑科学研究。', bioEn: 'Neuroscience and brain research.',
      hIndex: 36, citationCount: 14000, publicationCount: 100, score: 96.0, fieldSlug: 'cognitive-neuroscience', region: '华东', city: '合肥',
      pubs: [
        { title: 'Neural Correlates of Hierarchical Decision Making', authors: 'Wu X, Chen Y', journal: 'Neuron', year: 2024, citationCount: 195 },
        { title: 'fMRI Analysis of Memory Consolidation', authors: 'Wu X', journal: 'Nature Neuroscience', year: 2023, citationCount: 420 },
      ],
    },
    {
      id: P.linfang, nameZh: '林芳', nameEn: 'Fang Lin', title: '助理教授', institution: '上海交通大学', department: '生命科学技术学院',
      email: 'fang.lin@sjtu.edu.cn',
      bioZh: '蛋白质组学与质谱技术。', bioEn: 'Proteomics and mass spectrometry.',
      hIndex: 25, citationCount: 7200, publicationCount: 55, score: 88.5, fieldSlug: 'proteomics', region: '华东', city: '上海',
      pubs: [
        { title: 'High-Throughput Plasma Proteome Profiling', authors: 'Lin F, Wang C', journal: 'Molecular & Cellular Proteomics', year: 2024, citationCount: 70 },
      ],
    },
    {
      id: P.shenwei, nameZh: '沈伟', nameEn: 'Wei Shen', title: '教授', institution: '武汉大学', department: '生命科学学院',
      email: 'wei.shen@whu.edu.cn',
      bioZh: '计算神经科学研究者。', bioEn: 'Computational neuroscience researcher.',
      hIndex: 33, citationCount: 11800, publicationCount: 85, score: 94.0, fieldSlug: 'computational-neuroscience', region: '华中', city: '武汉',
      pubs: [
        { title: 'Spiking Neural Networks for Brain Simulation', authors: 'Shen W, Xu P', journal: 'Neural Computation', year: 2024, citationCount: 105 },
        { title: 'Dendritic Computation in Cortical Circuits', authors: 'Shen W', journal: 'Journal of Neuroscience', year: 2023, citationCount: 230 },
      ],
    },

    // ─── Physics ───
    {
      id: P.wangqiang, nameZh: '王强', nameEn: 'Qiang Wang', title: '教授', institution: '中国科学技术大学', department: '物理学院',
      email: 'qiang.wang@ustc.edu.cn',
      bioZh: '量子信息和量子计算领域先驱。', bioEn: 'Pioneer in quantum information and quantum computing.',
      hIndex: 65, citationCount: 35000, publicationCount: 250, score: 112.0, fieldSlug: 'quantum-computing', region: '华东', city: '合肥',
      extraFieldSlugs: ['quantum-information'],
      pubs: [
        { title: 'Quantum Error Correction for Scalable Quantum Computing', authors: 'Wang Q, Chen R', journal: 'Physical Review Letters', year: 2024, citationCount: 200 },
        { title: 'Entanglement Distribution in Quantum Networks', authors: 'Wang Q, Liu H, Zhao M', journal: 'Nature Physics', year: 2023, citationCount: 380 },
        { title: 'Topological Qubits with Majorana Zero Modes', authors: 'Wang Q, Sun T', journal: 'Science', year: 2024, citationCount: 165 },
      ],
    },
    {
      id: P.sunlei, nameZh: '孙磊', nameEn: 'Lei Sun', title: '研究员', institution: '中国科学院', department: '物理研究所',
      email: 'lei.sun@iphy.ac.cn',
      bioZh: '凝聚态物理与拓扑材料。', bioEn: 'Condensed matter physics and topological materials.',
      hIndex: 55, citationCount: 30000, publicationCount: 200, score: 110.5, fieldSlug: 'condensed-matter', region: '华北', city: '北京',
      pubs: [
        { title: 'Topological Insulators with High-Temperature Superconductivity', authors: 'Sun L, Yang F', journal: 'Nature Materials', year: 2024, citationCount: 310 },
        { title: 'Strain Engineering of 2D Materials', authors: 'Sun L, Park J', journal: 'Advanced Materials', year: 2023, citationCount: 450 },
      ],
    },
    {
      id: P.tangli, nameZh: '唐莉', nameEn: 'Li Tang', title: '副教授', institution: '北京大学', department: '物理学院',
      email: 'li.tang@pku.edu.cn',
      bioZh: '量子光学与光子芯片。', bioEn: 'Quantum optics and photonic chips.',
      hIndex: 32, citationCount: 10500, publicationCount: 75, score: 91.0, fieldSlug: 'quantum-optics', region: '华北', city: '北京',
      pubs: [
        { title: 'Integrated Photonic Quantum Gates', authors: 'Tang L, Wang D', journal: 'Nature Photonics', year: 2024, citationCount: 140 },
        { title: 'Squeezed Light Generation in Lithium Niobate', authors: 'Tang L', journal: 'Physical Review Letters', year: 2023, citationCount: 200 },
      ],
    },
    {
      id: P.yangrui, nameZh: '杨锐', nameEn: 'Rui Yang', title: '教授', institution: '南京大学', department: '物理学院',
      email: 'rui.yang@nju.edu.cn',
      bioZh: '高能物理与粒子探测。', bioEn: 'High energy physics and particle detection.',
      hIndex: 60, citationCount: 33000, publicationCount: 280, score: 113.0, fieldSlug: 'high-energy-physics', region: '华东', city: '南京',
      pubs: [
        { title: 'New Limits on Dark Matter-Nucleon Scattering', authors: 'Yang R, CMS Collaboration', journal: 'Physical Review D', year: 2024, citationCount: 255 },
        { title: 'Precision Measurement of the W Boson Mass', authors: 'Yang R', journal: 'Nature', year: 2023, citationCount: 890 },
      ],
    },
    {
      id: P.renyan, nameZh: '任言', nameEn: 'Yan Ren', title: '助理研究员', institution: '哈尔滨工业大学', department: '物理系',
      email: 'yan.ren@hit.edu.cn',
      bioZh: '量子信息理论研究。', bioEn: 'Quantum information theory.',
      hIndex: 22, citationCount: 5200, publicationCount: 40, score: 85.0, fieldSlug: 'quantum-information', region: '东北', city: '哈尔滨',
      pubs: [
        { title: 'Entropic Uncertainty Relations in Multi-Partite Systems', authors: 'Ren Y, Li J', journal: 'Quantum Information Processing', year: 2024, citationCount: 40 },
      ],
    },

    // ─── Medicine ───
    {
      id: P.chenxue, nameZh: '陈雪', nameEn: 'Xue Chen', title: '教授', institution: '复旦大学', department: '上海医学院',
      email: 'xue.chen@fudan.edu.cn',
      bioZh: '肿瘤免疫治疗专家，CAR-T细胞疗法。', bioEn: 'Cancer immunotherapy expert, CAR-T cell therapy.',
      hIndex: 58, citationCount: 31000, publicationCount: 200, score: 97.5, fieldSlug: 'immunotherapy', region: '华东', city: '上海',
      extraFieldSlugs: ['oncology'],
      pubs: [
        { title: 'Next-Generation CAR-T Cells for Solid Tumors', authors: 'Chen X, Huang Y', journal: 'Cancer Cell', year: 2024, citationCount: 280 },
        { title: 'Biomarkers for Immunotherapy Response Prediction', authors: 'Chen X, Zhou W, Wu T', journal: 'Journal of Clinical Oncology', year: 2023, citationCount: 520 },
        { title: 'Dual-Targeting CAR-T for Glioblastoma', authors: 'Chen X, Wang M', journal: 'Nature Medicine', year: 2024, citationCount: 210 },
      ],
    },
    {
      id: P.xujing, nameZh: '徐静', nameEn: 'Jing Xu', title: '副教授', institution: '中山大学', department: '中山医学院',
      email: 'jing.xu@sysu.edu.cn',
      bioZh: '精准肿瘤学与液体活检。', bioEn: 'Precision oncology and liquid biopsy.',
      hIndex: 31, citationCount: 9600, publicationCount: 68, score: 89.0, fieldSlug: 'precision-oncology', region: '华南', city: '广州',
      pubs: [
        { title: 'ctDNA-Guided Treatment Selection for Colorectal Cancer', authors: 'Xu J, Liu P', journal: 'Lancet Oncology', year: 2024, citationCount: 175 },
        { title: 'Machine Learning for Early Cancer Detection', authors: 'Xu J, Zhang W', journal: 'JAMA Oncology', year: 2023, citationCount: 340 },
      ],
    },
    {
      id: P.hanmei, nameZh: '韩梅', nameEn: 'Mei Han', title: '主任医师', institution: '北京大学', department: '公共卫生学院',
      email: 'mei.han@pku.edu.cn',
      bioZh: '流行病学与传染病模型。', bioEn: 'Epidemiology and infectious disease modeling.',
      hIndex: 44, citationCount: 21000, publicationCount: 155, score: 100.0, fieldSlug: 'epidemiology', region: '华北', city: '北京',
      pubs: [
        { title: 'Multi-pathogen Surveillance Using Wastewater Metagenomics', authors: 'Han M, Zhao Q', journal: 'The Lancet', year: 2024, citationCount: 420 },
        { title: 'Vaccine Effectiveness Against Emerging Variants', authors: 'Han M, Li T', journal: 'NEJM', year: 2023, citationCount: 780 },
      ],
    },
    {
      id: P.caijun, nameZh: '蔡军', nameEn: 'Jun Cai', title: '教授', institution: '浙江大学', department: '医学院',
      email: 'jun.cai@zju.edu.cn',
      bioZh: '神经外科与脑肿瘤研究。', bioEn: 'Neurosurgery and brain tumor research.',
      hIndex: 40, citationCount: 17000, publicationCount: 110, score: 96.8, fieldSlug: 'neurosurgery', region: '华东', city: '杭州',
      pubs: [
        { title: 'Awake Craniotomy for Language Area Mapping', authors: 'Cai J, Wang S', journal: 'Journal of Neurosurgery', year: 2024, citationCount: 90 },
        { title: 'Minimally Invasive Approaches to Skull Base Tumors', authors: 'Cai J', journal: 'Neurosurgery', year: 2023, citationCount: 160 },
      ],
    },

    // ─── Chemistry ───
    {
      id: P.maxin, nameZh: '马欣', nameEn: 'Xin Ma', title: '教授', institution: '北京大学', department: '化学与分子工程学院',
      email: 'xin.ma@pku.edu.cn',
      bioZh: '有机合成方法学与天然产物全合成。', bioEn: 'Organic synthesis methodology and natural product total synthesis.',
      hIndex: 50, citationCount: 26000, publicationCount: 190, score: 107.0, fieldSlug: 'synthetic-methods', region: '华北', city: '北京',
      extraFieldSlugs: ['organic-chemistry'],
      pubs: [
        { title: 'Photoredox-Catalyzed C-H Functionalization Strategies', authors: 'Ma X, Chen L', journal: 'JACS', year: 2024, citationCount: 265 },
        { title: 'Total Synthesis of Taxol: A Convergent Approach', authors: 'Ma X, Zhou H', journal: 'Angewandte Chemie', year: 2023, citationCount: 380 },
      ],
    },
    {
      id: P.panyue, nameZh: '潘越', nameEn: 'Yue Pan', title: '副教授', institution: '中国科学技术大学', department: '化学系',
      email: 'yue.pan@ustc.edu.cn',
      bioZh: '催化化学与可再生能源。', bioEn: 'Catalysis and renewable energy.',
      hIndex: 34, citationCount: 12500, publicationCount: 82, score: 93.5, fieldSlug: 'catalysis', region: '华东', city: '合肥',
      pubs: [
        { title: 'Single-Atom Catalysts for CO2 Reduction', authors: 'Pan Y, Liu F', journal: 'Nature Catalysis', year: 2024, citationCount: 330 },
        { title: 'Electrocatalytic Water Splitting with MOFs', authors: 'Pan Y', journal: 'ACS Catalysis', year: 2023, citationCount: 220 },
      ],
    },
    {
      id: P.fengkun, nameZh: '冯坤', nameEn: 'Kun Feng', title: '研究员', institution: '复旦大学', department: '化学系',
      email: 'kun.feng@fudan.edu.cn',
      bioZh: '无机化学与金属有机框架。', bioEn: 'Inorganic chemistry and metal-organic frameworks.',
      hIndex: 29, citationCount: 8500, publicationCount: 60, score: 90.0, fieldSlug: 'inorganic-chemistry', region: '华东', city: '上海',
      pubs: [
        { title: 'Conductive MOFs for Energy Storage', authors: 'Feng K, Wang Z', journal: 'Nature Materials', year: 2024, citationCount: 280 },
      ],
    },
    {
      id: P.zhengtao, nameZh: '郑涛', nameEn: 'Tao Zheng', title: '副教授', institution: '武汉大学', department: '化学与分子科学学院',
      email: 'tao.zheng@whu.edu.cn',
      bioZh: '天然产物化学与药物发现。', bioEn: 'Natural products chemistry and drug discovery.',
      hIndex: 27, citationCount: 7800, publicationCount: 58, score: 87.0, fieldSlug: 'natural-products', region: '华中', city: '武汉',
      pubs: [
        { title: 'Marine Natural Products as Kinase Inhibitors', authors: 'Zheng T', journal: 'Journal of Medicinal Chemistry', year: 2024, citationCount: 95 },
      ],
    },

    // ─── Mathematics ───
    {
      id: P.hepeng, nameZh: '何鹏', nameEn: 'Peng He', title: '教授', institution: '浙江大学', department: '数学科学学院',
      email: 'peng.he@zju.edu.cn',
      bioZh: '数论与算术几何研究。', bioEn: 'Number theory and arithmetic geometry.',
      hIndex: 28, citationCount: 7500, publicationCount: 65, score: 95.0, fieldSlug: 'number-theory', region: '华东', city: '杭州',
      pubs: [
        { title: 'Modular Forms and Elliptic Curves over Function Fields', authors: 'He P', journal: 'Annals of Mathematics', year: 2024, citationCount: 45 },
        { title: 'Diophantine Approximation on Algebraic Varieties', authors: 'He P, Lin S', journal: 'Inventiones Mathematicae', year: 2023, citationCount: 80 },
      ],
    },
    {
      id: P.lijing, nameZh: '李静', nameEn: 'Jing Li', title: '副教授', institution: '南京大学', department: '数学系',
      email: 'jing.li@nju.edu.cn',
      bioZh: '代数几何与模空间研究。', bioEn: 'Algebraic geometry and moduli spaces.',
      hIndex: 24, citationCount: 6200, publicationCount: 48, score: 86.5, fieldSlug: 'algebraic-geometry', region: '华东', city: '南京',
      pubs: [
        { title: 'Stability Conditions on Derived Categories of Coherent Sheaves', authors: 'Li J', journal: 'Journal of Algebraic Geometry', year: 2024, citationCount: 32 },
      ],
    },
  ];

  const categories = Object.values(ScoreCategory);

  // Helper: create primary field association and parent field breadcrumb
  async function createFieldAssociations(personId: string, fieldSlug: string) {
    const field = await prisma.field.findUnique({ where: { slug: fieldSlug } });
    if (!field) return;

    await prisma.personField.upsert({
      where: { personId_fieldId: { personId, fieldId: field.id } },
      update: { isPrimary: true },
      create: { personId, fieldId: field.id, isPrimary: true },
    });

    if (field.parentId) {
      const parent = await prisma.field.findUnique({ where: { id: field.parentId } });
      if (parent) {
        await prisma.personField.upsert({
          where: { personId_fieldId: { personId, fieldId: parent.id } },
          update: {},
          create: { personId, fieldId: parent.id, isPrimary: false },
        });
      }
    }
  }

  let created = 0;
  for (const personData of samplePersons) {
    const { id, fieldSlug, extraFieldSlugs, pubs, region, city, email: _email, ...personFields } = personData;
    // Note: email is excluded from seed — real contact info comes from ORCID/scholarly scraping

    const person = await prisma.person.upsert({
      where: { id },
      update: {
        ...personFields,
        region,
        city,
        metadata: { region, city, seeded: true },
        isVerified: true,
      },
      create: {
        id,
        ...personFields,
        region,
        city,
        metadata: { region, city, seeded: true },
        isVerified: true,
      },
    });

    // Primary field association
    await createFieldAssociations(person.id, fieldSlug);

    // Extra field associations (for cross-field expertise)
    if (extraFieldSlugs) {
      for (const extraSlug of extraFieldSlugs) {
        await createFieldAssociations(person.id, extraSlug);
      }
    }

    // Score breakdowns
    for (const cat of categories) {
      const variation = (Math.random() - 0.5) * 10; // ±5 variation per category
      await prisma.scoreBreakdown.upsert({
        where: { personId_category: { personId: person.id, category: cat } },
        update: { value: Math.round((personData.score + variation) * 10) / 10 },
        create: {
          personId: person.id,
          category: cat,
          value: Math.round((personData.score + variation) * 10) / 10,
        },
      });
    }

    // Publications
    for (let i = 0; i < pubs.length; i++) {
      const pub = pubs[i];
      const doi = pub.doi || `10.seed/${personData.id.replace('seed-', '')}-${i + 1}`;
      await prisma.publication.upsert({
        where: { doi },
        update: { title: pub.title, authors: pub.authors, journal: pub.journal, year: pub.year, citationCount: pub.citationCount, personId: person.id, source: 'seed', publishedAt: new Date(`${pub.year}-01-01`) },
        create: { ...pub, doi, personId: person.id, source: 'seed', publishedAt: new Date(`${pub.year}-01-01`) },
      });
    }

    // Research update from first publication
    const firstDoi = pubs[0].doi || `10.seed/${personData.id.replace('seed-', '')}-1`;
    await prisma.researchUpdate.create({
      data: {
        personId: person.id,
        title: pubs[0].title,
        description: `近期发表在${pubs[0].journal}上的研究`,
        url: `https://doi.org/${firstDoi}`,
        source: 'seed',
        publishedAt: new Date(),
      },
    });

    // Competition updates（竞赛动态）
    const competitionLevels = ['国家级', '省部级', '国际级'] as const;
    const competitionAwards = ['一等奖', '二等奖', '特等奖', '金奖', '银奖'] as const;
    await prisma.competitionUpdate.create({
      data: {
        personId: person.id,
        title: `${personData.nameZh}团队获${competitionLevels[Math.floor(Math.random() * 3)]}竞赛${competitionAwards[Math.floor(Math.random() * 5)]}`,
        description: `在人工智能算法挑战赛中表现优异，获得评审专家组一致认可。`,
        source: 'seed',
        level: competitionLevels[Math.floor(Math.random() * 3)],
        award: competitionAwards[Math.floor(Math.random() * 5)],
        publishedAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
      },
    });

    // Evaluation updates（评比动态）
    const evalTypes = ['人才称号', '学术荣誉', '科研奖励', '教学评比'] as const;
    const evalResults = ['入选', '获评', '通过', '获得'] as const;
    await prisma.evaluationUpdate.create({
      data: {
        personId: person.id,
        title: `${personData.nameZh}${evalResults[Math.floor(Math.random() * 4)]}${evalTypes[Math.floor(Math.random() * 4)]}`,
        description: `${personData.institution}年度学术评估中表现突出。`,
        source: 'seed',
        evalType: evalTypes[Math.floor(Math.random() * 4)],
        result: evalResults[Math.floor(Math.random() * 4)],
        publishedAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
      },
    });

    created++;
    if (created % 10 === 0) console.log(`  ... ${created} persons created`);
  }
  console.log(`  ✓ ${created} sample persons created\n`);

  // ═══════════════════════════════════════════
  // EDU DOMAINS
  // ═══════════════════════════════════════════

  const eduDomains = [
    { domain: 'tsinghua.edu.cn', nameZh: '清华大学', nameEn: 'Tsinghua University' },
    { domain: 'pku.edu.cn', nameZh: '北京大学', nameEn: 'Peking University' },
    { domain: 'ustc.edu.cn', nameZh: '中国科学技术大学', nameEn: 'USTC' },
    { domain: 'fudan.edu.cn', nameZh: '复旦大学', nameEn: 'Fudan University' },
    { domain: 'zju.edu.cn', nameZh: '浙江大学', nameEn: 'Zhejiang University' },
    { domain: 'sjtu.edu.cn', nameZh: '上海交通大学', nameEn: 'Shanghai Jiao Tong University' },
    { domain: 'nju.edu.cn', nameZh: '南京大学', nameEn: 'Nanjing University' },
    { domain: 'whu.edu.cn', nameZh: '武汉大学', nameEn: 'Wuhan University' },
    { domain: 'sysu.edu.cn', nameZh: '中山大学', nameEn: 'Sun Yat-sen University' },
    { domain: 'hit.edu.cn', nameZh: '哈尔滨工业大学', nameEn: 'Harbin Institute of Technology' },
    { domain: 'scu.edu.cn', nameZh: '四川大学', nameEn: 'Sichuan University' },
    { domain: 'xjtu.edu.cn', nameZh: '西安交通大学', nameEn: 'Xi\'an Jiaotong University' },
    { domain: 'tongji.edu.cn', nameZh: '同济大学', nameEn: 'Tongji University' },
    { domain: 'buaa.edu.cn', nameZh: '北京航空航天大学', nameEn: 'Beihang University' },
    { domain: 'nankai.edu.cn', nameZh: '南开大学', nameEn: 'Nankai University' },
  ];

  for (const domain of eduDomains) {
    await prisma.eduDomain.upsert({
      where: { domain: domain.domain },
      update: {},
      create: domain,
    });
  }
  console.log(`  ✓ ${eduDomains.length} EDU domains\n`);

  console.log('✅ Seed completed!');
  console.log('  Admin: admin@transparent-domain.org / admin123');
  console.log('  Community: community@example.edu / community123');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
