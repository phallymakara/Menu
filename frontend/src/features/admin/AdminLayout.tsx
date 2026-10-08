import { useState, useRef, useEffect, type FC } from 'react'
import { Outlet } from 'react-router-dom'
import { AdminHeader } from './components/AdminHeader'
import { AdminSidebar } from './components/AdminSidebar'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useLanguageStore } from '@/stores/useLanguageStore'

export const AdminLayout: FC = () => {
  const { language } = useLanguageStore()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('emenu_desktop_sidebar_open')
    return saved !== null ? saved === 'true' : true
  })

  // Pointer & touch coordinates for drag / move gesture detection
  const dragStartXRef = useRef<number | null>(null)
  const dragStartYRef = useRef<number | null>(null)

  const handleToggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setDesktopSidebarOpen((prev) => {
        const next = !prev
        localStorage.setItem('emenu_desktop_sidebar_open', String(next))
        return next
      })
    } else {
      setMobileSidebarOpen((prev) => !prev)
    }
  }

  // Pointer down for drag detection on desktop/mobile
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    dragStartXRef.current = e.clientX
    dragStartYRef.current = e.clientY
  }

  // Pointer up to determine if user moved/swiped left (hide) or right (show)
  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragStartXRef.current === null) return
    const deltaX = e.clientX - dragStartXRef.current
    const deltaY = e.clientY - (dragStartYRef.current ?? e.clientY)

    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (window.innerWidth >= 1024) {
        if (deltaX < -40 && desktopSidebarOpen) {
          setDesktopSidebarOpen(false)
          localStorage.setItem('emenu_desktop_sidebar_open', 'false')
        } else if (deltaX > 40 && !desktopSidebarOpen) {
          setDesktopSidebarOpen(true)
          localStorage.setItem('emenu_desktop_sidebar_open', 'true')
        }
      } else {
        if (deltaX < -40 && mobileSidebarOpen) {
          setMobileSidebarOpen(false)
        }
      }
    }

    dragStartXRef.current = null
    dragStartYRef.current = null
  }

  // Mobile edge swipe listener (swipe from left edge to open mobile drawer)
  useEffect(() => {
    let edgeTouchStartX = 0
    let edgeTouchStartY = 0

    const onTouchStart = (e: TouchEvent) => {
      edgeTouchStartX = e.touches[0].clientX
      edgeTouchStartY = e.touches[0].clientY
    }

    const onTouchEnd = (e: TouchEvent) => {
      const deltaX = e.changedTouches[0].clientX - edgeTouchStartX
      const deltaY = e.changedTouches[0].clientY - edgeTouchStartY
      if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (window.innerWidth < 1024) {
          if (edgeTouchStartX < 40 && deltaX > 50 && !mobileSidebarOpen) {
            setMobileSidebarOpen(true)
          }
        }
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [mobileSidebarOpen])

  return (
    <div className="h-screen h-[100dvh] overflow-hidden bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col selection:bg-emerald-600 selection:text-white">
      <AdminHeader onToggleSidebar={handleToggleSidebar} />

      <div className="flex-1 min-h-0 min-w-0 flex overflow-hidden relative">
        {/* Desktop Sidebar Rail: fixed w-20 flex placeholder so main content never shifts */}
        <div className="hidden lg:block shrink-0 w-20 h-full relative z-30">
          <div
            className={`absolute top-0 left-0 h-full bg-white dark:bg-zinc-950 transition-[width] duration-300 ease-in-out motion-reduce:transition-none z-30 ${
              desktopSidebarOpen ? 'w-64 border-r border-zinc-200 dark:border-zinc-800' : 'w-20'
            }`}
          >
            <div className="w-full h-full">
              <AdminSidebar isCollapsed={!desktopSidebarOpen} />
            </div>

            {/* Move / Toggle Button on Sidebar Border */}
            <button
              type="button"
              onClick={() => {
                setDesktopSidebarOpen(!desktopSidebarOpen)
                localStorage.setItem('emenu_desktop_sidebar_open', String(!desktopSidebarOpen))
              }}
              title={
                desktopSidebarOpen
                  ? (language === 'km' ? 'បង្រួមម៉ឺនុយ (បង្ហាញតែរូបតំណាង)' : 'Collapse sidebar (Icons only)')
                  : (language === 'km' ? 'ពង្រីកម៉ឺនុយ' : 'Expand sidebar')
              }
              aria-label={desktopSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              className="absolute top-5 -right-3.5 z-40 w-7 h-7 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 flex items-center justify-center transition-all cursor-pointer shadow-none"
            >
              {desktopSidebarOpen ? (
                <ChevronLeft className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Sidebar with swipe-to-close gesture */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              className="relative w-64 max-w-[80vw] bg-white dark:bg-zinc-950 h-full z-50 flex flex-col border-r border-zinc-200 dark:border-zinc-800 rounded-r-3xl overflow-hidden shadow-none transition-transform duration-300 ease-in-out"
            >
              <div className="p-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
                <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  {language === 'km' ? 'ម៉ឺនុយរដ្ឋបាល' : 'Menu Admin'}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(false)}
                  className="p-1.5 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shadow-none"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <AdminSidebar onCloseMobile={() => setMobileSidebarOpen(false)} />
              </div>
            </div>
          </div>
        )}

        {/* Main Content Viewport - independently scrollable, dynamically stretches */}
        <main className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden px-2.5 pt-2 pb-6 sm:px-3 sm:pt-2.5 lg:px-3.5 lg:pt-2.5 w-full max-w-full">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
