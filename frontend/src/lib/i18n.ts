/**
 * Bilingual Translation Dictionary (Khmer & English)
 */

export type Language = 'en' | 'km'

export const translations = {
  en: {
    // Brand & App
    appName: 'E-Menu',
    appTagline: 'Smart QR Menu & POS Platform',
    poweredBy: 'Powered by E-Menu SaaS',

    // Navigation & Common
    home: 'Home',
    pricing: 'Pricing',
    features: 'Features',
    howItWorks: 'How It Works',
    login: 'Staff Login',
    register: 'Create Workspace',
    dashboard: 'Dashboard',
    search: 'Search menu items...',
    categories: 'Categories',
    all: 'All',
    viewCart: 'View Cart',
    cart: 'Order Cart',
    close: 'Close',
    back: 'Back',
    confirm: 'Confirm',
    cancel: 'Cancel',
    loading: 'Loading...',
    save: 'Save',
    edit: 'Edit',
    delete: 'Delete',
    success: 'Success',
    error: 'Error',
    language: 'Language',
    theme: 'Theme',

    // Guest Ordering
    table: 'Table',
    scanToOrder: 'Scan to Order',
    openSession: 'Start Ordering',
    placeOrder: 'Place Order',
    orderSummary: 'Order Summary',
    specialInstructions: 'Special instructions (e.g. less sugar, no ice)',
    addModifiers: 'Customize options',
    selectVariant: 'Select size',
    addToCart: 'Add to Order',
    quantity: 'Quantity',
    yourOrder: 'Your Order',
    orderSent: 'Order sent to kitchen!',
    callWaiter: 'Call Waiter',
    requestBill: 'Request Bill',
    payNow: 'Pay with Bakong KHQR',

    // Course Stages
    courseStage: 'Course Stage',
    drinks: 'Drinks',
    appetizers: 'Appetizers',
    mains: 'Mains',
    desserts: 'Desserts',
    digestifs: 'Digestifs',

    // Order & Item Statuses
    queued: 'Queued',
    preparing: 'Preparing',
    ready: 'Ready',
    served: 'Served',
    voided: 'Cancelled',

    // Financials & Payments
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'VAT Tax',
    serviceCharge: 'Service Charge',
    total: 'Grand Total',
    cash: 'Cash',
    bakongKHQR: 'Bakong KHQR',
    tendered: 'Tendered Amount',
    change: 'Change',
    paySuccess: 'Payment settled successfully!',

    // Marketing Landing Page
    heroHeadline: 'Instant QR Menu, Zero Effort',
    heroSubheadline: 'The modern bilingual QR digital menu, real-time Kitchen Display (KDS), and Bakong KHQR payment system for Cambodian restaurants & cafés.',
    getStartedFree: 'Get Started Free',
    enterEmail: 'Enter your email address',
    liveDemoTitle: 'Experience Live Demo',
    liveDemoScan: 'Scan this QR code with your phone camera to test live mobile ordering:',
    trustedBy: 'Proudly serving restaurants and cafés across Cambodia',
    freePlan: 'Starter Free',
    proPlan: 'Pro Multi-Outlet',
    enterprisePlan: 'Enterprise Unlimited',
  },
  km: {
    // Brand & App
    appName: 'មីនុយ',
    appTagline: 'ប្រព័ន្ធមីនុយ QR និង POS ឆ្លាតវៃ',
    poweredBy: 'ដំណើរការដោយ E-Menu SaaS',

    // Navigation & Common
    home: 'ទំព័រដើម',
    pricing: 'តម្លៃសេវាកម្ម',
    features: 'មុខងារសំខាន់ៗ',
    howItWorks: 'របៀបប្រើប្រាស់',
    login: 'ចូលប្រព័ន្ធ',
    register: 'ចុះឈ្មោះហាង',
    dashboard: 'ផ្ទាំងគ្រប់គ្រង',
    search: 'ស្វែងរកម្ហូប ឬភេសជ្ជៈ...',
    categories: 'ជំពូកមុខម្ហូប',
    all: 'ទាំងអស់',
    viewCart: 'មើលកន្ត្រក',
    cart: 'កន្ត្រកកម្ម៉ង់',
    close: 'បិទ',
    back: 'ត្រឡប់ក្រោយ',
    confirm: 'បញ្ជាក់',
    cancel: 'បោះបង់',
    loading: 'កំពុងដំណើរការ...',
    save: 'រក្សាទុក',
    edit: 'កែប្រែ',
    delete: 'លុប',
    success: 'ជោគជ័យ',
    error: 'មានបញ្ហា',
    language: 'ភាសា',
    theme: 'ទម្រង់ពណ៌',

    // Guest Ordering
    table: 'តុលេខ',
    scanToOrder: 'ស្កេនដើម្បីកុម្ម៉ង់',
    openSession: 'ចាប់ផ្តើមកុម្ម៉ង់',
    placeOrder: 'បញ្ជូនការកុម្ម៉ង់',
    orderSummary: 'សេចក្តីសង្ខេបការកុម្ម៉ង់',
    specialInstructions: 'ចំណាំពិសេស (ឧ. ស្ករតិច មិនយកទឹកកក)',
    addModifiers: 'ជ្រើសរើសជម្រើសបន្ថែម',
    selectVariant: 'ជ្រើសរើសទំហំ',
    addToCart: 'ដាក់ចូលកន្ត្រក',
    quantity: 'ចំនួន',
    yourOrder: 'ការកុម្ម៉ង់របស់អ្នក',
    orderSent: 'បានបញ្ជូនការកុម្ម៉ង់ទៅផ្ទះបាយ!',
    callWaiter: 'ហៅបុគ្គលិក',
    requestBill: 'គិតប្រាក់',
    payNow: 'ទូទាត់ជាមួយបាគង KHQR',

    // Course Stages
    courseStage: 'វគ្គម្ហូប',
    drinks: 'ភេសជ្ជៈ',
    appetizers: 'ម្ហូបញ៉ាំលេង',
    mains: 'ម្ហូបចម្បង',
    desserts: 'បង្អែម',
    digestifs: 'ភេសជ្ជៈបង្ហើយ',

    // Order & Item Statuses
    queued: 'ក្នុងជួរ',
    preparing: 'កំពុងចម្អិន',
    ready: 'រួចរាល់',
    served: 'បានជូន',
    voided: 'បានបោះបង់',

    // Financials & Payments
    subtotal: 'សរុបបឋម',
    discount: 'បញ្ចុះតម្លៃ',
    tax: 'ពន្ធអាករ (VAT)',
    serviceCharge: 'ថ្លៃសេវាកម្ម',
    total: 'សរុបចុងក្រោយ',
    cash: 'សាច់ប្រាក់',
    bakongKHQR: 'បាគង KHQR',
    tendered: 'ប្រាក់ទទួល',
    change: 'ប្រាក់អាប់',
    paySuccess: 'ការទូទាត់បានជោគជ័យ!',

    // Marketing Landing Page
    heroHeadline: 'មីនុយ QR ឌីជីថលទាន់សម័យ ងាយស្រួលបំផុត',
    heroSubheadline: 'ប្រព័ន្ធមីនុយ QR ពីរសភា (ខ្មែរ-អង់គ្លេស) ផ្ទាំងផ្ទះបាយ (KDS) និងប្រព័ន្ធទូទាត់បាគង KHQR ទំនើបសម្រាប់ភោជនីយដ្ឋាន និងហាងកាហ្វេកម្ពុជា។',
    getStartedFree: 'សាកល្បងឥតគិតថ្លៃ',
    enterEmail: 'បញ្ចូលអ៊ីមែលរបស់អ្នក',
    liveDemoTitle: 'សាកល្បងកុម្ម៉ង់ផ្ទាល់',
    liveDemoScan: 'ស្កេន QR កូដនេះជាមួយទូរស័ព្ទដៃដើម្បីសាកល្បងកុម្ម៉ង់ភ្លាមៗ:',
    trustedBy: 'ផ្តល់ទំនុកចិត្តដោយភោជនីយដ្ឋាន និងហាងកាហ្វេល្បីៗនៅកម្ពុជា',
    freePlan: 'កញ្ចប់សាកល្បង Free',
    proPlan: 'កញ្ចប់ Pro ច្រើនសាខា',
    enterprisePlan: 'កញ្ចប់ Enterprise គ្មានដែនកំណត់',
  },
} as const

export type TranslationKey = keyof typeof translations.en
