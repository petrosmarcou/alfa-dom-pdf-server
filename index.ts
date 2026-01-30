/**
 * PDF Generation Server
 * Express server with Playwright for pixel-perfect PDF exports
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { generatePDF } from './pdfRenderer.js';

const app = express();
const PORT = process.env.PORT || process.env.PDF_SERVER_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'pdf-generator' });
});

/**
 * PDF Generation Endpoint
 * Accepts HTML content and returns a PDF file
 */
app.post('/api/render-pdf', async (req: Request, res: Response) => {
  try {
    const { html, filename = 'document.pdf', css = '' } = req.body;

    if (!html) {
      res.status(400).json({ error: 'HTML content is required' });
      return;
    }

    console.log(`[PDF] Generating: ${filename}`);
    const startTime = Date.now();

    const pdfBuffer = await generatePDF(html, css);

    console.log(`[PDF] Generated ${filename} in ${Date.now() - startTime}ms (${(pdfBuffer.length / 1024).toFixed(1)}KB)`);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[PDF] Generation error:', error);
    res.status(500).json({
      error: 'PDF generation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[PDF Server] Running on http://localhost:${PORT}`);
  console.log(`[PDF Server] Endpoint: POST /api/render-pdf`);
});
