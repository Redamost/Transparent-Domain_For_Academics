// Aggressive cleanup: delete Fudan V1/V2 junk entries
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const NAV_PATTERNS = [
  '组织架构', '党委分工', '行政分工', '人才工作小组', '人事工作小组',
  '职能部门', '历史沿革', '退休教师名录', '人才培养', '本科生教学',
  '专业介绍', '培养方案', '研究生教学', '招生信息', '教学成果',
  '精品课程', '一流课程', '教学成果奖', '课程思政', '课程建设',
  '建设成果', '非全专硕', '学位申请', '教工之家', '相关文档',
  '科研快讯', '科研成果', '党建思政', '理论学习', '学院概况',
  '师资队伍', '学生工作', '对外交流', '校友中心', '学院简介',
  '学院领导', '机构设置', '下载中心', '新闻中心', '通知公告',
  '招生就业', '就业信息', '学生内部网', '教师内部网',
  '会议室预订', '当前位置', '关于我们', '联系我们', '网站地图',
  '院长寄语', '学院架构', '博士后', '教辅行政', '光荣退休',
  '院士', '杰出人才', '荣誉学衔', '教研系列', '研究系列',
  '教学系列', '工程系列', '讲座信息', '学科建设', '科研基地',
  '科研项目', '产学研合作', '党团建设', '校友工作', '发展联络',
];

async function main() {
  let totalDeleted = 0;

  // Delete entries with navigation text names
  for (const name of NAV_PATTERNS) {
    const count = await prisma.person.count({
      where: { institution: '复旦大学', isActive: true, nameZh: name },
    });
    if (count > 0) {
      await prisma.person.updateMany({
        where: { institution: '复旦大学', isActive: true, nameZh: name },
        data: { isActive: false, metadata: { deactivated: true, reason: 'fudan_junk_nav', deactivatedAt: new Date().toISOString() } },
      });
      totalDeleted += count;
      console.log(`Deleted ${count}x "${name}"`);
    }
  }

  // Delete entries with department-level email (cs_school@fudan.edu.cn) that are likely nav pages
  const deptEmailEntries = await prisma.person.findMany({
    where: {
      institution: '复旦大学', isActive: true,
      email: 'cs_school@fudan.edu.cn',
      nameZh: { notIn: ['张鹏', '张奇', '叶广楠', '薛莘', '陈荣华', '朱东来', '王李霞', '熊贇', '冯红伟', '冯颖欣', '陈辰', '张玥杰', '朱元婷', '朱莉'] },
    },
    select: { id: true, nameZh: true },
  });

  // Only delete if name doesn't look like a real person (2-4 CJK with no nav keywords)
  const realNamePattern = /^[一-鿿]{2,4}$/;
  let deptEmailDeleted = 0;
  for (const entry of deptEmailEntries) {
    if (!realNamePattern.test(entry.nameZh || '')) {
      await prisma.person.update({
        where: { id: entry.id },
        data: { isActive: false, metadata: { deactivated: true, reason: 'fudan_junk_dept_email', deactivatedAt: new Date().toISOString() } },
      });
      deptEmailDeleted++;
    }
  }
  console.log(`\nDeleted ${deptEmailDeleted} entries with department email and non-name text`);

  totalDeleted += deptEmailDeleted;
  console.log(`\nTotal deleted: ${totalDeleted}`);

  const fudanTotal = await prisma.person.count({ where: { institution: '复旦大学', isActive: true } });
  console.log(`Fudan remaining: ${fudanTotal}`);

  const dbTotal = await prisma.person.count({ where: { isActive: true } });
  console.log(`Total DB: ${dbTotal}`);

  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
