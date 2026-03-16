```javascript
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      Document, Packer, Paragraph, TextRun, HeadingLevel,
      AlignmentType, BorderStyle, ShadingType, WidthType,
      Table, TableRow, TableCell, PageBreak, Header, Footer,
      PageNumber, LevelFormat, TabStopType
    } = await import('docx');

    const { module, title, agency, content, metadata } = req.body;

    if (!module || !content) {
      return res.status(400).json({ error: 'Missing required fields: module, content' });
    }

    const moduleConfig = {
      research: {
        label: 'Capture Intelligence Brief',
        subtitle: 'Competitive Research & Agency Analysis',
        color: '1F3864'
      },
      winnability: {
        label: 'Winnability Assessment',
        subtitle: 'Pwin Score & Bid/No-Bid Analysis',
        color: '1F3864'
      },
      financial: {
        label: 'Financial & Pricing Analysis',
        subtitle: 'Cost Model & Revenue Projection',
        color: '1F3864'
      },
      digest: {
        label: 'Weekly Intelligence Digest',
        subtitle: 'Pipeline Summary & Opportunity Briefings',
        color: '1F3864'
      }
    };

    const cfg = moduleConfig[module] || { label: module, subtitle: '', color: '1F3864' };

    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const agencyDisplay = agency || 'HGI Pipeline';
    const titleDisplay = title || cfg.label;
    const truncatedTitle = titleDisplay.length > 55 ? titleDisplay.substring(0, 55) + '…' : titleDisplay;

    // ── HEADER & FOOTER ──────────────────────────────────────────────────────
    const headerConfig = {
      default: new Header({
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: `HGI — ${truncatedTitle}`, font: 'Arial', size: 18, color: '666666' }),
              new TextRun({ text: '\t', font: 'Arial' }),
              new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 18, color: '666666' })
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C9A84C', space: 1 } },
            spacing: { after: 120 }
          })
        ]
      }),
      first: new Header({ children: [] })
    };

    const footerConfig = {
      default: new Footer({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `Hammerman & Gainer LLC  ·  Confidential  ·  ${currentDate}`,
                font: 'Arial', size: 18, color: '888888'
              })
            ],
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'C9A84C', space: 1 } },
            spacing: { before: 120 }
          })
        ]
      })
    };

    const children = [];

    // ── COVER PAGE ────────────────────────────────────────────────────────────
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'HAMMERMAN & GAINER LLC', font: 'Arial', size: 56, bold: true, color: 'C9A84C' })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 1440, after: 200 }
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Established 1929  ·  97 Years of Excellence', font: 'Arial', size: 22, color: '888888' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 720 }
      }),
      new Paragraph({
        children: [new TextRun({ text: cfg.label.toUpperCase(), font: 'Arial', size: 36, bold: true, color: '1F3864' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C9A84C', space: 6 } }
      }),
      new Paragraph({
        children: [new TextRun({ text: cfg.subtitle, font: 'Arial', size: 24, color: '555555', italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 160, after: 480 }
      }),
      new Paragraph({
        children: [new TextRun({ text: titleDisplay, font: 'Arial', size: 28, bold: true, color: '1F3864' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [new TextRun({ text: agencyDisplay, font: 'Arial', size: 24, color: '444444' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [new TextRun({ text: currentDate, font: 'Arial', size: 20, color: '888888' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 720 }
      }),
      new Paragraph({
        children: [new TextRun({ text: 'CONFIDENTIAL — FOR INTERNAL USE ONLY', font: 'Arial', size: 18, bold: true, color: 'CC0000' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 }
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Prepared by HGI AI Capture System', font: 'Arial', size: 18, color: '888888' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Christopher J. Oney, President  ·  christophero@hgi-global.com  ·  504-982-5030', font: 'Arial', size: 18, color: '888888' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      }),
      new Paragraph({ children: [new PageBreak()] })
    );

    // ── METADATA SUMMARY TABLE (if provided) ─────────────────────────────────
    if (metadata && Object.keys(metadata).length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'OPPORTUNITY SNAPSHOT', font: 'Arial', size: 28, bold: true, color: '1F3864' })],
          spacing: { before: 240, after: 240 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1F3864', space: 1 } }
        })
      );

      const metaRows = Object.entries(metadata).filter(([k, v]) => v);
      if (metaRows.length > 0) {
        children.push(
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [2520, 6840],
            rows: metaRows.map(([key, val]) => new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: key.toUpperCase(), font: 'Arial', size: 20, bold: true, color: '1F3864' })] })],
                  width: { size: 2520, type: WidthType.DXA },
                  shading: { fill: 'EEF2F7', type: ShadingType.CLEAR },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 }
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: String(val), font: 'Arial', size: 20 })] })],
                  width: { size: 6840, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 }
                })
              ]
            }))
          })
        );
      }
      children.push(new Paragraph({ spacing: { after: 360 }, children: [] }));
    }

    // ── MAIN CONTENT ──────────────────────────────────────────────────────────
    children.push(
      new Paragraph({
        children: [new TextRun({ text: cfg.label.toUpperCase(), font: 'Arial', size: 28, bold: true, color: '1F3864' })],
        spacing: { before: 240, after: 240 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1F3864', space: 1 } }
      })
    );

    processContent(content, children, { Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat, BorderStyle });

    // ── DOCUMENT ASSEMBLY ─────────────────────────────────────────────────────
    const doc = new Document({
      numbering: {
        config: [{
          reference: 'hgi-bullets',
          levels: [{
            level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }]
        }, {
          reference: 'hgi-numbers',
          levels: [{
            level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }]
        }]
      },
      sections: [{
        properties: {
          titlePage: true,
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        headers: headerConfig,
        footers: footerConfig,
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const safeAgency = (agencyDisplay).replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
    const safeModule = cfg.label.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
    const filename = `HGI_${safeModule}_${safeAgency}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (error) {
    console.error('export-module error:', error);
    res.status(500).json({ error: error.message });
  }
}

