/**
 * Playwright PDF Renderer
 * Generates pixel-perfect PDFs from HTML using headless Chromium
 */

import { chromium, Browser, BrowserContext } from 'playwright';

let browser: Browser | null = null;
let browserContext: BrowserContext | null = null;

// Print-specific CSS - aggressive spacing reduction for clean PDFs
const PRINT_CSS = `
@page {
  size: A4;
  margin: 12mm;
}

@media print {
  /* Reset */
  body {
    margin: 0;
    padding: 0;
    background: white !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    font-family: 'Times New Roman', 'DejaVu Serif', Georgia, serif;
  }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* CRITICAL: Remove ALL min-height - causes blank pages */
  * {
    min-height: 0 !important;
  }

  /* Remove page container styling */
  [class*="min-h-"],
  [class*="w-[210mm]"],
  [class*="max-w-[210mm]"] {
    min-height: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
  }

  /* Remove ALL bracket-based padding (p-[20mm], p-[30mm], etc) */
  [class*="p-["] {
    padding: 0 !important;
  }

  /* Remove shadows and decorative borders */
  .shadow-2xl, .shadow-xl, .shadow-lg, .shadow-md, .shadow {
    box-shadow: none !important;
  }

  .border-slate-300, .border-slate-100 {
    border-color: transparent !important;
  }

  /* Hide no-print */
  .no-print {
    display: none !important;
  }

  /* Page break controls */
  .page-break, .page-break-before {
    page-break-before: always !important;
    break-before: page !important;
  }

  .page-break-after {
    page-break-after: always !important;
    break-after: page !important;
  }

  .no-break, .page-break-inside-avoid {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  /* Keep signatures together */
  .flex.justify-between {
    break-inside: avoid !important;
  }

  /* Typography */
  h1, h2, h3, h4, h5, h6 {
    break-after: avoid !important;
  }

  p {
    orphans: 3;
    widows: 3;
  }

  .leading-relaxed {
    line-height: 1.35 !important;
  }

  /* === AGGRESSIVE MARGIN REDUCTION === */

  /* Bottom margins */
  .mb-1 { margin-bottom: 0.15rem !important; }
  .mb-2 { margin-bottom: 0.25rem !important; }
  .mb-3 { margin-bottom: 0.35rem !important; }
  .mb-4 { margin-bottom: 0.5rem !important; }
  .mb-6 { margin-bottom: 0.5rem !important; }
  .mb-8 { margin-bottom: 0.75rem !important; }
  .mb-10 { margin-bottom: 1rem !important; }
  .mb-12 { margin-bottom: 1rem !important; }
  .mb-16 { margin-bottom: 1.25rem !important; }
  .mb-20 { margin-bottom: 1.5rem !important; }
  .mb-32 { margin-bottom: 0 !important; }

  /* Top margins */
  .mt-4 { margin-top: 0.5rem !important; }
  .mt-6 { margin-top: 0.5rem !important; }
  .mt-8 { margin-top: 0.75rem !important; }
  .mt-10 { margin-top: 1rem !important; }
  .mt-12 { margin-top: 1rem !important; }
  .mt-16 { margin-top: 1.25rem !important; }
  .mt-20 { margin-top: 1.5rem !important; }

  /* Space-y (gap between children) */
  .space-y-1 > * + * { margin-top: 0.1rem !important; }
  .space-y-2 > * + * { margin-top: 0.2rem !important; }
  .space-y-3 > * + * { margin-top: 0.3rem !important; }
  .space-y-4 > * + * { margin-top: 0.4rem !important; }
  .space-y-6 > * + * { margin-top: 0.5rem !important; }
  .space-y-8 > * + * { margin-top: 0.6rem !important; }
  .space-y-12 > * + * { margin-top: 0.75rem !important; }

  /* Padding reduction */
  .p-4 { padding: 0.5rem !important; }
  .p-5 { padding: 0.6rem !important; }
  .p-6 { padding: 0.5rem !important; }
  .p-8 { padding: 0.6rem !important; }

  .pl-4 { padding-left: 0.5rem !important; }
  .pl-6 { padding-left: 0.75rem !important; }
  .ml-4 { margin-left: 0.5rem !important; }
  .ml-6 { margin-left: 0.75rem !important; }

  /* Indent */
  .indent-12 {
    text-indent: 1.5em !important;
  }

  /* Gap reduction */
  .gap-8 { gap: 1rem !important; }
  .gap-16 { gap: 1.5rem !important; }

  /* Rounded boxes - reduce padding */
  .rounded-2xl, .rounded-xl {
    padding: 0.5rem !important;
  }

  /* Flex/Grid layouts */
  .flex { display: flex !important; }
  .grid { display: grid !important; }

  /* Tables */
  table { break-inside: avoid !important; }
  thead { display: table-header-group; }
  tr { break-inside: avoid !important; }
}
`;

