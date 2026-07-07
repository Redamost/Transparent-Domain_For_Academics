import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';

export function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className="relative mt-auto border-t border-white/[0.06] bg-white/[0.02] backdrop-blur-sm"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8"
        >
          <div>
            <h3
              className="text-sm text-white/80 tracking-tight"
              style={{ fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif', fontWeight: 300 }}
            >透明领域</h3>
            <p className="text-[11px] text-white/25 mt-0.5 uppercase tracking-wider"
            >Transparent Domain</p>
            <p className="text-xs text-white/40 mt-3 leading-relaxed"
            >
              解构学术迷雾，重建透明秩序。
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[11px] text-white/35 mb-2.5 uppercase tracking-wider"
            >{t('about')}</h4>
            <p className="text-xs text-white/40 leading-relaxed"
            >
              致力于建立开放、透明的科研评价体系，让学术贡献得到真实反映。
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[11px] text-white/35 mb-2.5 uppercase tracking-wider"
            >Legal</h4>
            <ul className="space-y-1.5 text-xs text-white/40"
            >
              <li><Link href="/legal/privacy" className="hover:text-white/70 transition-colors duration-300"
              >{t('privacy')}</Link></li>
              <li><Link href="/legal/terms" className="hover:text-white/70 transition-colors duration-300"
              >{t('terms')}</Link></li>
              <li><Link href="/legal/disclaimer" className="hover:text-white/70 transition-colors duration-300"
              >{t('disclaimer')}</Link></li>
            </ul>
          </div>
          <div className="flex flex-col justify-between"
          >
            <div className="text-xs text-white/40 leading-relaxed"
            >
              <p>平台数据由社区共同维护，</p>
              <p>仅供参考，不构成任何正式评价。</p>
            </div>
            <p className="text-[11px] text-white/25 mt-3 tracking-wide"
            >
              &copy; {new Date().getFullYear()} {t('rights')}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
