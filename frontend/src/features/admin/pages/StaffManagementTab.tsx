import { useState, type FC } from 'react'
import {
  Plus,
  Trash2,
  Phone,
  Mail,
  X,
  Eye,
  EyeOff,
  Camera,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import type { StaffMember } from '../types/admin.types'

export const StaffManagementTab: FC = () => {
  const { language } = useLanguageStore()
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false)
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({})
  const [selectedStaffIdForPhoto, setSelectedStaffIdForPhoto] = useState<string | null>(null)

  const togglePinVisibility = (staffId: string) => {
    setRevealedPins((prev) => ({ ...prev, [staffId]: !prev[staffId] }))
  }

  const [staffList, setStaffList] = useState<StaffMember[]>([
    {
      id: 'st-1',
      full_name: 'Phally Makara',
      phone: '012 345 678',
      email: 'owner@bistro.com',
      avatar_url: null,
      role: 'OWNER',
      pin_code: '1234',
      is_active: true,
      created_at: '2026-08-01',
    },
    {
      id: 'st-2',
      full_name: 'Sokha Rith',
      phone: '089 998 877',
      email: 'sokha@bistro.com',
      avatar_url: null,
      role: 'CASHIER',
      pin_code: '2580',
      is_active: true,
      created_at: '2026-08-10',
    },
    {
      id: 'st-3',
      full_name: 'Vannak Chem',
      phone: '097 554 321',
      email: null,
      avatar_url: null,
      role: 'WAITER',
      pin_code: '3691',
      is_active: true,
      created_at: '2026-08-15',
    },
    {
      id: 'st-4',
      full_name: 'Chef Bunthorn',
      phone: '070 112 233',
      email: null,
      avatar_url: null,
      role: 'CHEF',
      pin_code: '7788',
      is_active: true,
      created_at: '2026-08-20',
    },
  ])

  // Form State for Adding Staff
  const [newStaff, setNewStaff] = useState({
    full_name: '',
    phone: '',
    email: '',
    avatar_url: null as string | null,
    role: 'WAITER' as StaffMember['role'],
    pin_code: '',
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const validateForm = () => {
    const errs: Record<string, string> = {}
    if (!newStaff.full_name.trim()) {
      errs.full_name = language === 'km' ? 'សូមបញ្ចូលឈ្មោះបុគ្គលិក' : 'Staff full name is required'
    }
    if (!newStaff.phone.trim()) {
      errs.phone = language === 'km' ? 'សូមបញ្ចូលលេខទូរស័ព្ទ' : 'Phone number is required'
    }
    if (!newStaff.pin_code || newStaff.pin_code.length !== 4) {
      errs.pin_code = language === 'km' ? 'លេខកូដ PIN ត្រូវតែមាន ៤ ខ្ទង់' : 'PIN code must be exactly 4 digits'
    }
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleDeleteStaff = (id: string) => {
    setStaffList(staffList.filter((s) => s.id !== id))
  }

  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    const staff: StaffMember = {
      id: `st-${Date.now()}`,
      full_name: newStaff.full_name,
      phone: newStaff.phone,
      email: newStaff.email.trim() || null,
      avatar_url: newStaff.avatar_url,
      role: newStaff.role,
      pin_code: newStaff.pin_code,
      is_active: true,
      created_at: new Date().toISOString().split('T')[0],
    }

    setStaffList([...staffList, staff])
    setNewStaff({
      full_name: '',
      phone: '',
      email: '',
      avatar_url: null,
      role: 'WAITER',
      pin_code: '',
    })
    setFormErrors({})
    setIsAddStaffModalOpen(false)
  }

  const handleNewStaffAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      setNewStaff((prev) => ({ ...prev, avatar_url: url }))
    }
  }

  const handleRowAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && selectedStaffIdForPhoto) {
      const url = URL.createObjectURL(file)
      setStaffList((prev) =>
        prev.map((s) => (s.id === selectedStaffIdForPhoto ? { ...s, avatar_url: url } : s))
      )
      setSelectedStaffIdForPhoto(null)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Hidden File input for changing photo directly on row */}
      <input
        id="change-staff-avatar-input"
        type="file"
        accept="image/*"
        onChange={handleRowAvatarChange}
        className="hidden"
      />

      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
            {language === 'km' ? 'បុគ្គលិក & សិទ្ធិ' : 'Staff & Role Permissions'}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            {language === 'km'
              ? 'គ្រប់គ្រងគណនីបុគ្គលិក តួនាទី រូបថត និងលេខកូដសម្ងាត់ (PIN) សម្រាប់ចូលផ្ទាំង POS'
              : 'Manage staff accounts, roles, profile photos, and 4-digit PINs for POS terminals.'}
          </p>
        </div>

        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => {
            setFormErrors({})
            setIsAddStaffModalOpen(true)
          }}
          className="text-sm font-semibold px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          {language === 'km' ? 'បន្ថែមបុគ្គលិកថ្មី' : 'Add Staff Member'}
        </Button>
      </div>

      {/* Single Column Row List */}
      <div className="space-y-2.5">
        {staffList.map((staff) => {
          const isPinVisible = !!revealedPins[staff.id]

          return (
            <div
              key={staff.id}
              className="p-4 sm:px-5 sm:py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col md:grid md:grid-cols-[280px_180px_1fr_auto] items-start md:items-center gap-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
            >
              {/* Left: Avatar with Change Photo Trigger & Identity */}
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="relative group/avatar shrink-0">
                  <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center font-bold text-base text-zinc-800 dark:text-zinc-200 overflow-hidden">
                    {staff.avatar_url ? (
                      <img src={staff.avatar_url} alt={staff.full_name} className="w-full h-full object-cover" />
                    ) : (
                      staff.full_name.charAt(0)
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStaffIdForPhoto(staff.id)
                      document.getElementById('change-staff-avatar-input')?.click()
                    }}
                    title={language === 'km' ? 'ប្តូររូបថត' : 'Change photo'}
                    className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center text-white transition-opacity cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>

                <div className="min-w-0">
                  <h3 className="font-bold text-base text-zinc-950 dark:text-zinc-50 truncate">
                    {staff.full_name}
                  </h3>
                  <div className="mt-0.5 text-xs font-semibold text-zinc-500 tracking-wide uppercase">
                    {staff.role}
                  </div>
                </div>
              </div>

              {/* Column 2: Phone Number */}
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span>{staff.phone}</span>
              </div>

              {/* Column 3: Email */}
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                {staff.email ? (
                  <span className="truncate">{staff.email}</span>
                ) : (
                  <span className="text-zinc-400 dark:text-zinc-600">{language === 'km' ? 'គ្មានអ៊ីមែល' : 'No email'}</span>
                )}
              </div>

              {/* Column 4: POS PIN & Action */}
              <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="text-zinc-500 font-medium">POS:</span>
                  <span className="font-mono font-bold tracking-wider text-zinc-900 dark:text-zinc-100 text-sm">
                    {isPinVisible ? staff.pin_code : '••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => togglePinVisibility(staff.id)}
                    title={isPinVisible ? 'Hide PIN' : 'Show PIN'}
                    className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors ml-0.5"
                  >
                    {isPinVisible ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {staff.role !== 'OWNER' ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteStaff(staff.id)}
                    title={language === 'km' ? 'លុបគណនី' : 'Delete Staff'}
                    className="p-2 rounded-lg text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <div className="w-8" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal: Add Staff Member */}
      {isAddStaffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setIsAddStaffModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 z-10">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-base text-zinc-950 dark:text-zinc-50">
                {language === 'km' ? 'បន្ថែមបុគ្គលិកថ្មី' : 'Add Staff Member'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddStaffModalOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-4">
              {/* Profile Image Picker */}
              <div className="flex flex-col items-center justify-center space-y-1.5 pb-1">
                <div
                  onClick={() => document.getElementById('staff-avatar-upload')?.click()}
                  className="relative w-20 h-20 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 bg-zinc-50 dark:bg-zinc-900 flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors group"
                >
                  {newStaff.avatar_url ? (
                    <>
                      <img src={newStaff.avatar_url} alt="Staff Avatar" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[11px] font-semibold">
                        {language === 'km' ? 'ប្តូររូប' : 'Change'}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-zinc-400 group-hover:text-emerald-600 transition-colors">
                      <Camera className="w-5 h-5 mb-0.5" />
                      <span className="text-[11px] font-medium">{language === 'km' ? 'រូបថត' : 'Photo'}</span>
                    </div>
                  )}
                </div>
                <input
                  id="staff-avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleNewStaffAvatar}
                  className="hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                  {language === 'km' ? 'ឈ្មោះពេញ (Full Name)' : 'Full Name'} *
                </label>
                <input
                  type="text"
                  value={newStaff.full_name}
                  onChange={(e) => {
                    setNewStaff({ ...newStaff, full_name: e.target.value })
                    if (formErrors.full_name) setFormErrors((prev) => ({ ...prev, full_name: '' }))
                  }}
                  placeholder="e.g. Sokha Rith"
                  className={`w-full px-3.5 py-2.5 rounded-lg border bg-white dark:bg-zinc-950 text-sm outline-none transition-colors ${
                    formErrors.full_name
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                  }`}
                />
                {formErrors.full_name && (
                  <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                    {formErrors.full_name}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                    {language === 'km' ? 'លេខទូរស័ព្ទ' : 'Phone Number'} *
                  </label>
                  <input
                    type="text"
                    value={newStaff.phone}
                    onChange={(e) => {
                      setNewStaff({ ...newStaff, phone: e.target.value })
                      if (formErrors.phone) setFormErrors((prev) => ({ ...prev, phone: '' }))
                    }}
                    placeholder="012 345 678"
                    className={`w-full px-3.5 py-2.5 rounded-lg border bg-white dark:bg-zinc-950 text-sm outline-none transition-colors ${
                      formErrors.phone
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                    }`}
                  />
                  {formErrors.phone && (
                    <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                      {formErrors.phone}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                    {language === 'km' ? 'កូដសម្ងាត់ (PIN 4 ខ្ទង់)' : 'POS PIN (4 digits)'} *
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={newStaff.pin_code}
                    onChange={(e) => {
                      setNewStaff({ ...newStaff, pin_code: e.target.value })
                      if (formErrors.pin_code) setFormErrors((prev) => ({ ...prev, pin_code: '' }))
                    }}
                    placeholder="••••"
                    className={`w-full px-3.5 py-2.5 rounded-lg border bg-white dark:bg-zinc-950 text-sm font-mono text-center outline-none transition-colors ${
                      formErrors.pin_code
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100'
                    }`}
                  />
                  {formErrors.pin_code && (
                    <div className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                      {formErrors.pin_code}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                  {language === 'km' ? 'អ៊ីមែល (បើមាន)' : 'Email (Optional)'}
                </label>
                <input
                  type="email"
                  value={newStaff.email}
                  onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                  placeholder="e.g. staff@bistro.com"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                  {language === 'km' ? 'តួនាទី (Role)' : 'Role'} *
                </label>
                <select
                  value={newStaff.role}
                  onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as StaffMember['role'] })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors"
                >
                  <option value="CASHIER">Cashier (គិតលុយ)</option>
                  <option value="WAITER">Waiter (រត់តុ)</option>
                  <option value="CHEF">Kitchen Chef (ចុងភៅ)</option>
                  <option value="MANAGER">Store Manager (អ្នកគ្រប់គ្រង)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setIsAddStaffModalOpen(false)}
                >
                  {language === 'km' ? 'បោះបង់' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="text-sm font-semibold px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {language === 'km' ? 'រក្សាទុក' : 'Save Staff'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
