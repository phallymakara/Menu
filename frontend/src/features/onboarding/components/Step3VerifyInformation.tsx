import { type FC } from 'react'
import {
  Utensils,
  Coffee,
  Croissant,
  CupSoda,
  Store,
  Building2,
  Clock,
  Phone,
  MapPin,
  Pencil,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useOnboardingStore } from '../stores/useOnboardingStore'
import { BusinessType } from '../types/onboarding.types'

export const Step3VerifyInformation: FC = () => {
  const { language } = useLanguageStore()
  const isKm = language === 'km'
  const { businessProfile, branch, setStep } = useOnboardingStore()

  const typeDetails: Record<
    BusinessType,
    { icon: any; titleKm: string; titleEn: string; descKm: string; descEn: string }
  > = {
    RESTAURANT: {
      icon: Utensils,
      titleKm: 'ភោជនីយដ្ឋាន',
      titleEn: 'Restaurant',
      descKm: 'សេវាកម្មតុពេញលេញ ម្ហូបច្រើនវគ្គ និង QR លើតុ',
      descEn: 'Full dine-in, multi-course stages & table QR',
    },
    CAFE: {
      icon: Coffee,
      titleKm: 'ហាងកាហ្វេ',
      titleEn: 'Café & Coffee',
      descKm: 'ជម្រើសទំហំកែវ កម្រិតផ្អែម/ទឹកកក និងគិតប្រាក់រហ័ស',
      descEn: 'Cup sizing, sweetness/ice mods & quick checkout',
    },
    BAKERY: {
      icon: Croissant,
      titleKm: 'ហាងនំប៉័ង',
      titleEn: 'Bakery & Pastry',
      descKm: 'នំស្រស់ប្រចាំថ្ងៃ ស្តុកដុំ និងគិតប្រាក់បញ្ជរ',
      descEn: 'Packaged items, fresh daily batches & counter POS',
    },
    DRINK_SHOP: {
      icon: CupSoda,
      titleKm: 'ហាងភេសជ្ជៈ / តែគុជ',
      titleEn: 'Beverage / Tea',
      descKm: 'ជម្រើសថែម Topping (គុជ, ចាហួយ) និងចេញរហ័ស',
      descEn: 'Topping modifiers (Boba, Jelly) & fast service',
    },
    FOOD_STALL: {
      icon: Store,
      titleKm: 'តូបអាហារ / អាហាររហ័ស',
      titleEn: 'Food Stall / Fast Food',
      descKm: 'កុម្ម៉ង់រហ័សត្រឹម ១ ចុច និងទទួលម្ហូបតាមលេខកូដ',
      descEn: 'Rapid 1-tap counter ordering & buzzer pickup',
    },
  }

  const selectedType = typeDetails[businessProfile.business_type] || typeDetails.RESTAURANT
  const TypeIcon = selectedType.icon

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Verification Notice - Text Only */}
      <div className="space-y-1.5 pb-2">
        <h3 className="text-base sm:text-lg font-bold text-zinc-950 dark:text-zinc-50">
          {isKm ? 'ផ្ទៀងផ្ទាត់ព័ត៌មានអាជីវកម្មរបស់អ្នក' : 'Verify Your Business Information'}
        </h3>
        <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {isKm
            ? 'សូមពិនិត្យផ្ទៀងផ្ទាត់ព័ត៌មានខាងក្រោមឱ្យបានត្រឹមត្រូវ មុននឹងចុចបញ្ចប់ការរៀបចំ។ លោកអ្នកអាចកែប្រែព័ត៌មានទាំងនេះបានគ្រប់ពេលក្នុង Settings។'
            : 'Please review and verify the details below before completing setup. You can always update these anytime in your Settings.'}
        </p>
      </div>

      {/* List of Verified Steps - Clean without nested containers */}
      <div className="space-y-8 pt-2">
        {/* 1. Business Type */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
              {isKm ? '១. ប្រភេទអាជីវកម្ម' : '1. Business Type'}
            </span>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>{isKm ? 'កែប្រែ' : 'Edit'}</span>
            </button>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <TypeIcon className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                {isKm ? selectedType.titleKm : selectedType.titleEn}
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {isKm ? selectedType.descKm : selectedType.descEn}
              </p>
            </div>
          </div>
        </div>

        {/* 2. Store Brand Profile */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
              {isKm ? '២. ព័ត៌មានម៉ាកយីហោ' : '2. Store Brand'}
            </span>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>{isKm ? 'កែប្រែ' : 'Edit'}</span>
            </button>
          </div>

          <div className="flex items-center gap-3.5">
            {businessProfile.logo_url ? (
              <img
                src={businessProfile.logo_url}
                alt="Store Logo"
                className="w-10 h-10 rounded-full object-cover border border-zinc-200 dark:border-zinc-700 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-400 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
            )}
            <div className="space-y-0.5 truncate">
              <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100 truncate">
                {businessProfile.name_en || (isKm ? 'គ្មានឈ្មោះ' : 'No Name')}
              </h4>
              {businessProfile.name_km && (
                <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate">
                  {businessProfile.name_km}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 3. Branch Details */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
              {isKm ? '៣. ព័ត៌មានសាខាដំបូង' : '3. First Branch'}
            </span>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>{isKm ? 'កែប្រែ' : 'Edit'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {branch.name_en} {branch.name_km ? `(${branch.name_km})` : ''}
              </span>
            </div>

            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <Phone className="w-4 h-4 text-zinc-400 shrink-0" />
              <span>{branch.phone || (isKm ? 'គ្មានលេខទូរស័ព្ទ' : 'No Phone Provided')}</span>
            </div>

            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <MapPin className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="truncate">{branch.address || (isKm ? 'គ្មានអាសយដ្ឋាន' : 'No Address Provided')}</span>
            </div>
          </div>
        </div>

        {/* 4. Operating Hours */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
              {isKm ? '៤. ម៉ោងបើកដំណើរការ' : '4. Operating Hours'}
            </span>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>{isKm ? 'កែប្រែ' : 'Edit'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-zinc-600 dark:text-zinc-400">{isKm ? 'ម៉ោងបើក:' : 'Opening:'}</span>
              <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                {branch.opening_time || (isKm ? 'មិនបានកំណត់' : 'Not set')}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="text-zinc-600 dark:text-zinc-400">{isKm ? 'ម៉ោងបិទ:' : 'Closing:'}</span>
              <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                {branch.closing_time || (isKm ? 'មិនបានកំណត់' : 'Not set')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
