import { useState } from 'react';
import { Globe, Settings as SettingsIcon } from 'lucide-react';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import PlatformLanguagesEditor from '../../components/admin/PlatformLanguagesEditor';

type SettingsSection = 'languages';

export default function Settings() {
  const [section, setSection] = useState<SettingsSection>('languages');

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Settings"
        description="Platform configuration for the guest experience and reservations."
        icon={<SettingsIcon size={26} />}
      />

      <div className="flex flex-wrap gap-1 bg-white p-1 rounded-xl mb-6 border border-gray-100 w-full sm:w-fit shadow-sm">
        <button
          type="button"
          onClick={() => setSection('languages')}
          className={`flex items-center px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            section === 'languages'
              ? 'bg-vailo-teal text-white shadow-sm'
              : 'text-gray-500 hover:text-vailo-teal hover:bg-vailo-surface-elevated'
          }`}
        >
          <Globe size={16} className="mr-2 shrink-0" />
          Languages
        </button>
      </div>

      {section === 'languages' && <PlatformLanguagesEditor />}
    </div>
  );
}
