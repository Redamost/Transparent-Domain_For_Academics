// Assign research fields based on department name for scholars without bio
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Department name → Field slug mapping
const DEPT_FIELD_MAP: Array<{ deptPattern: RegExp; fieldSlug: string; fieldName: string }> = [
  { deptPattern: /计算机|软件|计算/, fieldSlug: 'computer-science', fieldName: '计算机科学与技术' },
  { deptPattern: /人工智能|智能|AI/, fieldSlug: 'artificial-intelligence', fieldName: '人工智能' },
  { deptPattern: /电子[^商]|信息[^管]|通信|微电子|电路/, fieldSlug: 'electronic-engineering', fieldName: '电子工程' },
  { deptPattern: /自动化|控制/, fieldSlug: 'automation', fieldName: '自动化' },
  { deptPattern: /数学|统计|计算数学/, fieldSlug: 'mathematics', fieldName: '数学' },
  { deptPattern: /物理/, fieldSlug: 'physics', fieldName: '物理学' },
  { deptPattern: /化学/, fieldSlug: 'chemistry', fieldName: '化学' },
  { deptPattern: /生物|生命|医学|遗传/, fieldSlug: 'biology', fieldName: '生物医学' },
  { deptPattern: /网络[^安]|互联/, fieldSlug: 'network-engineering', fieldName: '网络工程' },
  { deptPattern: /网络空间|信息安|密码/, fieldSlug: 'cybersecurity', fieldName: '网络空间安全' },
  { deptPattern: /数据[^库]|大数据/, fieldSlug: 'data-science', fieldName: '数据科学' },
  { deptPattern: /电气|电机|电力/, fieldSlug: 'electrical-engineering', fieldName: '电气工程' },
  { deptPattern: /机械|制造/, fieldSlug: 'mechanical-engineering', fieldName: '机械工程' },
  { deptPattern: /土木|建筑|规划/, fieldSlug: 'civil-engineering', fieldName: '土木工程' },
  { deptPattern: /航天|航空|飞行/, fieldSlug: 'aerospace-engineering', fieldName: '航空航天' },
  { deptPattern: /材料/, fieldSlug: 'materials-science', fieldName: '材料科学' },
  { deptPattern: /环境|能源/, fieldSlug: 'environmental-science', fieldName: '环境科学' },
  { deptPattern: /管理|经济|金融|工商/, fieldSlug: 'management', fieldName: '管理科学' },
  { deptPattern: /法学|法律/, fieldSlug: 'law', fieldName: '法学' },
  { deptPattern: /新闻|传媒|传播/, fieldSlug: 'communication', fieldName: '新闻传播' },
];

async function main() {
  // Find scholars without fields but with department
  const scholars = await prisma.person.findMany({
    where: {
      isActive: true,
      fields: { none: {} },
      department: { not: null },
    },
    select: { id: true, nameZh: true, department: true, institution: true },
  });

  console.log(`Found ${scholars.length} scholars without fields but with department\n`);

  // Also find or create field records
  const allFields = await prisma.field.findMany();
  const fieldMap = new Map(allFields.map(f => [f.slug, f]));

  let totalAssigned = 0;

  for (const scholar of scholars) {
    const dept = scholar.department || '';
    const matchedFields: string[] = [];

    for (const { deptPattern, fieldSlug, fieldName } of DEPT_FIELD_MAP) {
      if (deptPattern.test(dept)) {
        // Ensure field exists in DB
        let field = fieldMap.get(fieldSlug);
        if (!field) {
          field = await prisma.field.upsert({
            where: { slug: fieldSlug },
            create: { slug: fieldSlug, nameZh: fieldName, nameEn: fieldName, level: 0 },
            update: {},
          });
          fieldMap.set(fieldSlug, field);
        }
        matchedFields.push(field.id);
      }
    }

    if (matchedFields.length > 0) {
      // Create PersonField associations
      for (const fieldId of matchedFields) {
        await prisma.personField.upsert({
          where: { personId_fieldId: { personId: scholar.id, fieldId } },
          create: { personId: scholar.id, fieldId, isPrimary: false },
          update: {},
        });
      }
      totalAssigned++;
      if (totalAssigned <= 20) {
        console.log(`  ${scholar.nameZh} (${scholar.institution}) dept:"${dept}" → ${matchedFields.length} fields`);
      }
    }
  }

  console.log(`\nAssigned fields to ${totalAssigned} scholars via department matching`);

  // Final counts
  const total = await prisma.person.count({ where: { isActive: true } });
  const withFields = await prisma.person.count({ where: { isActive: true, fields: { some: {} } } });
  console.log(`\nFields coverage: ${withFields}/${total} (${(withFields/total*100).toFixed(1)}%)`);

  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
