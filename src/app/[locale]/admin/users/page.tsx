'use client';

import { useTranslations } from 'next-intl';
import { Card, Badge } from '@/components/ui';

export default function AdminUsersPage() {
  const t = useTranslations('admin');

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('users')}</h1>
      <Card>
        <div className="p-6">
          <p className="text-gray-400 text-sm py-8 text-center">
            User management interface — to be implemented with a full user list API.
          </p>
        </div>
      </Card>
    </div>
  );
}
