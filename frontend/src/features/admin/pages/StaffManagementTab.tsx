import { useState, type FC } from 'react'
import {
  Plus,
  Trash2,
  Lock,
  Phone,
  Mail,
  X,
} from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'
import { Button } from '@/components/ui/Button'
import type { StaffMember } from '../types/admin.types'

export const StaffManagementTab: FC = () => {
  const { language } = useLanguageStore()
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false)

  const [staffList, setStaffList] = useState<StaffMember[]>([
    {
      id: 'st-1',
      full_name: 'Phally Makara',
      phone: '012 345 678',
      email: 'owner@bistro.com',
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
      role: 'CHEF',
      pin_code: '7788',
      is_active: true,
      created_at: '2026-08-16',
    },
  ])

  // New Staff Form State
  const [newStaff, setNewStaff] = useState({
    full_name: '',
    phone: '',
    email: '',
    role: 'CASHIER' as StaffMember['role'],
    pin_code: '',
  })

  const handleDeleteStaff = (staffId: string) => {
    setStaffList(staffList.filter((s) => s.id !== staffId))
  }

  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStaff.full_name.trim() || !newStaff.phone.trim() || !newStaff.pin_code) return
    const created: StaffMember = {
      id: `st-${Date.now()}`,
      full_name: newStaff.full_name,
      phone: newStaff.phone,
      email: newStaff.email || null,
      role: newStaff.role,
      pin_code: newStaff.pin_code,
      is_active: true,
      created_at: new Date().toISOString().split('T')[0],
    }
    setStaffList([...staffList, created])
    setNewStaff({
      full_name: '',
      phone: '',
      email: '',
      role: 'CASHIER',
      pin_code: '',
    })
    setIsAddStaffModalOpen(false)
  }

  const getRoleBadge = (role: StaffMember['role']) => {
    switch (role) {
      case 'OWNER':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40'
      case 'MANAGER':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40'
      case 'CASHIER':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40'
      case 'WAITER':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40'
      case 'CHEF':
        return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40'
    }
  }

  return (
    <div className="space-y-6 max-w-5xl animate-in fade-in duration-150">
      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50 tracking-tight">
            {language === 'km' ? 'បុគ្គលិក & សិទ្ធិ' : 'Staff & Role Permissions'}
          </h1>
          <p className="text-sm text-zinc-500">
            {language === 'km'
              ? 'គ្រប់គ្រងគណនីបុគ្គលិក តួនាទី និងលេខកូដសម្ងាត់ (PIN) សម្រាប់ចូលផ្ទាំង POS'
              : 'Manage staff accounts, access permissions, and 4-digit PINs for POS terminals.'}
          </p>
        </div>

        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => setIsAddStaffModalOpen(true)}
          className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          {language === 'km' ? 'បន្ថែមបុគ្គលិកថ្មី' : 'Add Staff Member'}
        </Button>
      </div>

      {/* Staff Members List (Zero Shadows, Clean Flat Border) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {staffList.map((staff) => (
          <div
            key={staff.id}
            className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col justify-between space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-800 dark:text-zinc-200">
                  {staff.full_name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-950 dark:text-zinc-50">
                    {staff.full_name}
                  </h3>
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold mt-0.5 ${getRoleBadge(staff.role)}`}>
                    {staff.role}
                  </span>
                </div>
              </div>

              {staff.role !== 'OWNER' && (
                <button
                  type="button"
                  onClick={() => handleDeleteStaff(staff.id)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="text-xs text-zinc-500 space-y-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-zinc-400" />
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{staff.phone}</span>
              </div>
              {staff.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{staff.email}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-zinc-400" />
                <span>POS PIN: <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">••••</span> ({staff.pin_code})</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Add Staff Member */}
      {isAddStaffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setIsAddStaffModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 z-10">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-lg text-zinc-950 dark:text-zinc-50">
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
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {language === 'km' ? 'ឈ្មោះពេញ (Full Name)' : 'Full Name'} *
                </label>
                <input
                  type="text"
                  required
                  value={newStaff.full_name}
                  onChange={(e) => setNewStaff({ ...newStaff, full_name: e.target.value })}
                  placeholder="e.g. Sokha Rith"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {language === 'km' ? 'លេខទូរស័ព្ទ' : 'Phone Number'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={newStaff.phone}
                    onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                    placeholder="012 345 678"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {language === 'km' ? 'កូដសម្ងាត់ (PIN 4 ខ្ទង់)' : 'POS PIN (4 digits)'} *
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    value={newStaff.pin_code}
                    onChange={(e) => setNewStaff({ ...newStaff, pin_code: e.target.value })}
                    placeholder="1234"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-mono text-center outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {language === 'km' ? 'តួនាទី (Role)' : 'Role'} *
                </label>
                <select
                  value={newStaff.role}
                  onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as StaffMember['role'] })}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none"
                >
                  <option value="CASHIER">Cashier (គិតលុយ)</option>
                  <option value="WAITER">Waiter (រត់តុ)</option>
                  <option value="CHEF">Kitchen Chef (ចុងភៅ)</option>
                  <option value="MANAGER">Store Manager (អ្នកគ្រប់គ្រង)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
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
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
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
