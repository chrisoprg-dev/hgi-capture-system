```javascript
// api/export-opportunity.js
// HGI Opportunity Decision Brief — comprehensive leadership package
// Pulls all intelligence from Supabase for a given opportunity ID,
// assembles a polished Word doc for Lou, Candy, and leadership to make bid decisions.

export const config = { maxDuration: 45 };

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { opportunityId } = req.body;
    if (!opportunityId) return res.status(400).json({ error: 'opportunityId required' });

    // ── PULL OPPORTUNITY FROM DB ──────────────────────────────────────────────
    const { data: opp, error } = await supabase
      .from('opportunities')
      .select('*')
      .eq('id', opportunityId)
      .single();

    if (error || !opp) return res.status(404).json({ error: 'Opportunity not found' });

    const {
      Document, Packer, Paragraph, TextRun, HeadingLevel,
      AlignmentType, BorderStyle, ShadingType, WidthType,
      Table, TableRow, TableCell, PageBreak, Header, Footer,
      PageNumber, LevelFormat, TabStopType
    } = await import('docx');

    // ── DERIVE KEY FIELDS ─────────────────────────────────────────────────────
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const title = opp.title || 'Unnamed Opportunity';
    const agency = opp.agency || 'Unknown Agency';
    const truncTitle = title.length > 55 ? title.substring(0, 55) + '…' : title;

    // Parse recommendation from capture_action
    let recommendation = 'PENDING';
    let pwin = null;
    let recColor = '888888';
    if (opp.capture_action) {
      const pwinMatch = opp.capture_action.match(/PWIN:\s*(\d+)%/i);
      if (pwinMatch) pwin = parseInt(pwinMatch[1]);
      if (/NO-BID/i.test(opp.capture_action)) { recommendation = 'NO-BID'; recColor = 'CC0000'; }
      else if (/CONDITIONAL GO/i.test(opp.capture_action)) { recommendation = 'CONDITIONAL GO'; recColor = 'E07B00'; }
      else if (/\bGO\b/i.test(opp.capture_action)) { recommendation = 'GO'; recColor = '1E7C34'; }
    }

    // Parse OPI tier
    const opi = opp.opi_score || 0;
    const tier = opi >= 90 ? 'Tier 1 — Auto-Pursue' : opi >= 75 ? 'Tier 1 — Strong Pursue' : opi >= 60 ? 'Tier 2 — Monitor' : 'Tier 3 — Low Priority';

    // Deadline
    const deadline = opp.due_date || 'Not specified';
    const daysLeft = opp.days_until_deadline;

    // ── HEADER & FOOTER ───────────────────────────────────────────────────────
    const headerConfig = {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({ text: `HGI DECISION BRIEF — ${truncTitle}`, font: 'Arial', size: 18, color: '666666' }),
            new TextRun({ text: '\t', font: 'Arial' }),
            new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 18, color: '666666' })
          ],
          tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C9A84C', space: 1 } },
          spacing: { after: 120 }
        })]
      }),
      first: new Header({ children: [] })
    };

    const footerConfig = {
      default: new Footer({
        children: [new Paragraph({
          children: [new TextRun({
            text: `Hammerman & Gainer LLC  ·  CONFIDENTIAL — Internal Use Only  ·  ${currentDate}`,
            font: 'Arial', size: 18, color: '888888'
          })],
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'C9A84C', space: 1 } },
          spacing: { before: 120 }
        })]
      })
    };

    const children = [];
    const border = { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' };
    const borders = { top: border, bottom: border, left: border, right: border };

    const cell = (text, width, opts = {}) => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: String(text || '—'), font: 'Arial', size: opts.size || 22, bold: opts.bold, color: opts.color || '111111' })]
      })],
      width: { size: width, type: WidthType.DXA },
      shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
      borders,
      margins: { top: 80, bottom: 80, left: 120, right: 120 }
    });

    const labelCell = (text, width) => cell(text, width, { fill: 'EEF2F7', bold: true, color: '1F3864', size: 20 });

    // ── COVER PAGE ────────────────────────────────────────────────────────────
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'HAMMERMAN & GAINER LLC', font: 'Arial', size: 56, bold: true, color: 'C9A84C' })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 1440, after: 160 }
      }),
      new Paragraph({
        children: [new TextRun({ text: 'OPPORTUNITY DECISION BRIEF', font: 'Arial', size: 32, bold: true, color: '1F3864' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C9A84C', space: 6 } }
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Prepared by HGI AI Capture System  ·  For Leadership Review', font: 'Arial', size: 20, color: '888888', italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 600 }
      }),
      new Paragraph({
        children: [new TextRun({ text: title, font: 'Arial', size: 36, bold: true, color: '1F3864' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [new TextRun({ text: agency, font: 'Arial', size: 26, color: '444444' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 }
      }),
      // Big recommendation badge
      new Paragraph({
        children: [new TextRun({ text: `BID RECOMMENDATION:  ${recommendation}`, font: 'Arial', size: 40, bold: true, color: recColor })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      }),
      pwin !== null ? new Paragraph({
        children: [new TextRun({ text: `Win Probability: ${pwin}%  ·  OPI Score: ${opi}/100  ·  ${tier}`, font: 'Arial', size: 22, color: '555555' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 }
      }) : new Paragraph({ children: [], spacing: { after: 480 } }),
      new Paragraph({
        children: [new TextRun({ text: `Deadline: ${deadline}${daysLeft ? `  (${daysLeft} days remaining)` : ''}`, font: 'Arial', size: 22, bold: true, color: daysLeft && daysLeft < 7 ? 'CC0000' : '1F3864' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [new TextRun({ text: currentDate, font: 'Arial', size: 20, color: '888888' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      }),
      new Paragraph({ children: [new PageBreak()] })
    );

    // ── SECTION HELPER ────────────────────────────────────────────────────────
    const sectionHead = (text) => new Paragraph({
      children: [new TextRun({ text, font: 'Arial', size: 28, bold: true, color: '1F3864' })],
      spacing: { before: 320, after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C9A84C', space: 1 } }
    });

    const body = (text, opts = {}) => new Paragraph({
      children: [new TextRun({ text: String(text || ''), font: 'Arial', size: 22, color: opts.color || '222222', bold: opts.bold, italics: opts.italics })],
      spacing: { after: opts.after || 140, line: 276 }
    });

    const bullet = (text) => new Paragraph({
      children: [new TextRun({ text: String(text || ''), font: 'Arial', size: 22 })],
      numbering: { reference: 'hgi-bullets', level: 0 },
      spacing: { after: 100, line: 276 }
    });

    // ── SECTION 1: OPPORTUNITY AT A GLANCE ───────────────────────────────────
    children.push(sectionHead('1. OPPORTUNITY AT A GLANCE'));

    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [2400, 4560, 1200, 1200],
      rows: [
        new TableRow({ children: [
          labelCell('Agency / Client', 2400),
          cell(agency, 4560, { bold: true, size: 24 }),
          labelCell('OPI Score', 1200),
          cell(`${opi}/100`, 1200, { bold: true, color: opi >= 75 ? '1E7C34' : opi >= 60 ? 'E07B00' : 'CC0000', size: 24 })
        ]}),
        new TableRow({ children: [
          labelCell('Opportunity', 2400),
          cell(title, 4560),
          labelCell('Pwin', 1200),
          cell(pwin !== null ? `${pwin}%` : '—', 1200, { bold: true, color: pwin >= 70 ? '1E7C34' : pwin >= 50 ? 'E07B00' : 'CC0000' })
        ]}),
        new TableRow({ children: [
          labelCell('Vertical', 2400),
          cell((opp.vertical || '').toUpperCase(), 4560),
          labelCell('Recommendation', 1200),
          cell(recommendation, 1200, { bold: true, color: recColor })
        ]}),
        new TableRow({ children: [
          labelCell('Est. Value', 2400),
          cell(opp.estimated_value || 'Not specified', 4560),
          labelCell('Stage', 1200),
          cell(opp.stage || 'Identified', 1200)
        ]}),
        new TableRow({ children: [
          labelCell('Deadline', 2400),
          cell(deadline, 4560, { color: daysLeft && daysLeft < 7 ? 'CC0000' : '222222', bold: daysLeft && daysLeft < 7 }),
          labelCell('Days Left', 1200),
          cell(daysLeft ? `${daysLeft}d` : '—', 1200, { bold: true, color: daysLeft && daysLeft < 7 ? 'CC0000' : '222222' })
        ]}),
        new TableRow({ children: [
          labelCell('Source', 2400),
          cell(opp.source || 'Central Bidding', 4560),
          labelCell('Priority', 1200),
          cell(tier, 1200)
        ]})
      ]
    }));

    children.push(new Paragraph({ spacing: { after: 320 }, children: [] }));

    // ── SECTION 2: BID / NO-BID DECISION ─────────────────────────────────────
    children.push(sectionHead('2. BID / NO-BID DECISION'));

    // Big recommendation box
    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [9360],
      rows: [new TableRow({ children: [new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: `RECOMMENDATION: ${recommendation}`, font: 'Arial', size: 36, bold: true, color: recColor })],
            alignment: AlignmentType.CENTER, spacing: { before: 160, after: 80 }
          }),
          new Paragraph({
            children: [new TextRun({ text: pwin !== null ? `Win Probability: ${pwin}%  ·  OPI: ${opi}/100` : `OPI: ${opi}/100`, font: 'Arial', size: 24, color: '555555' })],
            alignment: AlignmentType.CENTER, spacing: { after: 160 }
          })
        ],
        width: { size: 9360, type: WidthType.DXA },
        shading: { fill: recommendation === 'GO' ? 'E8F5E9' : recommendation === 'NO-BID' ? 'FFEBEE' : 'FFF8E1', type: ShadingType.CLEAR },
        borders, margins: { top: 120, bottom: 120, left: 200, right: 200 }
      })})]
    }));

    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

    if (opp.capture_action) {
      // Extract just the decision justification text (skip the first PWIN line)
      const captureLines = opp.capture_action.split('\n').filter(l => l.trim() && !/^PWIN:/i.test(l.trim()));
      captureLines.forEach(line => {
        const t = line.trim();
        if (!t) return;
        if (t.startsWith('**') && t.endsWith('**')) {
          children.push(body(t.replace(/\*\*/g, ''), { bold: true }));
        } else if (t.startsWith('- ') || t.startsWith('• ')) {
          children.push(bullet(t.substring(2)));
        } else {
          children.push(body(t));
        }
      });
    } else {
      children.push(body('Winnability assessment not yet generated. Run Winnability Scoring module.', { italics: true, color: '888888' }));
    }

    // ── SECTION 3: SCOPE SUMMARY ──────────────────────────────────────────────
    children.push(sectionHead('3. WHAT ARE WE BIDDING ON?'));
    if (opp.description) children.push(body(opp.description));
    if (opp.scope_analysis) {
      // Pull just the first ~600 chars of scope analysis (the summary)
      const scopeText = opp.scope_analysis.replace(/^#.*\n/gm, '').replace(/\*\*/g, '').trim();
      const scopeLines = scopeText.split('\n').filter(l => l.trim()).slice(0, 12);
      scopeLines.forEach(l => {
        const t = l.trim();
        if (t.startsWith('- ') || t.startsWith('• ')) children.push(bullet(t.substring(2)));
        else if (t) children.push(body(t));
      });
    }

    // ── SECTION 4: FINANCIAL PICTURE ─────────────────────────────────────────
    children.push(sectionHead('4. FINANCIAL PICTURE'));
    if (opp.financial_analysis) {
      // Extract key financial lines only — not the full analysis
      const finLines = opp.financial_analysis.split('\n').filter(l => l.trim());
      let inKeySection = false;
      let lineCount = 0;
      finLines.forEach(line => {
        const t = line.trim();
        if (!t || lineCount > 20) return;
        // Include section headers and key lines, skip markdown noise
        if (t.startsWith('## ') || t.startsWith('### ')) {
          const heading = t.replace(/^#+\s*/, '');
          // Only include key financial sections
          if (/VALUE|STAFFING|COST|PROFIT|PRICE.TO.WIN|RECOMMENDATION|PURSUIT|REVENUE/i.test(heading)) {
            inKeySection = true;
            children.push(new Paragraph({
              children: [new TextRun({ text: heading, font: 'Arial', size: 24, bold: true, color: '2E5DA6' })],
              spacing: { before: 200, after: 100 }
            }));
          } else {
            inKeySection = false;
          }
        } else if (inKeySection) {
          if (t.startsWith('- ') || t.startsWith('• ') || t.startsWith('|')) {
            children.push(bullet(t.replace(/^[-•|]\s*/, '').replace(/\|/g, ' | ')));
          } else if (t && !t.startsWith('---')) {
            children.push(body(t.replace(/\*\*/g, '')));
          }
          lineCount++;
        }
      });
    } else {
      children.push(body('Financial analysis not yet generated. Run Financial Pricing module.', { italics: true, color: '888888' }));
    }

    // ── SECTION 5: COMPETITIVE INTELLIGENCE ──────────────────────────────────
    children.push(sectionHead('5. COMPETITIVE LANDSCAPE & WIN STRATEGY'));
    if (opp.research_brief) {
      const resLines = opp.research_brief.split('\n').filter(l => l.trim());
      let inSection = false;
      let lineCount = 0;
      resLines.forEach(line => {
        const t = line.trim();
        if (!t || lineCount > 30) return;
        if (t.startsWith('## ') || t.startsWith('### ')) {
          const heading = t.replace(/^#+\s*/, '');
          if (/COMPETITIVE|WIN STRATEGY|RED FLAG|ACTION|RELATIONSHIP|DIFFERENTIATOR/i.test(heading)) {
            inSection = true;
            children.push(new Paragraph({
              children: [new TextRun({ text: heading, font: 'Arial', size: 24, bold: true, color: '2E5DA6' })],
              spacing: { before: 200, after: 100 }
            }));
          } else {
            inSection = false;
          }
        } else if (inSection) {
          const clean = t.replace(/\*\*/g, '').replace(/✅|❌|🔴|🟡|🟢/g, '').trim();
          if (clean.startsWith('- ') || clean.startsWith('• ')) {
            children.push(bullet(clean.substring(2)));
          } else if (clean && !clean.startsWith('---')) {
            children.push(body(clean));
          }
          lineCount++;
        }
      });
    } else {
      children.push(body('Research brief not yet generated. Run Research & Analysis module.', { italics: true, color: '888888' }));
    }

    // ── SECTION 6: REQUIRED ACTIONS ──────────────────────────────────────────
    children.push(sectionHead('6. REQUIRED ACTIONS & NEXT STEPS'));

    // Extract action plan from research_brief if available
    let actionsFound = false;
    if (opp.research_brief) {
      const resLines = opp.research_brief.split('\n');
      let inActions = false;
      resLines.forEach(line => {
        const t = line.trim();
        if (/ACTION PLAN|NEXT STEPS|48.HOUR|IMMEDIATE/i.test(t)) { inActions = true; actionsFound = true; return; }
        if (inActions && (t.startsWith('## ') || t.startsWith('### ')) && !/ACTION|STEPS|HOUR/i.test(t)) inActions = false;
        if (inActions && t) {
          const clean = t.replace(/\*\*/g, '').trim();
          if (clean.startsWith('- ') || clean.startsWith('• ') || /^\d+\./.test(clean)) {
            children.push(bullet(clean.replace(/^[-•\d.]+\s*/, '')));
          } else if (clean && !clean.startsWith('#')) {
            children.push(body(clean));
          }
        }
      });
    }

    if (!actionsFound) {
      // Generate default actions based on deadline urgency
      const defaultActions = daysLeft && daysLeft < 14
        ? ['URGENT: Submit proposal by ' + deadline, 'Assign proposal lead immediately', 'Gather team bios, COI, SAM.gov registration printout', 'Run Financial Pricing module to confirm bid number', 'Review and finalize win themes']
        : ['Generate Research & Analysis brief for competitive intelligence', 'Run Winnability Scoring to confirm GO/NO-BID decision', 'Run Financial Pricing module — build cost model and PTW', 'Schedule internal pursuit review with Lou and Candy', 'Identify proposal lead and assign team'];
      defaultActions.forEach(a => children.push(bullet(a)));
    }

    // ── SECTION 7: OUTSTANDING REQUIREMENTS ──────────────────────────────────
    children.push(sectionHead('7. OUTSTANDING ITEMS FOR SUBMISSION'));

    const standardItems = [
      'Team member resumes / CVs (all key personnel)',
      'Certificates of Insurance (COI)',
      'SAM.gov registration printout (active registration)',
      'Corporate profile pages / capability statement',
      'Past performance references (agency name, contact, project value)',
      'Signed authorization / cover letter',
      'Louisiana business registration / license'
    ];
    children.push(body('Standard requirements for most Louisiana state/local procurements:'));
    standardItems.forEach(item => children.push(bullet(item)));

    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

    // ── INTELLIGENCE STATUS TABLE ─────────────────────────────────────────────
    children.push(sectionHead('8. SYSTEM INTELLIGENCE STATUS'));

    const statusRow = (label, status, detail) => new TableRow({ children: [
      labelCell(label, 2400),
      cell(status, 1440, { bold: true, color: status === 'COMPLETE' ? '1E7C34' : status === 'PARTIAL' ? 'E07B00' : 'CC0000' }),
      cell(detail, 5520)
    ]});

    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [2400, 1440, 5520],
      rows: [
        new TableRow({ children: [labelCell('MODULE', 2400), labelCell('STATUS', 1440), labelCell('DETAILS', 5520)] }),
        statusRow('Scope Analysis', opp.scope_analysis ? 'COMPLETE' : 'NOT RUN', opp.scope_analysis ? 'Scope decomposition complete' : 'Run Orchestrator'),
        statusRow('Financial Analysis', opp.financial_analysis ? 'COMPLETE' : 'NOT RUN', opp.financial_analysis ? 'Cost model and PTW available' : 'Run Financial Pricing module'),
        statusRow('Research Brief', opp.research_brief ? 'COMPLETE' : 'NOT RUN', opp.research_brief ? 'Competitive intelligence brief available' : 'Run Research & Analysis module'),
        statusRow('Winnability Score', opp.capture_action ? 'COMPLETE' : 'NOT RUN', opp.capture_action ? `Recommendation: ${recommendation}  ·  Pwin: ${pwin !== null ? pwin + '%' : 'N/A'}` : 'Run Winnability Scoring module'),
        statusRow('Staffing Plan', opp.staffing_plan ? 'COMPLETE' : 'NOT RUN', opp.staffing_plan ? 'Staffing plan available' : 'Run Orchestrator step 5')
      ]
    }));

    children.push(new Paragraph({ spacing: { after: 240 }, children: [] }));
    children.push(body(`Generated by HGI AI Capture System  ·  ${currentDate}  ·  CONFIDENTIAL`, { color: '888888', italics: true }));

    // ── DOCUMENT ASSEMBLY ─────────────────────────────────────────────────────
    const doc = new Document({
      numbering: {
        config: [{
          reference: 'hgi-bullets',
          levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
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
    const safeAgency = agency.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
    const filename = `HGI_Decision_Brief_${safeAgency}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (error) {
    console.error('export-opportunity error:', error);
    res.status(500).json({ error: error.message });
  }
}
```