// Base HTML template that wraps the document content
const getHtmlTemplate = (content: string, additionalCss: string = '') => `
<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
  <style>
    /* Tailwind-like reset and utilities */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html {
      font-size: 16px;
      line-height: 1.5;
    }

    body {
      font-family: 'Times New Roman', 'DejaVu Serif', Georgia, serif;
      color: #000;
      background: #fff;
    }

    /* Tailwind utilities subset */
    .font-serif { font-family: 'Times New Roman', 'DejaVu Serif', Georgia, serif; }
    .font-sans { font-family: system-ui, -apple-system, sans-serif; }
    .font-bold { font-weight: 700; }
    .font-black { font-weight: 900; }
    .italic { font-style: italic; }
    .underline { text-decoration: underline; }
    .uppercase { text-transform: uppercase; }
    .lowercase { text-transform: lowercase; }
    .tracking-widest { letter-spacing: 0.1em; }
    .tracking-tight { letter-spacing: -0.025em; }
    .tracking-wide { letter-spacing: 0.025em; }

    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .text-justify { text-align: justify; }

    .text-black { color: #000; }
    .text-white { color: #fff; }
    .text-slate-400 { color: #94a3b8; }
    .text-slate-500 { color: #64748b; }
    .text-slate-900 { color: #0f172a; }
    .text-blue-600 { color: #2563eb; }
    .text-blue-900 { color: #1e3a8a; }
    .text-red-500 { color: #ef4444; }
    .text-red-600 { color: #dc2626; }
    .text-red-900 { color: #7f1d1d; }
    .text-emerald-600 { color: #059669; }

    .text-xs { font-size: 0.75rem; }
    .text-sm { font-size: 0.875rem; }
    .text-base { font-size: 1rem; }
    .text-lg { font-size: 1.125rem; }
    .text-xl { font-size: 1.25rem; }
    .text-2xl { font-size: 1.5rem; }
    .text-3xl { font-size: 1.875rem; }

    .text-\\[8pt\\] { font-size: 8pt; }
    .text-\\[9pt\\] { font-size: 9pt; }
    .text-\\[9\\.5pt\\] { font-size: 9.5pt; }
    .text-\\[10pt\\] { font-size: 10pt; }
    .text-\\[10\\.5pt\\] { font-size: 10.5pt; }
    .text-\\[11pt\\] { font-size: 11pt; }
    .text-\\[12pt\\] { font-size: 12pt; }
    .text-\\[13pt\\] { font-size: 13pt; }
    .text-\\[14pt\\] { font-size: 14pt; }
    .text-\\[7pt\\] { font-size: 7pt; }
    .text-\\[7\\.5pt\\] { font-size: 7.5pt; }

    .leading-relaxed { line-height: 1.625; }
    .leading-tight { line-height: 1.25; }
    .leading-none { line-height: 1; }

    .bg-white { background-color: #fff; }
    .bg-slate-50 { background-color: #f8fafc; }
    .bg-slate-100 { background-color: #f1f5f9; }
    .bg-blue-50 { background-color: #eff6ff; }
    .bg-red-50 { background-color: #fef2f2; }
    .bg-emerald-50 { background-color: #ecfdf5; }
    .bg-yellow-50 { background-color: #fefce8; }

    .border { border-width: 1px; border-style: solid; }
    .border-black { border-color: #000; }
    .border-slate-200 { border-color: #e2e8f0; }
    .border-slate-300 { border-color: #cbd5e1; }
    .border-slate-400 { border-color: #94a3b8; }
    .border-blue-100 { border-color: #dbeafe; }
    .border-blue-200 { border-color: #bfdbfe; }
    .border-red-200 { border-color: #fecaca; }
    .border-red-500 { border-color: #ef4444; }
    .border-emerald-200 { border-color: #a7f3d0; }

    .border-b { border-bottom-width: 1px; border-bottom-style: solid; }
    .border-t { border-top-width: 1px; border-top-style: solid; }
    .border-l { border-left-width: 1px; border-left-style: solid; }
    .border-r { border-right-width: 1px; border-right-style: solid; }
    .border-l-2 { border-left-width: 2px; }
    .border-l-4 { border-left-width: 4px; }
    .border-b-2 { border-bottom-width: 2px; }

    .rounded { border-radius: 0.25rem; }
    .rounded-lg { border-radius: 0.5rem; }
    .rounded-xl { border-radius: 0.75rem; }
    .rounded-2xl { border-radius: 1rem; }

    .p-1 { padding: 0.25rem; }
    .p-1\\.5 { padding: 0.375rem; }
    .p-2 { padding: 0.5rem; }
    .p-2\\.5 { padding: 0.625rem; }
    .p-3 { padding: 0.75rem; }
    .p-4 { padding: 1rem; }
    .p-5 { padding: 1.25rem; }
    .p-6 { padding: 1.5rem; }
    .p-\\[8mm\\] { padding: 8mm; }
    .p-\\[20mm\\] { padding: 20mm; }

    .px-1 { padding-left: 0.25rem; padding-right: 0.25rem; }
    .px-10 { padding-left: 2.5rem; padding-right: 2.5rem; }
    .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
    .pt-4 { padding-top: 1rem; }
    .pt-8 { padding-top: 2rem; }
    .pb-1 { padding-bottom: 0.25rem; }
    .pb-2 { padding-bottom: 0.5rem; }
    .pb-0\\.5 { padding-bottom: 0.125rem; }
    .pl-4 { padding-left: 1rem; }
    .pl-6 { padding-left: 1.5rem; }
    .pl-8 { padding-left: 2rem; }
    .pl-12 { padding-left: 3rem; }

    .m-0 { margin: 0; }
    .mb-1 { margin-bottom: 0.25rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mb-3 { margin-bottom: 0.75rem; }
    .mb-4 { margin-bottom: 1rem; }
    .mb-6 { margin-bottom: 1.5rem; }
    .mb-8 { margin-bottom: 2rem; }
    .mb-10 { margin-bottom: 2.5rem; }
    .mb-12 { margin-bottom: 3rem; }
    .mb-16 { margin-bottom: 4rem; }
    .mt-1 { margin-top: 0.25rem; }
    .mt-2 { margin-top: 0.5rem; }
    .mt-4 { margin-top: 1rem; }
    .mt-6 { margin-top: 1.5rem; }
    .mt-8 { margin-top: 2rem; }
    .mt-10 { margin-top: 2.5rem; }
    .mt-12 { margin-top: 3rem; }
    .mt-16 { margin-top: 4rem; }
    .mt-20 { margin-top: 5rem; }
    .my-6 { margin-top: 1.5rem; margin-bottom: 1.5rem; }

    .flex { display: flex; }
    .inline-block { display: inline-block; }
    .block { display: block; }
    .grid { display: grid; }
    .hidden { display: none; }

    .flex-col { flex-direction: column; }
    .flex-1 { flex: 1 1 0%; }
    .shrink-0 { flex-shrink: 0; }

    .items-start { align-items: flex-start; }
    .items-center { align-items: center; }
    .items-end { align-items: flex-end; }
    .justify-between { justify-content: space-between; }
    .justify-center { justify-content: center; }

    .space-x-2 > * + * { margin-left: 0.5rem; }
    .space-x-3 > * + * { margin-left: 0.75rem; }
    .space-y-1 > * + * { margin-top: 0.25rem; }
    .space-y-2 > * + * { margin-top: 0.5rem; }
    .space-y-3 > * + * { margin-top: 0.75rem; }
    .space-y-4 > * + * { margin-top: 1rem; }
    .space-y-6 > * + * { margin-top: 1.5rem; }

    .gap-2 { gap: 0.5rem; }
    .gap-3 { gap: 0.75rem; }
    .gap-8 { gap: 2rem; }
    .gap-16 { gap: 4rem; }

    .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
    .col-span-1 { grid-column: span 1 / span 1; }
    .col-span-2 { grid-column: span 2 / span 2; }

    .w-full { width: 100%; }
    .w-10 { width: 2.5rem; }
    .w-12 { width: 3rem; }
    .w-24 { width: 6rem; }
    .w-28 { width: 7rem; }
    .w-40 { width: 10rem; }
    .w-\\[45\\%\\] { width: 45%; }
    .w-\\[200px\\] { width: 200px; }
    .w-\\[180px\\] { width: 180px; }
    .max-w-\\[210mm\\] { max-width: 210mm; }

    .h-10 { height: 2.5rem; }
    .h-16 { height: 4rem; }
    .h-px { height: 1px; }
    .min-h-\\[1\\.2em\\] { min-height: 1.2em; }
    .min-h-\\[3\\.5em\\] { min-height: 3.5em; }
    .min-h-\\[297mm\\] { min-height: 297mm; }

    .overflow-hidden { overflow: hidden; }

    .list-disc { list-style-type: disc; }
    .list-none { list-style-type: none; }

    /* Additional spacing utilities */
    .space-y-1 > * + * { margin-top: 0.25rem; }
    .space-y-2 > * + * { margin-top: 0.5rem; }
    .space-y-3 > * + * { margin-top: 0.75rem; }
    .space-y-4 > * + * { margin-top: 1rem; }
    .space-y-6 > * + * { margin-top: 1.5rem; }
    .space-y-8 > * + * { margin-top: 2rem; }

    /* Border utilities */
    .border-t { border-top-width: 1px; border-top-style: solid; }
    .border-slate-200 { border-color: #e2e8f0; }
    .rounded-xl { border-radius: 0.75rem; }

    /* Strong/bold */
    strong { font-weight: bold; }

    .break-words { word-wrap: break-word; overflow-wrap: break-word; }
    .whitespace-nowrap { white-space: nowrap; }

    .shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }

    /* Table specific */
    table { border-collapse: collapse; }
    .border-collapse { border-collapse: collapse; }

    ${PRINT_CSS}
    ${additionalCss}
  </style>
</head>
<body>
  ${content}
</body>
</html>
`;