// ── CONTENT PROCESSOR ─────────────────────────────────────────────────────────
// Handles markdown-ish AI output: ##/### headings, - bullets, numbered lists,
// bold (**text**), section dividers (---), and plain paragraphs.
function processContent(content, children, { Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat, BorderStyle }) {
  const lines = content.split('\n');
  let bulletBuffer = [];
  let numberBuffer = [];

  const flushBullets = () => {
    if (!bulletBuffer.length) return;
    bulletBuffer.forEach(item => {
      children.push(new Paragraph({
        children: parseInline(item, TextRun),
        numbering: { reference: 'hgi-bullets', level: 0 },
        spacing: { after: 100, line: 276 }
      }));
    });
    bulletBuffer = [];
  };

  const flushNumbers = () => {
    if (!numberBuffer.length) return;
    numberBuffer.forEach(item => {
      children.push(new Paragraph({
        children: parseInline(item, TextRun),
        numbering: { reference: 'hgi-numbers', level: 0 },
        spacing: { after: 100, line: 276 }
      }));
    });
    numberBuffer = [];
  };

  lines.forEach(line => {
    const t = line.trim();

    // Section divider
    if (t === '---' || t === '***') {
      flushBullets(); flushNumbers();
      children.push(new Paragraph({
        children: [],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD', space: 1 } },
        spacing: { before: 160, after: 160 }
      }));
      return;
    }

    // H2 heading
    if (t.startsWith('## ')) {
      flushBullets(); flushNumbers();
      children.push(new Paragraph({
        children: [new TextRun({ text: t.substring(3), font: 'Arial', size: 28, bold: true, color: '1F3864' })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 320, after: 140 }
      }));
      return;
    }

    // H3 heading
    if (t.startsWith('### ')) {
      flushBullets(); flushNumbers();
      children.push(new Paragraph({
        children: [new TextRun({ text: t.substring(4), font: 'Arial', size: 24, bold: true, color: '2E5DA6' })],
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 240, after: 100 }
      }));
      return;
    }

    // Numbered section headers like "1. AGENCY PROFILE"
    if (/^\d+\.\s+[A-Z\s&—-]{4,}$/.test(t)) {
      flushBullets(); flushNumbers();
      children.push(new Paragraph({
        children: [new TextRun({ text: t, font: 'Arial', size: 26, bold: true, color: '1F3864' })],
        spacing: { before: 320, after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C9A84C', space: 1 } }
      }));
      return;
    }

    // Bullet
    if (t.startsWith('- ') || t.startsWith('• ')) {
      flushNumbers();
      bulletBuffer.push(t.substring(2));
      return;
    }

    // Numbered item like "1. something" (not all-caps header)
    if (/^\d+\.\s/.test(t) && !/^[A-Z\s&—-]{4,}$/.test(t.replace(/^\d+\.\s+/, ''))) {
      flushBullets();
      numberBuffer.push(t.replace(/^\d+\.\s+/, ''));
      return;
    }

    // Blank line
    if (!t) {
      flushBullets(); flushNumbers();
      children.push(new Paragraph({ children: [], spacing: { after: 80 } }));
      return;
    }

    // Regular paragraph
    flushBullets(); flushNumbers();
    children.push(new Paragraph({
      children: parseInline(t, TextRun),
      spacing: { after: 140, line: 276 }
    }));
  });

  flushBullets();
  flushNumbers();
}

// Parse **bold** inline markdown
function parseInline(text, TextRun) {
  const runs = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  parts.forEach(part => {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), font: 'Arial', size: 24, bold: true }));
    } else if (part) {
      runs.push(new TextRun({ text: part, font: 'Arial', size: 24 }));
    }
  });
  return runs.length ? runs : [new TextRun({ text: '', font: 'Arial', size: 24 })];
}
```