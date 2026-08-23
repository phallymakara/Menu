import { useRef, type FC } from 'react'
import { Camera } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useOnboardingStore } from '../stores/useOnboardingStore'

export const Step2BranchSetup: FC = () => {
  const { language } = useLanguageStore()
  const { businessProfile, updateBusinessProfile, branch, updateBranch } = useOnboardingStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        updateBusinessProfile({ logo_url: event.target?.result as string })
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* 1. Brand Identity & Logo */}
      <div className="space-y-4">
        <label className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 block text-center sm:text-left">
          {language === 'km' ? '១. ព័ត៌មានម៉ាកយីហោ និងឡូហ្គោហាង' : '1. Store Brand & Logo'}
        </label>

        {/* Centered Clickable Circle Logo */}
        <div className="flex flex-col items-center justify-center py-2 space-y-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleLogoUpload}
            accept="image/*"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload store logo"
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-emerald-600 dark:hover:border-emerald-500 bg-zinc-50 dark:bg-zinc-900/60 flex flex-col items-center justify-center relative overflow-hidden transition-all group cursor-pointer focus:outline-none"
          >
            {businessProfile.logo_url ? (
              <>
                <img
                  src={businessProfile.logo_url}
                  alt="Store Logo"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[11px] font-semibold">
                  <Camera className="w-5 h-5 mb-0.5" />
                  <span>{language === 'km' ? 'ប្តូររូបភាព' : 'Change'}</span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                <Camera className="w-7 h-7 mb-1" />
                <span className="text-[11px] font-semibold">
                  {language === 'km' ? 'បញ្ចូលឡូហ្គោ' : 'Upload Logo'}
                </span>
              </div>
            )}
          </button>

          <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
            {language === 'km' ? 'PNG, JPG, WEBP' : 'PNG, JPG, WEBP'}
          </p>
        </div>

        {/* Row 2: Store Names */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block">
              {language === 'km' ? 'ឈ្មោះអាជីវកម្ម (អង់គ្លេស)' : 'Store Name (English)'} *
            </label>
            <input
              type="text"
              required
              value={businessProfile.name_en}
              onChange={(e) => updateBusinessProfile({ name_en: e.target.value })}
              placeholder="e.g. Siem Reap Bistro"
              className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-base focus:border-zinc-900 dark:focus:border-zinc-300 outline-none transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block">
              {language === 'km' ? 'ឈ្មោះអាជីវកម្ម (ខ្មែរ)' : 'Store Name (Khmer)'}
            </label>
            <input
              type="text"
              value={businessProfile.name_km}
              onChange={(e) => updateBusinessProfile({ name_km: e.target.value })}
              placeholder="ឧ. ភោជនីយដ្ឋាន សៀមរាប"
              className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-base focus:border-zinc-900 dark:focus:border-zinc-300 outline-none transition-colors"
            />
          </div>
        </div>
      </div>

      {/* 2. Branch Info */}
      <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
        <label className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 block">
          {language === 'km' ? '២. ព័ត៌មានសាខាដំបូង' : '2. First Branch Outlet Information'}
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block">
              {language === 'km' ? 'ឈ្មោះសាខា (អង់គ្លេស)' : 'Branch Name (English)'} *
            </label>
            <input
              type="text"
              required
              value={branch.name_en}
              onChange={(e) => {
                const nameEn = e.target.value
                const autoCode = nameEn.trim().slice(0, 3).toUpperCase() + '-01'
                updateBranch({ name_en: nameEn, branch_code: autoCode || 'MAIN-01' })
              }}
              placeholder="e.g. BKK Flagship Branch"
              className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-base focus:border-zinc-900 dark:focus:border-zinc-300 outline-none transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block">
              {language === 'km' ? 'ឈ្មោះសាខា (ខ្មែរ)' : 'Branch Name (Khmer)'}
            </label>
            <input
              type="text"
              value={branch.name_km}
              onChange={(e) => updateBranch({ name_km: e.target.value })}
              placeholder="ឧ. សាខាបឹងកេងកង"
              className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-base focus:border-zinc-900 dark:focus:border-zinc-300 outline-none transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block">
              {language === 'km' ? 'លេខទូរស័ព្ទទំនាក់ទំនង' : 'Store Contact Phone'} *
            </label>
            <input
              type="text"
              required
              value={branch.phone}
              onChange={(e) => updateBranch({ phone: e.target.value })}
              placeholder="012 345 678"
              className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-base focus:border-zinc-900 dark:focus:border-zinc-300 outline-none transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block">
              {language === 'km' ? 'អាសយដ្ឋានទីតាំង' : 'Physical Store Address'}
            </label>
            <input
              type="text"
              value={branch.address}
              onChange={(e) => updateBranch({ address: e.target.value })}
              placeholder="St 214, Boeung Keng Kang 1, Phnom Penh"
              className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-base focus:border-zinc-900 dark:focus:border-zinc-300 outline-none transition-colors"
            />
          </div>
        </div>
      </div>

      {/* 3. Operating Hours */}
      <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
        <label className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 block">
          {language === 'km' ? '៣. ម៉ោងបើកដំណើរការ (Operating Hours)' : '3. Operating Hours'}
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block">
              {language === 'km' ? 'ម៉ោងបើក (Opening Time)' : 'Opening Time'}
            </label>
            <input
              type="time"
              value={branch.opening_time}
              onChange={(e) => updateBranch({ opening_time: e.target.value })}
              className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-base focus:border-zinc-900 dark:focus:border-zinc-300 outline-none transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 block">
              {language === 'km' ? 'ម៉ោងបិទ (Closing Time)' : 'Closing Time'}
            </label>
            <input
              type="time"
              value={branch.closing_time}
              onChange={(e) => updateBranch({ closing_time: e.target.value })}
              className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-base focus:border-zinc-900 dark:focus:border-zinc-300 outline-none transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