/**
 * Initialize browser instance (lazy)
 */
async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ]
    });
  }
  return browser;
}

/**
 * Get or create browser context
 */
async function getContext(): Promise<BrowserContext> {
  const b = await getBrowser();
  if (!browserContext) {
    browserContext = await b.newContext({
      viewport: { width: 794, height: 1123 }, // A4 at 96 DPI
      deviceScaleFactor: 2, // High DPI for crisp text
    });
  }
  return browserContext;
}

/**
 * Generate PDF from HTML content
 */
export async function generatePDF(html: string, additionalCss: string = ''): Promise<Buffer> {
  const context = await getContext();
  const page = await context.newPage();

  try {
    // Set full HTML document
    const fullHtml = getHtmlTemplate(html, additionalCss);
    await page.setContent(fullHtml, { waitUntil: 'networkidle' });

    // Wait for fonts to load
    await page.evaluate(() => document.fonts.ready);

    // CRITICAL: Force remove min-height styles but preserve break-inside for no-break elements
    await page.evaluate(() => {
      // Remove min-height from ALL elements
      document.querySelectorAll('*').forEach((el) => {
        const htmlEl = el as HTMLElement;
        // Force min-height to 0
        htmlEl.style.minHeight = '0';

        // Remove min-h classes
        if (htmlEl.className && typeof htmlEl.className === 'string') {
          htmlEl.className = htmlEl.className
            .replace(/min-h-\[[^\]]+\]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        }
      });

      // Ensure no-break elements have proper break-inside style
      document.querySelectorAll('.no-break, .page-break-inside-avoid').forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.pageBreakInside = 'avoid';
        htmlEl.style.breakInside = 'avoid';
      });
    });

    // Small delay to ensure changes are applied
    await page.waitForTimeout(50);

    // Generate PDF with deterministic settings
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '12mm',
        bottom: '12mm',
        left: '12mm',
        right: '12mm'
      },
      scale: 1,
      displayHeaderFooter: false,
      preferCSSPageSize: false,
    });

    return pdfBuffer;
  } finally {
    await page.close();
  }
}

/**
 * Cleanup browser resources
 */
export async function closeBrowser(): Promise<void> {
  if (browserContext) {
    await browserContext.close();
    browserContext = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});
