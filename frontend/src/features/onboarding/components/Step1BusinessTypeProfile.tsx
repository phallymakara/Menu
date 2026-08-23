import { type FC } from 'react'
import { Utensils, Coffee, Croissant, CupSoda, Store, Check } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { useOnboardingStore } from '../stores/useOnboardingStore'
import { BusinessType } from '../types/onboarding.types'

export const Step1BusinessTypeProfile: FC = () => {
  const { language } = useLanguageStore()
  const { businessProfile, updateBusinessProfile } = useOnboardingStore()

  const businessTypes: {
    type: BusinessType
    icon: any
    titleEn: string
    titleKm: string
    descEn: string
    descKm: string
  }[] = [
    {
      type: 'RESTAURANT',
      icon: Utensils,
      titleEn: 'Restaurant',
      titleKm: 'ភោជនីយដ្ឋាន',
      descEn: 'Full dine-in, multi-course stages & table QR',
      descKm: 'សេវាកម្មតុពេញលេញ ម្ហូបច្រើនវគ្គ និង QR លើតុ',
    },
    {
      type: 'CAFE',
      icon: Coffee,
      titleEn: 'Café & Coffee',
      titleKm: 'ហាងកាហ្វេ',
      descEn: 'Cup sizing, sweetness/ice mods & quick checkout',
      descKm: 'ជម្រើសទំហំកែវ កម្រិតផ្អែម/ទឹកកក និងគិតប្រាក់រហ័ស',
    },
    {
      type: 'BAKERY',
      icon: Croissant,
      titleEn: 'Bakery & Pastry',
      titleKm: 'ហាងនំប៉័ង',
      descEn: 'Packaged items, fresh daily batches & counter POS',
      descKm: 'នំស្រស់ប្រចាំថ្ងៃ ស្តុកដុំ និងគិតប្រាក់បញ្ជរ',
    },
    {
      type: 'DRINK_SHOP',
      icon: CupSoda,
      titleEn: 'Beverage / Tea',
      titleKm: 'ហាងភេសជ្ជៈ / តែគុជ',
      descEn: 'Topping modifiers (Boba, Jelly) & fast service',
      descKm: 'ជម្រើសថែម Topping (គុជ, ចាហួយ) និងចេញរហ័ស',
    },
    {
      type: 'FOOD_STALL',
      icon: Store,
      titleEn: 'Food Stall / Fast Food',
      titleKm: 'តូបអាហារ / អាហាររហ័ស',
      descEn: 'Rapid 1-tap counter ordering & buzzer pickup',
      descKm: 'កុម្ម៉ង់រហ័សត្រឹម ១ ចុច និងទទួលម្ហូបតាមលេខកូដ',
    },
  ]

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* 1. Business Type Selection */}
      <div className="space-y-3">
        <label className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 block">
          {language === 'km' ? 'ជ្រើសរើសប្រភេទអាជីវកម្មរបស់អ្នក' : 'Select Your Business Type'}
        </label>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {language === 'km'
            ? 'ប្រព័ន្ធនឹងកំណត់មុខងារ និងជម្រើសបន្ថែមឱ្យត្រូវតាមអាជីវកម្មរបស់អ្នកដោយស្វ័យប្រវត្តិ'
            : 'We will pre-configure smart modifiers and kitchen routing based on your choice'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
          {businessTypes.map((bt) => {
            const Icon = bt.icon
            const isSelected = businessProfile.business_type === bt.type
            return (
              <button
                type="button"
                key={bt.type}
                onClick={() => updateBusinessProfile({ business_type: bt.type })}
                className={`p-4 rounded-xl border text-left transition-all relative ${
                  isSelected
                    ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    isSelected
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-1">
                  <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                    {language === 'km' ? bt.titleKm : bt.titleEn}
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {language === 'km' ? bt.descKm : bt.descEn}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
