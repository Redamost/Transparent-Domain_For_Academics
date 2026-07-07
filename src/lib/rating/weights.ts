import { ScoreCategory } from '@/generated/prisma/client';

export interface CategoryInfo {
  key: ScoreCategory;
  labelZh: string;
  labelEn: string;
  descriptionZh: string;
  descriptionEn: string;
  weight: number;
}

export const CATEGORY_INFO: Record<ScoreCategory, CategoryInfo> = {
  RESEARCH_QUALITY: {
    key: 'RESEARCH_QUALITY',
    labelZh: '研究质量',
    labelEn: 'Research Quality',
    descriptionZh: '基于已发表研究的质量评估',
    descriptionEn: 'Quality of published research',
    weight: 0.30,
  },
  METHODOLOGY_RIGOR: {
    key: 'METHODOLOGY_RIGOR',
    labelZh: '方法论严谨性',
    labelEn: 'Methodology Rigor',
    descriptionZh: '研究方法论的严谨程度',
    descriptionEn: 'Rigor of research methodology',
    weight: 0.25,
  },
  COLLABORATION_ETHICS: {
    key: 'COLLABORATION_ETHICS',
    labelZh: '合作伦理',
    labelEn: 'Collaboration Ethics',
    descriptionZh: '学术合作中的伦理行为',
    descriptionEn: 'Ethical conduct in academic collaboration',
    weight: 0.15,
  },
  CITATION_INTEGRITY: {
    key: 'CITATION_INTEGRITY',
    labelZh: '引用诚信',
    labelEn: 'Citation Integrity',
    descriptionZh: '引用行为的诚信度',
    descriptionEn: 'Integrity of citation practices',
    weight: 0.15,
  },
  PEER_RECOGNITION: {
    key: 'PEER_RECOGNITION',
    labelZh: '同行认可',
    labelEn: 'Peer Recognition',
    descriptionZh: '来自学术同行的认可和荣誉',
    descriptionEn: 'Recognition and honors from academic peers',
    weight: 0.10,
  },
  COMMUNITY_FEEDBACK: {
    key: 'COMMUNITY_FEEDBACK',
    labelZh: '社区反馈',
    labelEn: 'Community Feedback',
    descriptionZh: '来自透明领域社区的监督反馈',
    descriptionEn: 'Community oversight feedback from Transparent Domain',
    weight: 0.05,
  },
};
